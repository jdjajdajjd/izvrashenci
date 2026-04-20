import { SupabaseClient } from './supabase';
import type { BotState, Env, InlineKeyboard, MediaSection, MediaType, TelegramUpdate } from './types';

// ─── Section config ────────────────────────────────────────────────────────────

const SECTIONS = [
  { code: 'correspondence', label: '💬 Переписка' },
  { code: 'gallery',        label: '🎞️ Медиа' },
  { code: 'info',           label: 'ℹ️ Информация' },
  { code: 'vk_friends',    label: '👥 Друзья из ВК' },
  { code: 'relatives',     label: '🧬 Родственники' },
] as const;

// ─── Keyboards ─────────────────────────────────────────────────────────────────

const KB_MAIN: InlineKeyboard = {
  inline_keyboard: [
    [{ text: '📋 Создать досье', callback_data: 'create' }],
    [{ text: '📁 Все досье',    callback_data: 'lst' }],
  ],
};

const kbView = (id: number): InlineKeyboard => ({
  inline_keyboard: [
    [{ text: '✏️ Редактировать', callback_data: `e:${id}` }, { text: '📸 Добавить медиа', callback_data: `am:${id}` }],
    [{ text: '👁 Разделы',      callback_data: `sec:${id}` }, { text: '📝 Информация',    callback_data: `inf:${id}` }],
    [{ text: '🔗 Открыть страницу', callback_data: `link:${id}` }],
    [{ text: '⬅️ К списку',    callback_data: 'lst' }],
  ],
});

const kbEdit = (id: number): InlineKeyboard => ({
  inline_keyboard: [
    [{ text: '👤 ФИО',          callback_data: `ef:${id}:fn` }, { text: '📅 Дата',    callback_data: `ef:${id}:bd` }],
    [{ text: '🏙️ Город',        callback_data: `ef:${id}:ct` }, { text: '📞 Телефон', callback_data: `ef:${id}:ph` }],
    [{ text: '🖼️ Аватар',       callback_data: `ef:${id}:av` }],
    [{ text: '⬅️ Назад',        callback_data: `v:${id}` }],
  ],
});

const kbSections = (id: number, hidden: string[]): InlineKeyboard => ({
  inline_keyboard: [
    ...SECTIONS.map((s) => [{ text: `${s.label} ${hidden.includes(s.code) ? '❌' : '✅'}`, callback_data: `ts:${id}:${s.code}` }]),
    [{ text: '⬅️ Назад', callback_data: `v:${id}` }],
  ],
});

const kbMediaSection = (id: number): InlineKeyboard => ({
  inline_keyboard: [
    [{ text: '💬 Переписка', callback_data: `ms:${id}:cr` }, { text: '🎞️ Медиа', callback_data: `ms:${id}:gl` }],
    [{ text: '⬅️ Назад', callback_data: `v:${id}` }],
  ],
});

const kbDone = (id: number): InlineKeyboard => ({
  inline_keyboard: [[{ text: '✅ Завершить загрузку', callback_data: `md:${id}` }]],
});

// ─── Field map ─────────────────────────────────────────────────────────────────

const FIELDS: Record<string, { db: string; prompt: string; photo?: true }> = {
  fn: { db: 'full_name',  prompt: '👤 Введите новое ФИО:' },
  bd: { db: 'birth_date', prompt: '📅 Введите дату рождения (ДД.ММ.ГГГГ):' },
  ct: { db: 'city',       prompt: '🏙️ Введите город:' },
  ph: { db: 'phone',      prompt: '📞 Введите телефон:' },
  av: { db: 'avatar_url', prompt: '🖼️ Отправьте новое фото аватара:', photo: true },
};

// ─── Validation ────────────────────────────────────────────────────────────────

function validate(field: string, value: string): string | null {
  const v = value.trim();
  if (field === 'target_id' && !/^\d{5,12}$/.test(v))      return '❗ Telegram ID — число (5–12 цифр). Попробуйте снова:';
  if (field === 'full_name' && (/^\d+$/.test(v) || v.length < 2)) return '❗ Некорректное ФИО. Введите снова:';
  if (field === 'birth_date' && !/^\d{2}\.\d{2}\.\d{4}$/.test(v)) return '❗ Неверный формат. Введите дату ДД.ММ.ГГГГ:';
  if (field === 'city' && (/^\d+$/.test(v) || v.length < 2))  return '❗ Город не может быть числом. Введите город:';
  if (field === 'phone' && !/^[\+\d][\d\s\-\(\)]{6,17}$/.test(v)) return '❗ Неверный формат. Пример: +79001234567:';
  return null;
}

// ─── Questionnaire ─────────────────────────────────────────────────────────────

const Q_NEXT: Partial<Record<BotState, BotState>> = {
  target_id: 'full_name', full_name: 'birth_date',
  birth_date: 'city',     city: 'phone', phone: 'avatar',
};
const Q_PROMPT: Partial<Record<BotState, string>> = {
  target_id: '🎯 Введите Telegram ID человека, на которого создаётся досье:',
  full_name:  '👤 Введите ФИО:',
  birth_date: '📅 Введите дату рождения (ДД.ММ.ГГГГ):',
  city:       '🏙️ Введите город:',
  phone:      '📞 Введите номер телефона:',
  avatar:     '🖼️ Отправьте фотографию для аватара:',
};
const Q_FIELD: Partial<Record<BotState, string>> = {
  target_id: 'target_id', full_name: 'full_name',
  birth_date: 'birth_date', city: 'city', phone: 'phone',
};

// ─── Main handler ──────────────────────────────────────────────────────────────

export async function handleUpdate(update: TelegramUpdate, env: Env): Promise<void> {
  const db = new SupabaseClient(env);
  const token = env.TELEGRAM_BOT_TOKEN;
  if (update.callback_query) { await handleCallback(update.callback_query, db, token, env); return; }
  if (update.message)        { await handleMessage(update.message, db, token, env); }
}

// ─── Callback handler ──────────────────────────────────────────────────────────

async function handleCallback(
  cq: NonNullable<TelegramUpdate['callback_query']>,
  db: SupabaseClient, token: string, env: Env,
): Promise<void> {
  const userId = cq.from.id;
  const chatId = cq.message?.chat.id ?? userId;
  const msgId  = cq.message?.message_id;
  const data   = cq.data ?? '';

  await answerCb(token, cq.id);

  if (data === 'menu') {
    await edit(token, chatId, msgId, '👋 Главное меню:', KB_MAIN); return;
  }

  if (data === 'create') {
    await db.upsertSession(userId, 'target_id', {});
    await edit(token, chatId, msgId, Q_PROMPT.target_id!); return;
  }

  if (data === 'lst') {
    const all = await db.getAllDossiers();
    if (!all.length) { await edit(token, chatId, msgId, '📭 Досье ещё нет.', KB_MAIN); return; }
    const kb: InlineKeyboard = {
      inline_keyboard: [
        ...all.map((d) => [{ text: d.full_name, callback_data: `v:${d.id}` }]),
        [{ text: '⬅️ Назад', callback_data: 'menu' }],
      ],
    };
    await edit(token, chatId, msgId, `📁 Все досье (${all.length}):`, kb); return;
  }

  if (data.startsWith('v:') && !data.startsWith('v:')) return; // guard
  if (/^v:\d+$/.test(data)) {
    const id = parseInt(data.slice(2), 10);
    const d  = await db.getDossier(id);
    if (!d) { await edit(token, chatId, msgId, '❗ Досье не найдено.', KB_MAIN); return; }
    const txt = `📋 *${esc(d.full_name)}*\nID: \`${id}\`\n\n👤 ${esc(d.full_name)}\n📅 ${d.birth_date}\n🏙️ ${esc(d.city)}\n📞 ${d.phone}`;
    await edit(token, chatId, msgId, txt, kbView(id)); return;
  }

  if (data.startsWith('link:')) {
    const id = data.slice(5);
    await send(token, chatId, `🔗 https://${env.PAGES_DOMAIN}/${id}`); return;
  }

  if (/^e:\d+$/.test(data)) {
    const id = parseInt(data.slice(2), 10);
    const d  = await db.getDossier(id);
    if (!d) return;
    await edit(token, chatId, msgId, `✏️ *Редактирование:* ${esc(d.full_name)}\n\nВыберите поле:`, kbEdit(id)); return;
  }

  if (data.startsWith('ef:')) {
    const [, rawId, code] = data.split(':');
    const id = parseInt(rawId, 10);
    const f  = FIELDS[code];
    if (!f) return;
    await db.upsertSession(userId, 'edit_field', { edit_dossier_id: String(id), edit_field_code: code });
    await edit(token, chatId, msgId, f.prompt); return;
  }

  if (data.startsWith('sec:')) {
    const id = parseInt(data.slice(4), 10);
    const d  = await db.getDossier(id);
    if (!d) return;
    await edit(token, chatId, msgId, `👁 *Управление разделами*\n${esc(d.full_name)}`, kbSections(id, d.hidden_sections ?? [])); return;
  }

  if (data.startsWith('ts:')) {
    const [, rawId, code] = data.split(':');
    const id = parseInt(rawId, 10);
    const d  = await db.getDossier(id);
    if (!d) return;
    const hidden = d.hidden_sections ?? [];
    const next   = hidden.includes(code) ? hidden.filter((s) => s !== code) : [...hidden, code];
    await db.updateHiddenSections(id, next);
    await edit(token, chatId, msgId, `👁 *Управление разделами*\n${esc(d.full_name)}`, kbSections(id, next)); return;
  }

  if (data.startsWith('inf:')) {
    const id = parseInt(data.slice(4), 10);
    await db.upsertSession(userId, 'add_info', { info_dossier_id: String(id) });
    await edit(token, chatId, msgId, '📝 Отправьте текст или .txt файл с информацией:'); return;
  }

  if (data.startsWith('am:')) {
    const id = parseInt(data.slice(3), 10);
    await edit(token, chatId, msgId, '📁 Выберите раздел:', kbMediaSection(id)); return;
  }

  if (data.startsWith('ms:')) {
    const [, rawId, code] = data.split(':');
    const id: number      = parseInt(rawId, 10);
    const section: MediaSection = code === 'cr' ? 'correspondence' : 'gallery';
    await db.upsertSession(userId, 'add_media_photos', { target_id: String(id), media_section: section });
    await edit(token, chatId, msgId, '📸 Отправляйте фото или видео:', kbDone(id)); return;
  }

  if (data.startsWith('md:')) {
    const id = parseInt(data.slice(3), 10);
    await db.upsertSession(userId, 'done', {});
    await edit(token, chatId, msgId, '✅ Медиа сохранено!', kbView(id)); return;
  }
}

// ─── Message handler ───────────────────────────────────────────────────────────

async function handleMessage(
  msg: NonNullable<TelegramUpdate['message']>,
  db: SupabaseClient, token: string, env: Env,
): Promise<void> {
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  if (msg.text === '/start') {
    await db.upsertSession(userId, 'idle', {});
    await send(token, chatId, '👋 Добро пожаловать!\n\nВыберите действие:', KB_MAIN); return;
  }

  const session = await db.getSession(userId);
  if (!session || session.state === 'idle' || session.state === 'done') {
    await send(token, chatId, 'Выберите действие:', KB_MAIN); return;
  }

  const { state, temp_data } = session;

  // ── Upload media ──────────────────────────────────────────────────────────
  if (state === 'add_media_photos') {
    const targetId = parseInt(temp_data.target_id, 10);
    const section  = temp_data.media_section as MediaSection;
    const uuid     = crypto.randomUUID();
    if (msg.photo?.length) {
      const buf = await dlFile(token, msg.photo[msg.photo.length - 1].file_id);
      const url = await db.uploadMedia(targetId, section, buf, uuid, 'image');
      await db.insertMedia(targetId, section, url, 'image');
      await send(token, chatId, '✅ Фото добавлено.', kbDone(targetId)); return;
    }
    if (msg.video) {
      const buf = await dlFile(token, msg.video.file_id);
      const url = await db.uploadMedia(targetId, section, buf, uuid, 'video');
      await db.insertMedia(targetId, section, url, 'video');
      await send(token, chatId, '✅ Видео добавлено.', kbDone(targetId)); return;
    }
    await send(token, chatId, '❗ Отправьте фото или видео.', kbDone(targetId)); return;
  }

  // ── Edit field ─────────────────────────────────────────────────────────────
  if (state === 'edit_field') {
    const dossierId = parseInt(temp_data.edit_dossier_id, 10);
    const f = FIELDS[temp_data.edit_field_code];
    if (!f) return;
    if (f.photo) {
      if (!msg.photo?.length) { await send(token, chatId, '❗ Отправьте фотографию.'); return; }
      const url = await db.uploadAvatar(dossierId, await dlFile(token, msg.photo[msg.photo.length - 1].file_id));
      await db.updateDossierField(dossierId, 'avatar_url', url);
    } else {
      if (!msg.text) { await send(token, chatId, '❗ Введите текст.'); return; }
      const err = validate(f.db, msg.text);
      if (err) { await send(token, chatId, err); return; }
      await db.updateDossierField(dossierId, f.db, msg.text.trim());
    }
    await db.upsertSession(userId, 'done', {});
    const d = await db.getDossier(dossierId);
    await send(token, chatId, `✅ Сохранено!\n\n📋 *${esc(d?.full_name ?? '')}*`, kbView(dossierId)); return;
  }

  // ── Add info ──────────────────────────────────────────────────────────────
  if (state === 'add_info') {
    const dossierId = parseInt(temp_data.info_dossier_id, 10);
    if (msg.text) {
      await db.updateInfoText(dossierId, msg.text);
      await db.upsertSession(userId, 'done', {});
      await send(token, chatId, '✅ Информация сохранена.', kbView(dossierId)); return;
    }
    if (msg.document) {
      if (!msg.document.mime_type?.includes('text')) {
        await send(token, chatId, '❗ Поддерживаются только .txt файлы.'); return;
      }
      const text = new TextDecoder().decode(await dlFile(token, msg.document.file_id));
      await db.updateInfoText(dossierId, text);
      await db.upsertSession(userId, 'done', {});
      await send(token, chatId, '✅ Информация из файла сохранена.', kbView(dossierId)); return;
    }
    await send(token, chatId, '❗ Отправьте текст или .txt файл.'); return;
  }

  // ── Questionnaire ─────────────────────────────────────────────────────────
  if (state === 'avatar') {
    if (!msg.photo?.length) { await send(token, chatId, '❗ Отправьте фотографию.'); return; }
    const targetId  = parseInt(temp_data.target_id, 10);
    const avatarUrl = await db.uploadAvatar(targetId, await dlFile(token, msg.photo[msg.photo.length - 1].file_id));
    await db.upsertDossier(targetId, {
      full_name: temp_data.full_name ?? '', birth_date: temp_data.birth_date ?? '',
      city: temp_data.city ?? '',          phone: temp_data.phone ?? '',
      avatar_url: avatarUrl,
    });
    await db.upsertSession(userId, 'done', temp_data);
    await send(token, chatId, `✅ Досье создано!\n\n🔗 https://${env.PAGES_DOMAIN}/${targetId}`, KB_MAIN); return;
  }

  if (!msg.text) { await send(token, chatId, '❗ Введите текст.'); return; }

  const dbField = Q_FIELD[state] ?? '';
  const err = validate(dbField, msg.text);
  if (err) { await send(token, chatId, err); return; }
  if (dbField) temp_data[dbField] = msg.text.trim();

  const next = Q_NEXT[state];
  if (!next) return;
  await db.upsertSession(userId, next, temp_data);
  await send(token, chatId, Q_PROMPT[next]!);
}

// ─── Telegram API helpers ──────────────────────────────────────────────────────

async function edit(token: string, chatId: number, msgId: number | undefined, text: string, kb?: InlineKeyboard): Promise<void> {
  if (msgId) {
    const res = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: msgId, text, parse_mode: 'Markdown', ...(kb ? { reply_markup: kb } : {}) }),
    });
    if (res.ok) return;
  }
  await send(token, chatId, text, kb);
}

async function send(token: string, chatId: number, text: string, kb?: InlineKeyboard): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', ...(kb ? { reply_markup: kb } : {}) }),
  });
}

async function answerCb(token: string, id: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: id }),
  });
}

async function dlFile(token: string, fileId: string): Promise<ArrayBuffer> {
  const r1 = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
  const d  = (await r1.json()) as { result: { file_path: string } };
  const r2 = await fetch(`https://api.telegram.org/file/bot${token}/${d.result.file_path}`);
  return r2.arrayBuffer();
}

function esc(s: string): string {
  return s.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}
