import { SupabaseClient } from './supabase';
import type { BotState, Env, TelegramUpdate } from './types';

const PROMPTS: Record<BotState, string> = {
  full_name: '👤 Введите ваше ФИО:',
  birth_date: '📅 Введите дату рождения (ДД.ММ.ГГГГ):',
  city: '🏙️ Введите ваш город:',
  phone: '📞 Введите номер телефона:',
  avatar: '🖼️ Отправьте вашу фотографию:',
  done: '✅ Анкета заполнена.',
};

const STATE_ORDER: BotState[] = ['full_name', 'birth_date', 'city', 'phone', 'avatar', 'done'];

const FIELD_FOR_STATE: Partial<Record<BotState, string>> = {
  full_name: 'full_name',
  birth_date: 'birth_date',
  city: 'city',
  phone: 'phone',
};

export async function handleUpdate(update: TelegramUpdate, env: Env): Promise<void> {
  const message = update.message;
  if (!message?.from) return;

  const telegramId = message.from.id;
  const chatId = message.chat.id;
  const db = new SupabaseClient(env);

  if (message.text === '/start') {
    await db.upsertSession(telegramId, 'full_name', {});
    await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, PROMPTS.full_name);
    return;
  }

  const session = await db.getSession(telegramId);
  if (!session || session.state === 'done') {
    await sendMessage(
      env.TELEGRAM_BOT_TOKEN,
      chatId,
      'Отправьте /start для начала анкетирования.',
    );
    return;
  }

  const { state, temp_data: tempData } = session;
  const currentIndex = STATE_ORDER.indexOf(state);
  const nextState = STATE_ORDER[currentIndex + 1] as BotState;

  if (state === 'avatar') {
    if (!message.photo?.length) {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, '❗ Пожалуйста, отправьте фотографию.');
      return;
    }

    const largest = message.photo[message.photo.length - 1];
    const avatarUrl = await downloadAndUploadAvatar(largest.file_id, telegramId, env, db);
    tempData.avatar_url = avatarUrl;

    await db.upsertDossier(telegramId, {
      full_name: tempData.full_name ?? '',
      birth_date: tempData.birth_date ?? '',
      city: tempData.city ?? '',
      phone: tempData.phone ?? '',
      avatar_url: avatarUrl,
    });

    await db.upsertSession(telegramId, 'done', tempData);

    const link = `https://${env.PAGES_DOMAIN}/${telegramId}`;
    await sendMessage(
      env.TELEGRAM_BOT_TOKEN,
      chatId,
      `✅ Досье создано!\n\n🔗 ${link}`,
    );
    return;
  }

  if (!message.text) {
    await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, '❗ Пожалуйста, введите текст.');
    return;
  }

  const field = FIELD_FOR_STATE[state];
  if (field) {
    tempData[field] = message.text;
  }

  await db.upsertSession(telegramId, nextState, tempData);
  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, PROMPTS[nextState]);
}

async function downloadAndUploadAvatar(
  fileId: string,
  telegramId: number,
  env: Env,
  db: SupabaseClient,
): Promise<string> {
  const fileRes = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`,
  );
  const fileData = (await fileRes.json()) as { result: { file_path: string } };
  const filePath = fileData.result.file_path;

  const photoRes = await fetch(
    `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`,
  );
  const buffer = await photoRes.arrayBuffer();

  return db.uploadAvatar(telegramId, buffer, 'image/jpeg');
}

async function sendMessage(token: string, chatId: number, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
