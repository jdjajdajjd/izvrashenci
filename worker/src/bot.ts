import { SupabaseClient } from './supabase';
import type { BotState, Env, MediaSection, TelegramUpdate } from './types';

const PROMPTS: Record<BotState, string> = {
  target_id:
    '🎯 Введите Telegram ID человека, на которого создаётся досье:',
  full_name: '👤 Введите ФИО:',
  birth_date: '📅 Введите дату рождения (ДД.ММ.ГГГГ):',
  city: '🏙️ Введите город:',
  phone: '📞 Введите номер телефона:',
  avatar: '🖼️ Отправьте фотографию:',
  done: '✅ Готово.',
  add_media_type:
    '📁 Выберите раздел:\n\n1 — Переписка\n2 — Фото\n\nОтправьте 1 или 2:',
  add_media_photos:
    '📸 Отправляйте фотографии по одной.\n/done — завершить загрузку.',
};

const QUESTIONNAIRE: BotState[] = [
  'target_id',
  'full_name',
  'birth_date',
  'city',
  'phone',
  'avatar',
  'done',
];

function validate(state: BotState, value: string): string | null {
  const v = value.trim();
  switch (state) {
    case 'target_id':
      if (!/^\d{5,12}$/.test(v))
        return '❗ Telegram ID — это число (5–12 цифр). Попробуйте снова:';
      return null;
    case 'full_name':
      if (/^\d+$/.test(v))
        return '❗ ФИО не может состоять только из цифр. Введите ФИО:';
      if (v.length < 2)
        return '❗ ФИО слишком короткое. Введите ФИО:';
      return null;
    case 'birth_date':
      if (!/^\d{2}\.\d{2}\.\d{4}$/.test(v))
        return '❗ Неверный формат. Введите дату в формате ДД.ММ.ГГГГ:';
      return null;
    case 'city':
      if (/^\d+$/.test(v))
        return '❗ Город не может быть числом. Введите название города:';
      if (v.length < 2)
        return '❗ Название города слишком короткое. Введите город:';
      return null;
    case 'phone':
      if (!/^[\+\d][\d\s\-\(\)]{6,17}$/.test(v))
        return '❗ Неверный формат телефона. Пример: +79001234567. Введите снова:';
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

export async function handleUpdate(update: TelegramUpdate, env: Env): Promise<void> {
  const message = update.message;
  if (!message?.from) return;

  const operatorId = message.from.id;
  const chatId = message.chat.id;
  const db = new SupabaseClient(env);
  const token = env.TELEGRAM_BOT_TOKEN;

  // /start — начать новое досье
  if (message.text === '/start') {
    await db.upsertSession(operatorId, 'target_id', {});
    await send(token, chatId, PROMPTS.target_id);
    return;
  }

  // /add — добавить медиа к существующему досье
  if (message.text?.startsWith('/add')) {
    const parts = message.text.split(' ');
    const targetId = parts[1];
    if (!targetId || !/^\d+$/.test(targetId)) {
      await send(token, chatId, '❗ Укажите Telegram ID: /add 778851427');
      return;
    }
    const dossier = await db.getDossier(parseInt(targetId, 10));
    if (!dossier) {
      await send(token, chatId, `❗ Досье с ID ${targetId} не найдено.`);
      return;
    }
    await db.upsertSession(operatorId, 'add_media_type', { target_id: targetId });
    await send(token, chatId, PROMPTS.add_media_type);
    return;
  }

  // /done — завершить загрузку медиа
  if (message.text === '/done') {
    const session = await db.getSession(operatorId);
    if (session?.state === 'add_media_photos') {
      const targetId = parseInt(session.temp_data.target_id, 10);
      await db.upsertSession(operatorId, 'done', session.temp_data);
      const link = `https://${env.PAGES_DOMAIN}/${targetId}`;
      await send(token, chatId, `✅ Фотографии добавлены.\n\n🔗 ${link}`);
    }
    return;
  }

  const session = await db.getSession(operatorId);
  if (!session) {
    await send(token, chatId, 'Отправьте /start для начала.');
    return;
  }

  const { state, temp_data } = session;

  // --- Добавление медиа ---
  if (state === 'add_media_type') {
    if (message.text !== '1' && message.text !== '2') {
      await send(token, chatId, '❗ Отправьте 1 (Переписка) или 2 (Фото):');
      return;
    }
    const section: MediaSection = message.text === '1' ? 'correspondence' : 'gallery';
    temp_data.media_section = section;
    await db.upsertSession(operatorId, 'add_media_photos', temp_data);
    await send(token, chatId, PROMPTS.add_media_photos);
    return;
  }

  if (state === 'add_media_photos') {
    if (!message.photo?.length) {
      await send(token, chatId, '❗ Отправьте фотографию или /done для завершения.');
      return;
    }
    const targetId = parseInt(temp_data.target_id, 10);
    const section = temp_data.media_section as MediaSection;
    const photo = message.photo[message.photo.length - 1];
    const uuid = crypto.randomUUID();
    const buffer = await downloadPhoto(token, photo.file_id);
    const url = await db.uploadMedia(targetId, section, buffer, uuid);
    await db.insertMedia(targetId, section, url);
    await send(token, chatId, '✅ Фото добавлено. Отправьте ещё или /done.');
    return;
  }

  // --- Основная анкета ---
  if (state === 'done') {
    await send(token, chatId, 'Досье уже создано. /start — новое, /add <ID> — добавить фото.');
    return;
  }

  const currentIndex = QUESTIONNAIRE.indexOf(state);
  const nextState = QUESTIONNAIRE[currentIndex + 1] as BotState;

  if (state === 'avatar') {
    if (!message.photo?.length) {
      await send(token, chatId, '❗ Пожалуйста, отправьте фотографию.');
      return;
    }
    const targetId = parseInt(temp_data.target_id, 10);
    const photo = message.photo[message.photo.length - 1];
    const buffer = await downloadPhoto(token, photo.file_id);
    const avatarUrl = await db.uploadAvatar(targetId, buffer);
    temp_data.avatar_url = avatarUrl;

    await db.upsertDossier(targetId, {
      full_name: temp_data.full_name ?? '',
      birth_date: temp_data.birth_date ?? '',
      city: temp_data.city ?? '',
      phone: temp_data.phone ?? '',
      avatar_url: avatarUrl,
    });
    await db.upsertSession(operatorId, 'done', temp_data);

    const link = `https://${env.PAGES_DOMAIN}/${targetId}`;
    await send(token, chatId, `✅ Досье создано!\n\n🔗 ${link}`);
    return;
  }

  if (!message.text) {
    await send(token, chatId, '❗ Пожалуйста, введите текст.');
    return;
  }

  const error = validate(state, message.text);
  if (error) {
    await send(token, chatId, error);
    return;
  }

  const field = FIELD_MAP[state];
  if (field) temp_data[field] = message.text.trim();

  await db.upsertSession(operatorId, nextState, temp_data);
  await send(token, chatId, PROMPTS[nextState]);
}

async function downloadPhoto(token: string, fileId: string): Promise<ArrayBuffer> {
  const fileRes = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`,
  );
  const fileData = (await fileRes.json()) as { result: { file_path: string } };
  const photoRes = await fetch(
    `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`,
  );
  return photoRes.arrayBuffer();
}

async function send(token: string, chatId: number, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
