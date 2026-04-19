import { SupabaseClient } from './supabase';
import type { BotState, Env, InlineKeyboard, MediaSection, TelegramUpdate } from './types';

// ─── Keyboards ────────────────────────────────────────────────────────────────

const KB_MAIN: InlineKeyboard = {
  inline_keyboard: [
    [{ text: '📋 Создать досье', callback_data: 'create' }],
    [{ text: '📸 Добавить фото к досье', callback_data: 'add_photo' }],
  ],
};

const KB_SECTION: InlineKeyboard = {
  inline_keyboard: [
    [
      { text: '💬 Переписка', callback_data: 'section:correspondence' },
      { text: '📷 Галерея', callback_data: 'section:gallery' },
    ],
  ],
};

const KB_DONE: InlineKeyboard = {
  inline_keyboard: [[{ text: '✅ Завершить загрузку', callback_data: 'media_done' }]],
};

// ─── Validation ───────────────────────────────────────────────────────────────

function validate(state: BotState, value: string): string | null {
  const v = value.trim();
  switch (state) {
    case 'target_id':
    case 'add_media_id':
      if (!/^\d{5,12}$/.test(v))
        return '❗ Telegram ID — число (5–12 цифр). Попробуйте снова:';
      return null;
    case 'full_name':
      if (/^\d+$/.test(v)) return '❗ ФИО не может состоять из цифр. Введите ФИО:';
      if (v.length < 2) return '❗ ФИО слишком короткое. Введите ФИО:';
      return null;
    case 'birth_date':
      if (!/^\d{2}\.\d{2}\.\d{4}$/.test(v))
        return '❗ Неверный формат. Введите дату ДД.ММ.ГГГГ:';
      return null;
    case 'city':
      if (/^\d+$/.test(v)) return '❗ Город не может быть числом. Введите город:';
      if (v.length < 2) return '❗ Слишком короткое. Введите город:';
      return null;
    case 'phone':
      if (!/^[\+\d][\d\s\-\(\)]{6,17}$/.test(v))
        return '❗ Неверный формат. Пример: +79001234567. Введите снова:';
      return null;
    default:
      return null;
  }
}

const FIELD_MAP: Partial<Record<BotState, string>> = {
  target_id: 'target_id',
  full_name: 'full_name',
  birth_date: 'birth_date',
  city: 'city',
  phone: 'phone',
};

const NEXT_STATE: Partial<Record<BotState, BotState>> = {
  target_id: 'full_name',
  full_name: 'birth_date',
  birth_date: 'city',
  city: 'phone',
  phone: 'avatar',
};

const PROMPTS: Record<string, string> = {
  target_id: '🎯 Введите Telegram ID человека, на которого создаётся досье:',
  full_name: '👤 Введите ФИО:',
  birth_date: '📅 Введите дату рождения (ДД.ММ.ГГГГ):',
  city: '🏙️ Введите город:',
  phone: '📞 Введите номер телефона:',
  avatar: '🖼️ Отправьте фотографию для аватара:',
  add_media_id: '🎯 Введите Telegram ID досье, к которому добавляем фото:',
  add_media_photos: '📸 Отправляйте фотографии. Нажмите кнопку когда закончите.',
};

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function handleUpdate(update: TelegramUpdate, env: Env): Promise<void> {
  const db = new SupabaseClient(env);
  const token = env.TELEGRAM_BOT_TOKEN;

  if (update.callback_query) {
    await handleCallback(update.callback_query, db, token, env);
    return;
  }

  if (update.message) {
    await handleMessage(update.message, db, token, env);
  }
}

// ─── Callback handler ─────────────────────────────────────────────────────────

async function handleCallback(
  cq: NonNullable<TelegramUpdate['callback_query']>,
  db: SupabaseClient,
  token: string,
  env: Env,
): Promise<void> {
  const userId = cq.from.id;
  const chatId = cq.message?.chat.id ?? userId;
  const data = cq.data ?? '';

  await answerCallback(token, cq.id);

  if (data === 'create') {
    await db.upsertSession(userId, 'target_id', {});
    await send(token, chatId, PROMPTS.target_id);
    return;
  }

  if (data === 'add_photo') {
    await db.upsertSession(userId, 'add_media_id', {});
    await send(token, chatId, PROMPTS.add_media_id);
    return;
  }

  if (data.startsWith('section:')) {
    const section = data.split(':')[1] as MediaSection;
    const session = await db.getSession(userId);
    if (!session) return;
    session.temp_data.media_section = section;
    await db.upsertSession(userId, 'add_media_photos', session.temp_data);
    await send(token, chatId, PROMPTS.add_media_photos, KB_DONE);
    return;
  }

  if (data === 'media_done') {
    const session = await db.getSession(userId);
    if (!session) return;
    const targetId = parseInt(session.temp_data.target_id, 10);
    await db.upsertSession(userId, 'done', session.temp_data);
    const link = `https://${env.PAGES_DOMAIN}/${targetId}`;
    await send(token, chatId, `✅ Фотографии добавлены!\n\n🔗 ${link}`, KB_MAIN);
    return;
  }
}

// ─── Message handler ──────────────────────────────────────────────────────────

async function handleMessage(
  message: NonNullable<TelegramUpdate['message']>,
  db: SupabaseClient,
  token: string,
  env: Env,
): Promise<void> {
  const userId = message.from.id;
  const chatId = message.chat.id;

  if (message.text === '/start') {
    await db.upsertSession(userId, 'idle', {});
    await send(token, chatId, '👋 Добро пожаловать!\n\nВыберите действие:', KB_MAIN);
    return;
  }

  const session = await db.getSession(userId);
  if (!session || session.state === 'idle' || session.state === 'done') {
    await send(token, chatId, 'Выберите действие:', KB_MAIN);
    return;
  }

  const { state, temp_data } = session;

  // ── Загрузка медиафото ──
  if (state === 'add_media_photos') {
    if (!message.photo?.length) {
      await send(token, chatId, '❗ Отправьте фотографию.', KB_DONE);
      return;
    }
    const targetId = parseInt(temp_data.target_id, 10);
    const section = temp_data.media_section as MediaSection;
    const photo = message.photo[message.photo.length - 1];
    const uuid = crypto.randomUUID();
    const buffer = await downloadPhoto(token, photo.file_id);
    const url = await db.uploadMedia(targetId, section, buffer, uuid);
    await db.insertMedia(targetId, section, url);
    await send(token, chatId, '✅ Фото добавлено. Отправьте ещё или завершите.', KB_DONE);
    return;
  }

  // ── ID для добавления медиа ──
  if (state === 'add_media_id') {
    if (!message.text) { await send(token, chatId, PROMPTS.add_media_id); return; }
    const err = validate(state, message.text);
    if (err) { await send(token, chatId, err); return; }
    const targetId = parseInt(message.text.trim(), 10);
    const dossier = await db.getDossier(targetId);
    if (!dossier) {
      await send(token, chatId, `❗ Досье с ID ${targetId} не найдено. Введите другой ID:`);
      return;
    }
    temp_data.target_id = String(targetId);
    await db.upsertSession(userId, 'add_media_type', temp_data);
    await send(token, chatId, `📁 Досье: *${dossier.full_name}*\n\nВыберите раздел:`, KB_SECTION);
    return;
  }

  // ── Аватар ──
  if (state === 'avatar') {
    if (!message.photo?.length) {
      await send(token, chatId, '❗ Пожалуйста, отправьте фотографию.');
      return;
    }
    const targetId = parseInt(temp_data.target_id, 10);
    const photo = message.photo[message.photo.length - 1];
    const buffer = await downloadPhoto(token, photo.file_id);
    const avatarUrl = await db.uploadAvatar(targetId, buffer);
    await db.upsertDossier(targetId, {
      full_name: temp_data.full_name ?? '',
      birth_date: temp_data.birth_date ?? '',
      city: temp_data.city ?? '',
      phone: temp_data.phone ?? '',
      avatar_url: avatarUrl,
    });
    await db.upsertSession(userId, 'done', temp_data);
    const link = `https://${env.PAGES_DOMAIN}/${targetId}`;
    await send(token, chatId, `✅ Досье создано!\n\n🔗 ${link}`, KB_MAIN);
    return;
  }

  // ── Текстовые поля анкеты ──
  if (!message.text) {
    await send(token, chatId, '❗ Введите текст.');
    return;
  }

  const err = validate(state, message.text);
  if (err) { await send(token, chatId, err); return; }

  const field = FIELD_MAP[state];
  if (field) temp_data[field] = message.text.trim();

  const next = NEXT_STATE[state];
  if (!next) return;

  await db.upsertSession(userId, next, temp_data);
  await send(token, chatId, PROMPTS[next]);
}

// ─── Telegram helpers ─────────────────────────────────────────────────────────

async function send(
  token: string,
  chatId: number,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      ...(keyboard ? { reply_markup: keyboard } : {}),
    }),
  });
}

async function answerCallback(token: string, callbackQueryId: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });
}

async function downloadPhoto(token: string, fileId: string): Promise<ArrayBuffer> {
  const res = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
  const data = (await res.json()) as { result: { file_path: string } };
  const photo = await fetch(
    `https://api.telegram.org/file/bot${token}/${data.result.file_path}`,
  );
  return photo.arrayBuffer();
}
