import type { ParsedReport, Relatives } from './types';

// ─── Zlib decompression (FlateDecode) ────────────────────────────────────────

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  // FlateDecode = zlib format → 'deflate'; fallback to raw deflate
  for (const fmt of ['deflate', 'deflate-raw'] as CompressionFormat[]) {
    try {
      const ds     = new DecompressionStream(fmt);
      const writer = ds.writable.getWriter();
      const reader = ds.readable.getReader();
      await writer.write(data);
      await writer.close();
      const parts: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) parts.push(value);
      }
      if (!parts.length) continue;
      const len = parts.reduce((s, p) => s + p.length, 0);
      const out  = new Uint8Array(len);
      let off = 0;
      for (const p of parts) { out.set(p, off); off += p.length; }
      return out;
    } catch { /* try next format */ }
  }
  throw new Error('inflate failed');
}

// ─── CP1251 decoder ───────────────────────────────────────────────────────────

function decodeCp1251(bytes: Uint8Array): string {
  const map = [
    1026,1027,8218,1107,8222,8230,8224,8225,8364,8240,1033,8249,1034,1036,1035,1039,
    1106,8216,8217,8220,8221,8226,8211,8212,8364,8482,1113,8250,1114,1116,1115,1119,
    160,1038,1118,1032,164,1168,166,167,1025,169,1028,171,172,173,174,1031,
    176,177,1030,1110,1169,181,182,183,1105,8470,1108,187,1112,1029,1109,1111,
    1040,1041,1042,1043,1044,1045,1046,1047,1048,1049,1050,1051,1052,1053,1054,1055,
    1056,1057,1058,1059,1060,1061,1062,1063,1064,1065,1066,1067,1068,1069,1070,1071,
    1072,1073,1074,1075,1076,1077,1078,1079,1080,1081,1082,1083,1084,1085,1086,1087,
    1088,1089,1090,1091,1092,1093,1094,1095,1096,1097,1098,1099,1100,1101,1102,1103,
  ];
  let s = '';
  for (const b of bytes) s += b < 128 ? String.fromCharCode(b) : String.fromCharCode(map[b - 128] ?? b);
  return s;
}

// ─── Extract human-readable text from a decompressed PDF content stream ───────

function streamToText(bytes: Uint8Array): string {
  const latin = new TextDecoder('latin1').decode(bytes);
  const parts: string[] = [];
  let i = 0;

  while (i < latin.length) {
    // ── Literal string: (text) ──────────────────────────────────────────────
    if (latin[i] === '(') {
      i++;
      const raw: number[] = [];
      while (i < latin.length && latin[i] !== ')') {
        if (latin[i] === '\\') {
          i++;
          if (i >= latin.length) break;
          const c = latin[i];
          if (c >= '0' && c <= '7') {
            // Octal escape \NNN
            let oct = c; i++;
            if (i < latin.length && latin[i] >= '0' && latin[i] <= '7') { oct += latin[i]; i++; }
            if (i < latin.length && latin[i] >= '0' && latin[i] <= '7') { oct += latin[i]; i++; }
            raw.push(parseInt(oct, 8));
            continue;
          }
          // Other escape: \n \r \t \\ \( \)
          const escMap: Record<string, number> = { n: 10, r: 13, t: 9 };
          raw.push(escMap[c] ?? latin.charCodeAt(i));
          i++;
        } else {
          raw.push(latin.charCodeAt(i) & 0xFF);
          i++;
        }
      }
      i++; // skip ')'
      if (raw.length > 0) {
        const arr = new Uint8Array(raw);
        // Try UTF-16BE (BOM: 0xFE 0xFF)
        if (arr[0] === 0xFE && arr[1] === 0xFF) {
          try {
            const s = new TextDecoder('utf-16be').decode(arr.slice(2));
            if (s.trim()) { parts.push(s); continue; }
          } catch { /* fall through */ }
        }
        // Try CP1251
        const s = decodeCp1251(arr).replace(/[\x00-\x08\x0e-\x1f\x7f]/g, '');
        if (s.trim()) parts.push(s);
      }

    // ── Hex string: <hexdata> ───────────────────────────────────────────────
    } else if (latin[i] === '<' && i + 1 < latin.length && latin[i + 1] !== '<') {
      i++;
      let hex = '';
      while (i < latin.length && latin[i] !== '>') {
        if (/[0-9a-fA-F]/.test(latin[i])) hex += latin[i];
        i++;
      }
      i++; // skip '>'
      if (hex.length >= 4 && hex.length % 2 === 0) {
        const hb = new Uint8Array(hex.length >> 1);
        for (let k = 0; k < hb.length; k++) hb[k] = parseInt(hex.slice(k << 1, (k << 1) + 2), 16);
        if (hb[0] === 0xFE && hb[1] === 0xFF) {
          try {
            const s = new TextDecoder('utf-16be').decode(hb.slice(2)).replace(/[\x00-\x08\x0e-\x1f]/g, '');
            if (s.trim()) parts.push(s);
          } catch { /* ignore */ }
        } else {
          const s = decodeCp1251(hb).replace(/[\x00-\x08\x0e-\x1f]/g, '');
          if (s.trim()) parts.push(s);
        }
      }

    } else {
      i++;
    }
  }

  return parts.join('');
}

// ─── Main PDF text extractor ──────────────────────────────────────────────────

async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);

  // 1. Plain UTF-8 (uncompressed PDF with Cyrillic)
  try {
    const s = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (s.includes('ФИО') || s.includes('Телефон') || s.includes('рождения')) return s;
  } catch { /* binary */ }

  // 2. Direct CP1251 (uncompressed with win1251 encoding)
  const cp = decodeCp1251(bytes);
  if (cp.includes('ФИО') || cp.includes('Телефон') || cp.includes('рождения')) return cp;

  // 3. Decompress FlateDecode streams
  const latin = new TextDecoder('latin1').decode(buffer); // 1-to-1 byte→char
  const allTexts: string[] = [];

  // Scan for all `stream\n` or `stream\r\n` markers
  const streamRe = /stream\r?\n/g;
  let sm: RegExpExecArray | null;

  while ((sm = streamRe.exec(latin)) !== null) {
    const dataStart = sm.index + sm[0].length;

    // Inspect the preceding ~600 chars for the stream's object dictionary
    const lookback = latin.slice(Math.max(0, sm.index - 600), sm.index);

    // Must be FlateDecode
    if (!/\/Filter\s*\/FlateDecode/.test(lookback) &&
        !/\/Filter\s*\[([^\]]*\s)?FlateDecode/.test(lookback)) continue;

    // Skip image XObjects (binary pixel data, not text)
    if (/\/Subtype\s*\/Image/.test(lookback)) continue;

    // Find end of stream
    const endIdx = latin.indexOf('\nendstream', dataStart);
    if (endIdx < 0) continue;

    // Re-encode stream section from latin1 chars back to bytes
    const streamLen   = endIdx - dataStart;
    const streamBytes = new Uint8Array(streamLen);
    for (let k = 0; k < streamLen; k++) streamBytes[k] = latin.charCodeAt(dataStart + k) & 0xFF;

    try {
      const decompressed = await inflate(streamBytes);
      const text = streamToText(decompressed);
      if (text.trim()) allTexts.push(text);
    } catch { /* corrupt or non-deflate stream */ }
  }

  if (allTexts.length > 0) return allTexts.join('\n');

  // 4. Fallback: printable ASCII runs (for very old uncompressed PDFs)
  const chunks: string[] = [];
  let run = '';
  for (let i = 0; i < latin.length; i++) {
    const c = latin.charCodeAt(i);
    if ((c >= 32 && c < 127) || c === 10 || c === 13) run += latin[i];
    else { if (run.length > 4) chunks.push(run.trim()); run = ''; }
  }
  if (run.length > 4) chunks.push(run.trim());
  return chunks.join('\n');
}

// ─── Structured TXT preprocessor ─────────────────────────────────────────────

/**
 * For structured .txt reports (with === Section === headers), extract only the
 * most informative sections so the AI prompt stays compact.
 */
export function extractKeyTxtSections(text: string): string {
  if (!text.includes('===')) return text;

  // Find all section positions
  const re = /^=== (.+) ===$/gm;
  const positions: Array<{ header: string; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    positions.push({ header: m[1], start: m.index, end: 0 });
  }
  if (!positions.length) return text;
  for (let i = 0; i < positions.length; i++) {
    positions[i].end = i + 1 < positions.length ? positions[i + 1].start : text.length;
  }

  const ALWAYS: RegExp[] = [
    /Общая сводка/,
    /gosuslugi/i,
    /учет МВД/i,
    /Население России/,
    /Вконтакте/,
    /Telegram/,
    /TikTok/i,
    /Водительские права/,
    /Возможные связи/,
    /Аффилированн/,
    /Телефонные книги/,
    /Мобильный банк/,
  ];
  const FIRST_ONLY = /ОСАГО|Социальный фонд|Доходы физлиц|Результат ПЦР/;

  const seen = new Set<string>();
  const result: string[] = [];

  for (const pos of positions) {
    const body = text.slice(pos.start, pos.end).trim();
    if (ALWAYS.some((r) => r.test(pos.header))) { result.push(body); continue; }
    const key = pos.header.replace(/\s*\d{4}\s*/, '').trim();
    if (FIRST_ONLY.test(pos.header) && !seen.has(key)) { seen.add(key); result.push(body); }
  }

  const out = result.join('\n\n');
  return out || text.slice(0, 12000);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Extract raw text from a file (PDF or plain text). */
export async function extractText(buffer: ArrayBuffer, mimeType: string): Promise<string> {
  if (mimeType.includes('pdf')) return extractPdfText(buffer);
  return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
}

export async function parseReport(buffer: ArrayBuffer, mimeType: string): Promise<ParsedReport> {
  const text = await extractText(buffer, mimeType);
  return parseText(text);
}

export function parseText(text: string): ParsedReport {
  const result: ParsedReport = {};

  function firstMatch(patterns: RegExp[]): string | undefined {
    for (const p of patterns) {
      const m = text.match(p);
      if (m?.[1]) return m[1].trim().replace(/\s+/g, ' ');
    }
    return undefined;
  }

  // ── Full name ───────────────────────────────────────────────────────────────
  result.full_name = firstMatch([
    /ФИО[:\s—]+([А-ЯЁа-яёA-Za-z][^\n,;]{4,60})/,
    /Имя[:\s—]+([А-ЯЁа-яёA-Za-z][^\n,;]{4,60})/,
    /Владелец[:\s—]+([А-ЯЁ][а-яё]+\s[А-ЯЁ][а-яё]+(?:\s[А-ЯЁ][а-яё]+)?)/,
  ]);

  // ── Birth date ──────────────────────────────────────────────────────────────
  result.birth_date = firstMatch([
    /Дата рождения[:\s—]+(\d{2}[.\-/]\d{2}[.\-/]\d{4})/,
    /Дата рожд[^\s]*[:\s—]+(\d{2}[.\-/]\d{2}[.\-/]\d{4})/,
    /ДР[:\s—]+(\d{2}[.\-/]\d{2}[.\-/]\d{4})/,
  ]);
  if (result.birth_date) result.birth_date = result.birth_date.replace(/[\/\-]/g, '.');

  // ── Phone ───────────────────────────────────────────────────────────────────
  result.phone = firstMatch([
    /Телефон[:\s—]+([\+7\d][\d\s\-\(\)]{6,17})/,
    /Номер телефона[:\s—]+([\+7\d][\d\s\-\(\)]{6,17})/,
    /Мобильный[:\s—]+([\+7\d][\d\s\-\(\)]{6,17})/,
  ]);
  if (!result.phone) {
    const m = text.match(/(?<!\d)((?:\+7|8)[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2})(?!\d)/);
    if (m) result.phone = m[1].trim();
  }

  // ── City ────────────────────────────────────────────────────────────────────
  result.city = firstMatch([
    /Город[:\s—]+([А-ЯЁа-яё][^\n,;]{2,40})/,
    /Регион[:\s—]+([А-ЯЁа-яё][^\n,;]{2,40})/,
    /Населённый пункт[:\s—]+([А-ЯЁа-яё][^\n,;]{2,40})/,
  ]);

  // ── Username ────────────────────────────────────────────────────────────────
  result.username = firstMatch([
    /Telegram[:\s@—]+@?([a-zA-Z0-9_]{4,32})/i,
    /Username[:\s@—]+@?([a-zA-Z0-9_]{4,32})/i,
    /@([a-zA-Z0-9_]{4,32})/,
  ]);

  // ── Relatives ───────────────────────────────────────────────────────────────
  const relatives: Relatives = {};
  const relPatterns: Array<[keyof Relatives, RegExp[]]> = [
    ['mother',    [/Мать[:\s—]+([А-ЯЁ][а-яёА-ЯЁ\s\-]+)/, /Мама[:\s—]+([А-ЯЁ][а-яёА-ЯЁ\s\-]+)/]],
    ['father',    [/Отец[:\s—]+([А-ЯЁ][а-яёА-ЯЁ\s\-]+)/, /Папа[:\s—]+([А-ЯЁ][а-яёА-ЯЁ\s\-]+)/]],
    ['brother_1', [/Брат[:\s—]+([А-ЯЁ][а-яёА-ЯЁ\s\-]+)/]],
    ['sister_1',  [/Сестра[:\s—]+([А-ЯЁ][а-яёА-ЯЁ\s\-]+)/]],
    ['grandma_1', [/Бабушка[:\s—]+([А-ЯЁ][а-яёА-ЯЁ\s\-]+)/]],
    ['grandpa_1', [/Дедушка[:\s—]+([А-ЯЁ][а-яёА-ЯЁ\s\-]+)/]],
  ];
  for (const [key, patterns] of relPatterns) {
    const val = firstMatch(patterns);
    if (val) relatives[key] = val.replace(/\s{2,}/g, ' ').trim();
  }
  if (Object.keys(relatives).length) result.relatives = relatives;

  // ── Extra info ──────────────────────────────────────────────────────────────
  const extra: string[] = [];
  const vkM    = text.match(/(?:ВКонтакте|ВК|VK)[:\s—]+(https?:\/\/[^\s]+|vk\.com[^\s]+)/i);
  if (vkM)  extra.push(`ВКонтакте: ${vkM[1].trim()}`);
  const okM    = text.match(/Одноклассники[:\s—]+(https?:\/\/[^\s]+|ok\.ru[^\s]+)/i);
  if (okM)  extra.push(`Одноклассники: ${okM[1].trim()}`);
  const addrM  = text.match(/Адрес[:\s—]+([^\n]{5,120})/);
  if (addrM) extra.push(`Адрес: ${addrM[1].trim()}`);
  const passM  = text.match(/Паспорт[:\s—]+([^\n]{5,60})/);
  if (passM) extra.push(`Паспорт: ${passM[1].trim()}`);
  const snilsM = text.match(/СНИЛС[:\s—]+([\d\s\-]{10,14})/);
  if (snilsM) extra.push(`СНИЛС: ${snilsM[1].trim()}`);
  const innM   = text.match(/ИНН[:\s—]+(\d{10,12})/);
  if (innM)  extra.push(`ИНН: ${innM[1].trim()}`);
  const carM   = text.match(/(?:Автомобиль|ТС|Транспорт)[:\s—]+([^\n]{5,80})/i);
  if (carM)  extra.push(`Транспорт: ${carM[1].trim()}`);
  const emailM = text.match(/E?mail[:\s—]+([\w.\-+]+@[\w.\-]+\.\w+)/i);
  if (emailM) extra.push(`Email: ${emailM[1].trim()}`);
  if (extra.length) result.info_text = extra.join('\n');

  // If almost nothing parsed, store raw text as info
  const filled = Object.values(result).filter(Boolean).length;
  if (filled <= 1 && text.length > 50) result.info_text = text.slice(0, 3000);

  return result;
}
