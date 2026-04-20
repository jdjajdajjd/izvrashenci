import type { ParsedReport, Relatives } from './types';

// ─── Base64 helper ────────────────────────────────────────────────────────────

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

// ─── Claude via kie.ai ────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Ты — система извлечения данных из документов досье.
Твоя задача — извлечь структурированную информацию из предоставленного документа.
Отвечай ТОЛЬКО валидным JSON, без пояснений, markdown-блоков или лишнего текста.`;

const USER_PROMPT = `Извлеки из этого документа следующие поля. Верни ТОЛЬКО JSON-объект.

Правила:
- Извлекай ТОЛЬКО то, что явно написано в документе
- НЕ придумывай и НЕ угадывай значения
- Если поле отсутствует — ставь null
- Дату рождения переводи в формат ДД.ММ.ГГГГ
- Телефон указывай в формате +7XXXXXXXXXX
- Username без символа @

Формат ответа:
{
  "full_name": "Фамилия Имя Отчество или null",
  "birth_date": "ДД.ММ.ГГГГ или null",
  "city": "Город или null",
  "phone": "Телефон или null",
  "username": "telegram_username или null",
  "suspected_of": "В чём подозревается или null",
  "relatives": {
    "mother": "ФИО матери или null",
    "father": "ФИО отца или null",
    "brother_1": "ФИО брата или null",
    "sister_1": "ФИО сестры или null",
    "grandma_1": "ФИО бабушки или null",
    "grandpa_1": "ФИО дедушки или null"
  },
  "info_text": "Прочая важная информация одной строкой: адрес, паспорт, СНИЛС, ИНН, авто, соцсети и т.д. или null"
}`;

interface ClaudeResponse {
  content?: Array<{ type: string; text: string }>;
  error?: { message: string };
}

export async function parseWithAI(buf: ArrayBuffer, mimeType: string, apiKey: string): Promise<ParsedReport> {
  const isPdf = mimeType.includes('pdf');

  // Build content array for Claude
  const content: unknown[] = [];

  if (isPdf) {
    content.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: toBase64(buf),
      },
    });
  } else {
    // Plain text
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    content.push({ type: 'text', text: `Документ:\n\n${text}` });
  }

  content.push({ type: 'text', text: USER_PROMPT });

  const res = await fetch('https://api.kie.ai/claude/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`kie.ai error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as ClaudeResponse;
  const raw  = data.content?.[0]?.text ?? '';

  // Extract JSON from response (strip possible markdown code fences)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in response: ${raw.slice(0, 200)}`);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid JSON: ${jsonMatch[0].slice(0, 200)}`);
  }

  // Convert to ParsedReport, stripping nulls
  const result: ParsedReport = {};

  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim() : undefined;

  if (str(parsed.full_name))    result.full_name    = str(parsed.full_name);
  if (str(parsed.birth_date))   result.birth_date   = str(parsed.birth_date);
  if (str(parsed.city))         result.city         = str(parsed.city);
  if (str(parsed.phone))        result.phone        = str(parsed.phone);
  if (str(parsed.username))     result.username     = str(parsed.username);
  if (str(parsed.suspected_of)) result.suspected_of = str(parsed.suspected_of);
  if (str(parsed.info_text))    result.info_text    = str(parsed.info_text);

  if (parsed.relatives && typeof parsed.relatives === 'object') {
    const rel = parsed.relatives as Record<string, unknown>;
    const relatives: Relatives = {};
    const relKeys: (keyof Relatives)[] = ['mother','father','brother_1','sister_1','grandma_1','grandpa_1'];
    for (const k of relKeys) {
      const v = str(rel[k]);
      if (v) relatives[k] = v;
    }
    if (Object.keys(relatives).length) result.relatives = relatives;
  }

  return result;
}
