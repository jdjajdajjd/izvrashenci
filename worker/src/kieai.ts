import type { InfoStructured, ParsedReport, Relatives } from './types';

// ─── Prompt ───────────────────────────────────────────────────────────────────

const PROMPT = (text: string) => `Ты — система извлечения данных. Из текста ниже извлеки поля и верни ТОЛЬКО валидный JSON без markdown и пояснений.

Правила:
- Берёшь ТОЛЬКО то, что явно написано. Не придумываешь.
- Если поле отсутствует — null.
- birth_date → формат ДД.ММ.ГГГГ
- phone → формат +7XXXXXXXXXX
- username → без @
- В info.address_1/2/3 клади физические адреса (не прописку). Если адресов больше — объединяй в address_3.
- В info.registration — только прописка/регистрация.
- Паспорт — серия и номер вместе.

Формат ответа (строго этот JSON):
{
  "full_name": "...",
  "birth_date": "...",
  "city": "...",
  "phone": "...",
  "username": "...",
  "suspected_of": "...",
  "relatives": {
    "mother": "...", "father": "...",
    "brother_1": "...", "sister_1": "...",
    "grandma_1": "...", "grandpa_1": "..."
  },
  "info": {
    "address_1": "...",
    "address_2": "...",
    "address_3": "...",
    "registration": "...",
    "passport": "...",
    "snils": "...",
    "inn": "...",
    "car": "...",
    "social_media": "...",
    "email": "...",
    "ip": "...",
    "country": "...",
    "driver_license": "...",
    "birthplace": "...",
    "other": "..."
  }
}

Текст документа:
---
${text.slice(0, 6000)}
---`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJson(raw: string): ParsedReport {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`no JSON in: ${raw.slice(0, 100)}`);
  const obj = JSON.parse(match[0]) as Record<string, unknown>;

  const str = (v: unknown): string | undefined => {
    if (typeof v !== 'string') return undefined;
    const t = v.trim();
    return t && t.toLowerCase() !== 'null' ? t : undefined;
  };

  const result: ParsedReport = {};
  if (str(obj.full_name))    result.full_name    = str(obj.full_name);
  if (str(obj.birth_date))   result.birth_date   = str(obj.birth_date);
  if (str(obj.city))         result.city         = str(obj.city);
  if (str(obj.phone))        result.phone        = str(obj.phone);
  if (str(obj.username))     result.username     = str(obj.username);
  if (str(obj.suspected_of)) result.suspected_of = str(obj.suspected_of);
  if (str(obj.info_text))    result.info_text    = str(obj.info_text);

  if (obj.relatives && typeof obj.relatives === 'object') {
    const rel = obj.relatives as Record<string, unknown>;
    const out: Relatives = {};
    for (const k of ['mother','father','brother_1','sister_1','grandma_1','grandpa_1'] as (keyof Relatives)[]) {
      const v = str(rel[k]);
      if (v) out[k] = v;
    }
    if (Object.keys(out).length) result.relatives = out;
  }

  if (obj.info && typeof obj.info === 'object') {
    const raw = obj.info as Record<string, unknown>;
    const out: InfoStructured = {};
    for (const k of [
      'address_1','address_2','address_3','registration','passport','snils','inn',
      'car','social_media','email','ip','country','driver_license','birthplace','other',
    ] as (keyof InfoStructured)[]) {
      const v = str(raw[k]);
      if (v) out[k] = v;
    }
    if (Object.keys(out).length) result.info = out;
  }

  return result;
}

async function callModel(endpoint: string, model: string, userText: string, apiKey: string): Promise<string> {
  const res = await fetch(`https://api.kie.ai${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [{ role: 'user', content: userText }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`kie.ai ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    content?:  Array<{ text?: string }>;
  };
  // OpenAI-compatible (Gemini)
  if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
  // Anthropic-compatible (Claude)
  if (data.content?.[0]?.text) return data.content[0].text;
  throw new Error('empty response');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Try multiple models in order until one succeeds.
 * textContent = already-extracted text from the PDF/file.
 */
export async function parseWithAI(textContent: string, apiKey: string): Promise<ParsedReport> {
  const prompt = PROMPT(textContent);

  const models: Array<{ endpoint: string; model: string }> = [
    { endpoint: '/gemini-2.5-flash/v1/chat/completions', model: 'gemini-2.5-flash' },
    { endpoint: '/gemini-2.5-pro/v1/chat/completions',   model: 'gemini-2.5-pro' },
    { endpoint: '/claude/v1/messages',                   model: 'claude-haiku-4-5' },
    { endpoint: '/claude/v1/messages',                   model: 'claude-sonnet-4-5' },
  ];

  const errors: string[] = [];
  for (const { endpoint, model } of models) {
    try {
      const raw = await callModel(endpoint, model, prompt, apiKey);
      return parseJson(raw);
    } catch (e) {
      errors.push(`${model}: ${e}`);
    }
  }
  throw new Error(errors.join(' | '));
}
