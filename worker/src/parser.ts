import type { ParsedReport, Relatives } from './types';

/**
 * Extracts raw text from a PDF binary.
 * Works in Cloudflare Workers without Node.js dependencies.
 */
function extractPdfText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  // Try UTF-8 first
  try {
    const str = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (str.includes('ФИО') || str.includes('Телефон') || str.includes('рождения')) return str;
  } catch { /* not valid utf-8 */ }

  // Extract printable runs from binary (covers latin1-encoded PDFs)
  const latin = new TextDecoder('latin1').decode(buffer);
  const chunks: string[] = [];
  let run = '';
  for (let i = 0; i < latin.length; i++) {
    const c = latin.charCodeAt(i);
    if ((c >= 32 && c < 127) || c === 10 || c === 13) {
      run += latin[i];
    } else {
      if (run.length > 4) chunks.push(run.trim());
      run = '';
    }
  }
  if (run.length > 4) chunks.push(run.trim());

  // Also try CP1251 decoding (Cyrillic)
  const cyrillic = decodeCp1251(bytes);
  if (cyrillic.includes('ФИО') || cyrillic.includes('Телефон')) return cyrillic;

  return chunks.join('\n');
}

function decodeCp1251(bytes: Uint8Array): string {
  const cp1251 = [
    0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,
    32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,
    64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,
    96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,
    1026,1027,8218,1107,8222,8230,8224,8225,8364,8240,1033,8249,1034,1036,1035,1039,
    1106,8216,8217,8220,8221,8226,8211,8212,8364,8482,1113,8250,1114,1116,1115,1119,
    160,1038,1118,1032,164,1168,166,167,1025,169,1028,171,172,173,174,1031,
    176,177,1030,1110,1169,181,182,183,1105,8470,1108,187,1112,1029,1109,1111,
    1040,1041,1042,1043,1044,1045,1046,1047,1048,1049,1050,1051,1052,1053,1054,1055,
    1056,1057,1058,1059,1060,1061,1062,1063,1064,1065,1066,1067,1068,1069,1070,1071,
    1072,1073,1074,1075,1076,1077,1078,1079,1080,1081,1082,1083,1084,1085,1086,1087,
    1088,1089,1090,1091,1092,1093,1094,1095,1096,1097,1098,1099,1100,1101,1102,1103,
  ];
  let result = '';
  for (const b of bytes) {
    result += b < 128 ? String.fromCharCode(b) : String.fromCharCode(cp1251[b - 128] ?? b);
  }
  return result;
}

/**
 * Parses a Sherlock / generic person-report text into structured fields.
 */
export function parseReport(buffer: ArrayBuffer, mimeType: string): ParsedReport {
  let text: string;

  if (mimeType.includes('pdf')) {
    text = extractPdfText(buffer);
  } else {
    // Plain text / txt
    text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  }

  return parseText(text);
}

export function parseText(text: string): ParsedReport {
  const result: ParsedReport = {};
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function firstMatch(patterns: RegExp[]): string | undefined {
    for (const p of patterns) {
      const m = text.match(p);
      if (m?.[1]) return m[1].trim().replace(/\s+/g, ' ');
    }
    return undefined;
  }

  // ─── Full name ──────────────────────────────────────────────────────────────
  result.full_name = firstMatch([
    /ФИО[:\s—]+([А-ЯЁа-яёA-Za-z][^\n,;]{4,60})/,
    /Имя[:\s—]+([А-ЯЁа-яёA-Za-z][^\n,;]{4,60})/,
    /Владелец[:\s—]+([А-ЯЁ][а-яё]+\s[А-ЯЁ][а-яё]+(?:\s[А-ЯЁ][а-яё]+)?)/,
  ]);

  // ─── Birth date ─────────────────────────────────────────────────────────────
  result.birth_date = firstMatch([
    /Дата рождения[:\s—]+(\d{2}[.\-/]\d{2}[.\-/]\d{4})/,
    /Дата рожд[^\s]*[:\s—]+(\d{2}[.\-/]\d{2}[.\-/]\d{4})/,
    /ДР[:\s—]+(\d{2}[.\-/]\d{2}[.\-/]\d{4})/,
  ]);
  if (result.birth_date) {
    result.birth_date = result.birth_date.replace(/[\/\-]/g, '.');
  }

  // ─── Phone ──────────────────────────────────────────────────────────────────
  result.phone = firstMatch([
    /Телефон[:\s—]+([\+7\d][\d\s\-\(\)]{6,17})/,
    /Номер телефона[:\s—]+([\+7\d][\d\s\-\(\)]{6,17})/,
    /Мобильный[:\s—]+([\+7\d][\d\s\-\(\)]{6,17})/,
  ]);
  if (!result.phone) {
    // Try to find phone pattern directly in text
    const phoneM = text.match(/(?<!\d)((?:\+7|8)[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2})(?!\d)/);
    if (phoneM) result.phone = phoneM[1].trim();
  }

  // ─── City ───────────────────────────────────────────────────────────────────
  result.city = firstMatch([
    /Город[:\s—]+([А-ЯЁа-яё][^\n,;]{2,40})/,
    /Регион[:\s—]+([А-ЯЁа-яё][^\n,;]{2,40})/,
    /Населённый пункт[:\s—]+([А-ЯЁа-яё][^\n,;]{2,40})/,
  ]);

  // ─── Username ───────────────────────────────────────────────────────────────
  result.username = firstMatch([
    /Telegram[:\s@—]+@?([a-zA-Z0-9_]{4,32})/i,
    /Username[:\s@—]+@?([a-zA-Z0-9_]{4,32})/i,
    /@([a-zA-Z0-9_]{4,32})/,
  ]);

  // ─── Relatives ──────────────────────────────────────────────────────────────
  const relatives: Relatives = {};

  const relPatterns: Array<[keyof Relatives, RegExp[]]> = [
    ['mother',   [/Мать[:\s—]+([А-ЯЁ][а-яёА-ЯЁ\s\-]+)/, /Мама[:\s—]+([А-ЯЁ][а-яёА-ЯЁ\s\-]+)/]],
    ['father',   [/Отец[:\s—]+([А-ЯЁ][а-яёА-ЯЁ\s\-]+)/, /Папа[:\s—]+([А-ЯЁ][а-яёА-ЯЁ\s\-]+)/]],
    ['brother_1',[/Брат[:\s—]+([А-ЯЁ][а-яёА-ЯЁ\s\-]+)/]],
    ['sister_1', [/Сестра[:\s—]+([А-ЯЁ][а-яёА-ЯЁ\s\-]+)/]],
    ['grandma_1',[/Бабушка[:\s—]+([А-ЯЁ][а-яёА-ЯЁ\s\-]+)/]],
    ['grandpa_1',[/Дедушка[:\s—]+([А-ЯЁ][а-яёА-ЯЁ\s\-]+)/]],
  ];

  for (const [key, patterns] of relPatterns) {
    const val = firstMatch(patterns);
    if (val) relatives[key] = val.replace(/\s{2,}/g, ' ').trim();
  }
  if (Object.keys(relatives).length) result.relatives = relatives;

  // ─── Extra info (everything else) ───────────────────────────────────────────
  const extraSections: string[] = [];

  // Social networks
  const vkM = text.match(/(?:ВКонтакте|ВК|VK)[:\s—]+(https?:\/\/[^\s]+|vk\.com[^\s]+)/i);
  if (vkM) extraSections.push(`ВКонтакте: ${vkM[1].trim()}`);

  const okM = text.match(/Одноклассники[:\s—]+(https?:\/\/[^\s]+|ok\.ru[^\s]+)/i);
  if (okM) extraSections.push(`Одноклассники: ${okM[1].trim()}`);

  // Address
  const addrM = text.match(/Адрес[:\s—]+([^\n]{5,120})/);
  if (addrM) extraSections.push(`Адрес: ${addrM[1].trim()}`);

  // Passport
  const passM = text.match(/Паспорт[:\s—]+([^\n]{5,60})/);
  if (passM) extraSections.push(`Паспорт: ${passM[1].trim()}`);

  // SNILS
  const snilsM = text.match(/СНИЛС[:\s—]+([\d\s\-]{10,14})/);
  if (snilsM) extraSections.push(`СНИЛС: ${snilsM[1].trim()}`);

  // INN
  const innM = text.match(/ИНН[:\s—]+(\d{10,12})/);
  if (innM) extraSections.push(`ИНН: ${innM[1].trim()}`);

  // Vehicle
  const carM = text.match(/(?:Автомобиль|ТС|Транспорт)[:\s—]+([^\n]{5,80})/i);
  if (carM) extraSections.push(`Транспорт: ${carM[1].trim()}`);

  // Email
  const emailM = text.match(/E?mail[:\s—]+([\w.\-+]+@[\w.\-]+\.\w+)/i);
  if (emailM) extraSections.push(`Email: ${emailM[1].trim()}`);

  if (extraSections.length) {
    result.info_text = extraSections.join('\n');
  }

  // If almost nothing was parsed, store raw text as info
  const filled = Object.values(result).filter(Boolean).length;
  if (filled <= 1 && text.length > 50) {
    result.info_text = text.slice(0, 3000);
  }

  return result;
}
