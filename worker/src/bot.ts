import { parseReport } from './parser';
import { SupabaseClient } from './supabase';
import type { BotState, Env, InlineKeyboard, MediaSection, MediaType, Relatives, TelegramUpdate } from './types';

// ─── Section config ────────────────────────────────────────────────────────────

const SECTIONS = [
  { code: 'suspected_of',   label: '🔴 Подозревается в' },
  { code: 'correspondence', label: '💬 Переписка' },
  { code: 'gallery',        label: '🎞️ Медиа' },
  { code: 'info',           label: 'ℹ️ Информация' },
  { code: 'notes',          label: '📓 Заметки' },
  { code: 'public_messages',label: '🗨️ Публичные чаты' },
  { code: 'relatives',      label: '🧬 Родственники' },
  { code: 'vk_friends',     label: '👥 Друзья из ВК' },
] as const;

// ─── Relatives config ──────────────────────────────────────────────────────────

const RELATIVES: Array<{ key: keyof Relatives; label: string }> = [
  { key: 'mother',    label: '👩 Мать' },
  { key: 'father',    label: '👨 Отец' },
  { key: 'brother_1', label: '👦 Брат 1' },
  { key: 'brother_2', label: '👦 Брат 2' },
  { key: 'brother_3', label: '👦 Брат 3' },
  { key: 'sister_1',  label: '👧 Сестра 1' },
  { key: 'sister_2',  label: '👧 Сестра 2' },
  { key: 'sister_3',  label: '👧 Сестра 3' },
  { key: 'grandma_1', label: '👵 Бабушка 1' },
  { key: 'grandma_2', label: '👵 Бабушка 2' },
  { key: 'grandpa_1', label: '👴 Дедушка 1' },
  { key: 'grandpa_2', label: '👴 Дедушка 2' },
];

// ─── Keyboards ─────────────────────────────────────────────────────────────────

const KB_MAIN: InlineKeyboard = {
  inline_keyboard: [
    [{ text: '📋 Создать досье', callback_data: 'create' }],
    [{ text: '📁 Все досье',    callback_data: 'lst' }],
  ],
};

const kbView = (id: number): InlineKeyboard => ({
  inline_keyboard: [
    [{ text: '✏️ Редактировать',    callback_data: `e:${id}` },   { text: '🔴 Подозревается в',  callback_data: `ef:${id}:sp` }],
    [{ text: '🧬 Родственники',     callback_data: `rel:${id}` }, { text: '📸 Добавить медиа',   callback_data: `am:${id}` }],
    [{ text: 'ℹ️ Информация',       callback_data: `inf:${id}` }, { text: '🗨️ Публичные чаты',  callback_data: `pm:${id}` }],
    [{ text: '📓 Заметки',          callback_data: `nt:${id}` },  { text: '🗃️ Разобрать отчёт', callback_data: `pf:${id}` }],
    [{ text: '👁 Разделы',          callback_data: `sec:${id}` }, { text: '🔗 Открыть страницу', callback_data: `link:${id}` }],
    [{ text: '⬅️ К списку',         callback_data: 'lst' }],
  ],
});

const kbEdit = (id: number): InlineKeyboard => ({
  inline_keyboard: [
    [{ text: '👤 ФИО',        callback_data: `ef:${id}:fn` }, { text: '📅 Дата рождения', callback_data: `ef:${id}:bd` }],
    [{ text: '🏙️ Город',      callback_data: `ef:${id}:ct` }, { text: '📞 Телефон',       callback_data: `ef:${id}:ph` }],
    [{ text: '🖼️ Аватар',     callback_data: `ef:${id}:av` }, { text: '@️ Username',      callback_data: `ef:${id}:un` }],
    [{ text: '⬅️ Назад',      callback_data: `v:${id}` }],
  ],
});

const kbRelatives = (id: number, existing: Relatives): InlineKeyboard => {
  const rows: InlineKeyboard['inline_keyboard'] = [];
  for (let i = 0; i < RELATIVES.length; i += 2) {
    const a = RELATIVES[i];
    const b = RELATIVES[i + 1];
    const aHas = existing[a.key] ? ' ✓' : '';
    const bHas = b && existing[b.key] ? ' ✓' : '';
    if (b) {
      rows.push([
        { text: a.label + aHas, callback_data: `re:${id}:${a.key}` },
        { text: b.label + bHas, callback_data: `re:${id}:${b.key}` },
      ]);
    } else {
      rows.push([{ text: a.label + aHas, callback_data: `re:${id}:${a.key}` }]);
    }
  }
  rows.push([{ text: '⬅️ Назад', callback_data: `v:${id}` }]);
  return { inline_keyboard: rows };
};

const kbSections = (id: number, hidden: string[]): InlineKeyboard => ({
  inline_keyboard: [
    ...SECTIONS.map((s) => [{ text: `${hidden.includes(s.code) ? '❌' : '✅'} ${s.label}`, callback_data: `ts:${id}:${s.code}` }]),
    [{ text: '⬅️ Назад', callback_data: `v:${id}` }],
  ],
});

const kbMediaSection = (id: number): InlineKeyboard => ({
  inline_keyboard: [
    [{ text: '💬 Переписка', callback_data: `ms:${id}:cr` }, { text: '🎞️ Медиа', callback_data: `ms:${id}:gl` }],
    [{ text: '⬅️ Назад',    callback_data: `v:${id}` }],
  ],
});

const kbDone = (id: number): InlineKeyboard => ({
  inline_keyboard: [[{ text: '✅ Завершить загрузку', callback_data: `md:${id}` }]],
});

const kbCancel = (id: number): InlineKeyboard => ({
  inline_keyboard: [[{ text: '❌ Отмена', callback_data: `v:${id}` }]],
});

// ─── Field map ─────────────────────────────────────────────────────────────────

const FIELDS: Record<string, { db: string; prompt: string; photo?: true; multi?: true }> = {
  fn: { db: 'full_name',    prompt: '👤 Введите новое ФИО:' },
  bd: { db: 'birth_date',   prompt: '📅 Введите дату рождения (ДД.ММ.ГГГГ):' },
  ct: { db: 'city',         prompt: '🏙️ Введите город:' },
  ph: { db: 'phone',        prompt: '📞 Введите телефон:' },
  av: { db: 'avatar_url',   prompt: '🖼️ Отправьте новое фото аватара:', photo: true },
  un: { db: 'username',     prompt: '@️ Введите Telegram @username (без @):' },
  sp: { db: 'suspected_of', prompt: '🔴 Введите в чём подозревается (или — для сброса):', multi: true },
};

// ─── Validation ────────────────────────────────────────────────────────────────

function validate(field: string, value: string): string | null {
  const v = value.trim();
  if (field === 'target_id'  && !/^\d{5,12}$/.test(v))           return '❗ Telegram ID — число (5–12 цифр). Попробуйте снова:';
  if (field === 'full_name'  && (/^\d+$/.test(v) || v.length < 2)) return '❗ Некорректное ФИО. Введите снова:';
  if (field === 'birth_date' && !/^\d{2}\.\d{2}\.\d{4}$/.test(v)) return '❗ Неверный формат. Введите дату ДД.ММ.ГГГГ:';
  if (field === 'city'       && (/^\d+$/.test(v) || v.length < 2)) return '❗ Город не может быть числом. Введите город:';
  if (field === 'phone'      && !/^[\+\d][\d\s\-\(\)]{6,17}$/.test(v)) return '❗ Неверный формат. Пример: +79001234567:';
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
  if (update.callback_query) { await handleCallback(update.callback_query, db, env); return; }
  if (update.message)        { await handleMessage(update.message, db, env); }
}

// ─── Callback handler ──────────────────────────────────────────────────────────

async function handleCallback(
  cq: NonNullable<TelegramUpdate['callback_query']>,
  db: SupabaseClient, env: Env,
): Promise<void> {
  const token  = env.TELEGRAM_BOT_TOKEN;
  const userId = cq.from.id;
  const chatId = cq.message?.chat.id ?? userId;
  const msgId  = cq.message?.message_id;
  const data   = cq.data ?? '';

  await answerCb(token, cq.id);

  // ── Main menu ────────────────────────────────────────────────────────────────
  if (data === 'menu') {
    await edit(token, chatId, msgId, '👋 Главное меню:', KB_MAIN); return;
  }

  // ── Create dossier ───────────────────────────────────────────────────────────
  if (data === 'create') {
    await db.upsertSession(userId, 'target_id', { pmid: String(msgId ?? 0) });
    await edit(token, chatId, msgId, Q_PROMPT.target_id!); return;
  }

  // ── List all dossiers ────────────────────────────────────────────────────────
  if (data === 'lst') {
    const all = await db.getAllDossiers();
    if (!all.length) { await edit(token, chatId, msgId, '📭 Досье ещё нет.', KB_MAIN); return; }
    const kb: InlineKeyboard = {
      inline_keyboard: [
        ...all.map((d) => [{ text: d.full_name, callback_data: `v:${d.id}` }]),
        [{ text: '⬅️ Главное меню', callback_data: 'menu' }],
      ],
    };
    await edit(token, chatId, msgId, `📁 Все досье (${all.length}):`, kb); return;
  }

  // ── View dossier ─────────────────────────────────────────────────────────────
  if (/^v:\d+$/.test(data)) {
    const id = parseInt(data.slice(2), 10);
    const d  = await db.getDossier(id);
    if (!d) { await edit(token, chatId, msgId, '❗ Досье не найдено.', KB_MAIN); return; }
    const unameStr = d.username ? `\n@${esc(d.username)}` : '';
    const txt = `📋 *${esc(d.full_name)}*\nID: \`${id}\`${unameStr}\n\n` +
      `👤 ${esc(d.full_name)}\n📅 ${d.birth_date || '—'}\n🏙️ ${esc(d.city || '—')}\n📞 ${d.phone || '—'}`;
    await edit(token, chatId, msgId, txt, kbView(id)); return;
  }

  // ── Open page link ───────────────────────────────────────────────────────────
  if (data.startsWith('link:')) {
    const id = data.slice(5);
    await edit(token, chatId, msgId, `🔗 https://${env.PAGES_DOMAIN}/${id}`); return;
  }

  // ── Edit menu ────────────────────────────────────────────────────────────────
  if (/^e:\d+$/.test(data)) {
    const id = parseInt(data.slice(2), 10);
    const d  = await db.getDossier(id);
    if (!d) return;
    await edit(token, chatId, msgId, `✏️ *Редактирование:* ${esc(d.full_name)}\n\nВыберите поле:`, kbEdit(id)); return;
  }

  // ── Edit field ───────────────────────────────────────────────────────────────
  if (data.startsWith('ef:')) {
    const parts = data.split(':');
    const id    = parseInt(parts[1], 10);
    const code  = parts[2];
    const f     = FIELDS[code];
    if (!f) return;
    await db.upsertSession(userId, 'edit_field', { edit_dossier_id: String(id), edit_field_code: code, pmid: String(msgId ?? 0) });
    await edit(token, chatId, msgId, f.prompt, kbCancel(id)); return;
  }

  // ── Sections toggle ──────────────────────────────────────────────────────────
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

  // ── Info text ────────────────────────────────────────────────────────────────
  if (data.startsWith('inf:')) {
    const id = parseInt(data.slice(4), 10);
    await db.upsertSession(userId, 'add_info', { info_dossier_id: String(id), pmid: String(msgId ?? 0) });
    await edit(token, chatId, msgId, '📝 Отправьте текст или .txt файл с информацией:', kbCancel(id)); return;
  }

  // ── Notes ────────────────────────────────────────────────────────────────────
  if (data.startsWith('nt:')) {
    const id = parseInt(data.slice(3), 10);
    await db.upsertSession(userId, 'add_notes', { notes_dossier_id: String(id), pmid: String(msgId ?? 0) });
    await edit(token, chatId, msgId, '📓 Введите заметки по досье:', kbCancel(id)); return;
  }

  // ── Public messages ──────────────────────────────────────────────────────────
  if (data.startsWith('pm:')) {
    const id = parseInt(data.slice(3), 10);
    await db.upsertSession(userId, 'add_public_messages', { pm_dossier_id: String(id), pmid: String(msgId ?? 0) });
    await edit(token, chatId, msgId, '🗨️ Вставьте скриншоты или текст сообщений из публичных чатов:', kbCancel(id)); return;
  }

  // ── Relatives menu ───────────────────────────────────────────────────────────
  if (/^rel:\d+$/.test(data)) {
    const id = parseInt(data.slice(4), 10);
    const d  = await db.getDossier(id);
    if (!d) return;
    await edit(token, chatId, msgId, `🧬 *Родственники*\n${esc(d.full_name)}`, kbRelatives(id, d.relatives ?? {})); return;
  }

  // ── Edit specific relative ───────────────────────────────────────────────────
  if (data.startsWith('re:')) {
    const parts  = data.split(':');
    const id     = parseInt(parts[1], 10);
    const relKey = parts[2] as keyof Relatives;
    const cfg    = RELATIVES.find((r) => r.key === relKey);
    if (!cfg) return;
    await db.upsertSession(userId, 'edit_relative', { rel_dossier_id: String(id), rel_key: relKey, pmid: String(msgId ?? 0) });
    await edit(token, chatId, msgId, `${cfg.label}\n\nВведите ФИО (или — для сброса):`, kbCancel(id)); return;
  }

  // ── Parse file (Sherlock report) ─────────────────────────────────────────────
  if (data.startsWith('pf:')) {
    const id = parseInt(data.slice(3), 10);
    await db.upsertSession(userId, 'parse_file', { parse_dossier_id: String(id), pmid: String(msgId ?? 0) });
    await edit(token, chatId, msgId, '🗃️ Отправьте PDF или TXT файл с отчётом (Sherlock и т.п.):', kbCancel(id)); return;
  }

  // ── Add media ────────────────────────────────────────────────────────────────
  if (data.startsWith('am:')) {
    const id = parseInt(data.slice(3), 10);
    await edit(token, chatId, msgId, '📁 Выберите раздел для медиа:', kbMediaSection(id)); return;
  }

  if (data.startsWith('ms:')) {
    const [, rawId, code]    = data.split(':');
    const id: number         = parseInt(rawId, 10);
    const section: MediaSection = code === 'cr' ? 'correspondence' : 'gallery';
    await db.upsertSession(userId, 'add_media_photos', { target_id: String(id), media_section: section, pmid: String(msgId ?? 0) });
    await edit(token, chatId, msgId, '📸 Отправляйте фото или видео. Нажмите кнопку когда закончите:', kbDone(id)); return;
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
  db: SupabaseClient, env: Env,
): Promise<void> {
  const token  = env.TELEGRAM_BOT_TOKEN;
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  if (msg.text === '/start') {
    await db.upsertSession(userId, 'idle', {});
    await send(token, chatId, '👋 Добро пожаловать!\n\nВыберите действие:', KB_MAIN); return;
  }

  const session = await db.getSession(userId);
  if (!session || session.state === 'idle' || session.state === 'done') {
    await send(token, chatId, '👋 Выберите действие:', KB_MAIN); return;
  }

  const { state, temp_data } = session;
  const pmid = temp_data.pmid ? parseInt(temp_data.pmid, 10) : undefined;

  // Delete user's message to keep the chat clean
  await deleteMsg(token, chatId, msg.message_id);

  // ── Upload media ──────────────────────────────────────────────────────────────
  if (state === 'add_media_photos') {
    const targetId = parseInt(temp_data.target_id, 10);
    const section  = temp_data.media_section as MediaSection;
    const uuid     = crypto.randomUUID();
    if (msg.photo?.length) {
      const buf = await dlFile(token, msg.photo[msg.photo.length - 1].file_id);
      const url = await db.uploadMedia(targetId, section, buf, uuid, 'image');
      await db.insertMedia(targetId, section, url, 'image');
      await edit(token, chatId, pmid, '✅ Фото добавлено. Отправляйте ещё или завершите:', kbDone(targetId)); return;
    }
    if (msg.video) {
      const buf = await dlFile(token, msg.video.file_id);
      const url = await db.uploadMedia(targetId, section, buf, uuid, 'video');
      await db.insertMedia(targetId, section, url, 'video');
      await edit(token, chatId, pmid, '✅ Видео добавлено. Отправляйте ещё или завершите:', kbDone(targetId)); return;
    }
    await edit(token, chatId, pmid, '❗ Отправьте фото или видео.', kbDone(targetId)); return;
  }

  // ── Edit field ────────────────────────────────────────────────────────────────
  if (state === 'edit_field') {
    const dossierId = parseInt(temp_data.edit_dossier_id, 10);
    const code      = temp_data.edit_field_code;
    const f         = FIELDS[code];
    if (!f) return;
    if (f.photo) {
      if (!msg.photo?.length) {
        await edit(token, chatId, pmid, '❗ Отправьте фотографию.', kbCancel(dossierId)); return;
      }
      const url = await db.uploadAvatar(dossierId, await dlFile(token, msg.photo[msg.photo.length - 1].file_id));
      await db.updateDossierField(dossierId, 'avatar_url', url);
    } else {
      if (!msg.text) { await edit(token, chatId, pmid, '❗ Введите текст.', kbCancel(dossierId)); return; }
      const err = validate(f.db, msg.text);
      if (err) { await edit(token, chatId, pmid, err, kbCancel(dossierId)); return; }
      await db.updateDossierField(dossierId, f.db, msg.text.trim());
    }
    await db.upsertSession(userId, 'done', {});
    const d = await db.getDossier(dossierId);
    const unameStr = d?.username ? `\n@${esc(d.username)}` : '';
    const txt = `✅ Сохранено!\n\n📋 *${esc(d?.full_name ?? '')}*\nID: \`${dossierId}\`${unameStr}`;
    await edit(token, chatId, pmid, txt, kbView(dossierId)); return;
  }

  // ── Add info ──────────────────────────────────────────────────────────────────
  if (state === 'add_info') {
    const dossierId = parseInt(temp_data.info_dossier_id, 10);
    if (msg.document && msg.document.mime_type?.includes('text')) {
      const text = new TextDecoder().decode(await dlFile(token, msg.document.file_id));
      await db.updateDossierField(dossierId, 'info_text', text);
      await db.upsertSession(userId, 'done', {});
      await edit(token, chatId, pmid, '✅ Информация из файла сохранена.', kbView(dossierId)); return;
    }
    if (msg.text) {
      await db.updateDossierField(dossierId, 'info_text', msg.text);
      await db.upsertSession(userId, 'done', {});
      await edit(token, chatId, pmid, '✅ Информация сохранена.', kbView(dossierId)); return;
    }
    await edit(token, chatId, pmid, '❗ Отправьте текст или .txt файл.', kbCancel(dossierId)); return;
  }

  // ── Add notes ─────────────────────────────────────────────────────────────────
  if (state === 'add_notes') {
    const dossierId = parseInt(temp_data.notes_dossier_id, 10);
    if (!msg.text) { await edit(token, chatId, pmid, '❗ Введите текст заметки.', kbCancel(dossierId)); return; }
    await db.updateDossierField(dossierId, 'notes', msg.text);
    await db.upsertSession(userId, 'done', {});
    await edit(token, chatId, pmid, '✅ Заметки сохранены.', kbView(dossierId)); return;
  }

  // ── Add public messages ───────────────────────────────────────────────────────
  if (state === 'add_public_messages') {
    const dossierId = parseInt(temp_data.pm_dossier_id, 10);
    if (!msg.text) { await edit(token, chatId, pmid, '❗ Введите текст.', kbCancel(dossierId)); return; }
    await db.updateDossierField(dossierId, 'public_messages', msg.text);
    await db.upsertSession(userId, 'done', {});
    await edit(token, chatId, pmid, '✅ Сообщения сохранены.', kbView(dossierId)); return;
  }

  // ── Edit relative ─────────────────────────────────────────────────────────────
  if (state === 'edit_relative') {
    const dossierId = parseInt(temp_data.rel_dossier_id, 10);
    const relKey    = temp_data.rel_key as keyof Relatives;
    if (!msg.text) { await edit(token, chatId, pmid, '❗ Введите ФИО.', kbCancel(dossierId)); return; }
    const d = await db.getDossier(dossierId);
    if (!d) return;
    const relatives = { ...(d.relatives ?? {}) };
    const val = msg.text.trim();
    if (val === '—' || val === '-') {
      delete relatives[relKey];
    } else {
      relatives[relKey] = val;
    }
    await db.updateRelatives(dossierId, relatives);
    await db.upsertSession(userId, 'done', {});
    await edit(token, chatId, pmid, '✅ Родственник сохранён.', kbRelatives(dossierId, relatives)); return;
  }

  // ── Parse file ────────────────────────────────────────────────────────────────
  if (state === 'parse_file') {
    const dossierId = parseInt(temp_data.parse_dossier_id, 10);
    if (!msg.document) {
      await edit(token, chatId, pmid, '❗ Отправьте PDF или TXT файл.', kbCancel(dossierId)); return;
    }
    const mimeType = msg.document.mime_type ?? 'text/plain';
    const buf      = await dlFile(token, msg.document.file_id);
    const parsed   = parseReport(buf, mimeType);

    // Build patch object and summary
    const patch: Record<string, unknown> = {};
    const applied: string[] = [];

    if (parsed.full_name)       { patch.full_name    = parsed.full_name;    applied.push(`👤 ФИО: ${parsed.full_name}`); }
    if (parsed.birth_date)      { patch.birth_date   = parsed.birth_date;   applied.push(`📅 Дата: ${parsed.birth_date}`); }
    if (parsed.city)            { patch.city         = parsed.city;         applied.push(`🏙️ Город: ${parsed.city}`); }
    if (parsed.phone)           { patch.phone        = parsed.phone;        applied.push(`📞 Телефон: ${parsed.phone}`); }
    if (parsed.username)        { patch.username     = parsed.username;     applied.push(`@ Username: ${parsed.username}`); }
    if (parsed.suspected_of)    { patch.suspected_of = parsed.suspected_of; applied.push(`🔴 Подозревается: ${parsed.suspected_of}`); }
    if (parsed.info_text)       { patch.info_text    = parsed.info_text;    applied.push(`ℹ️ Информация: сохранена`); }
    if (parsed.relatives && Object.keys(parsed.relatives).length) {
      const d = await db.getDossier(dossierId);
      patch.relatives = { ...(d?.relatives ?? {}), ...parsed.relatives };
      applied.push(`🧬 Родственники: ${Object.keys(parsed.relatives).length} записей`);
    }

    if (Object.keys(patch).length === 0) {
      await edit(token, chatId, pmid, '⚠️ Не удалось распознать поля в файле.\n\nПопробуйте другой формат.', kbCancel(dossierId)); return;
    }

    await db.applyParsedReport(dossierId, patch);
    await db.upsertSession(userId, 'done', {});
    const summary = applied.join('\n');
    await edit(token, chatId, pmid, `✅ *Отчёт разобран!*\n\nЗаполнено:\n${summary}`, kbView(dossierId)); return;
  }

  // ── Questionnaire ─────────────────────────────────────────────────────────────
  if (state === 'avatar') {
    if (!msg.photo?.length) { await edit(token, chatId, pmid, '❗ Отправьте фотографию.'); return; }
    const targetId  = parseInt(temp_data.target_id, 10);
    const avatarUrl = await db.uploadAvatar(targetId, await dlFile(token, msg.photo[msg.photo.length - 1].file_id));
    await db.upsertDossier(targetId, {
      full_name: temp_data.full_name ?? '',
      birth_date: temp_data.birth_date ?? '',
      city: temp_data.city ?? '',
      phone: temp_data.phone ?? '',
      avatar_url: avatarUrl,
      username: '',
      suspected_of: '',
      notes: '',
      public_messages: '',
      relatives: {},
    });
    await db.upsertSession(userId, 'done', temp_data);
    await edit(token, chatId, pmid, `✅ *Досье создано!*\n\n🔗 https://${env.PAGES_DOMAIN}/${targetId}`, KB_MAIN); return;
  }

  // Generic questionnaire steps
  if (!msg.text) { await edit(token, chatId, pmid, '❗ Введите текст.'); return; }

  const dbField = Q_FIELD[state] ?? '';
  const err = validate(dbField, msg.text);
  if (err) { await edit(token, chatId, pmid, err); return; }
  if (dbField) temp_data[dbField] = msg.text.trim();

  const next = Q_NEXT[state];
  if (!next) return;
  await db.upsertSession(userId, next, { ...temp_data, pmid: String(pmid ?? 0) });
  await edit(token, chatId, pmid, Q_PROMPT[next]!);
}

// ─── Telegram API helpers ──────────────────────────────────────────────────────

async function edit(token: string, chatId: number, msgId: number | undefined, text: string, kb?: InlineKeyboard): Promise<void> {
  if (msgId) {
    const res = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: msgId,
        text,
        parse_mode: 'Markdown',
        ...(kb ? { reply_markup: kb } : { reply_markup: { inline_keyboard: [] } }),
      }),
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

async function deleteMsg(token: string, chatId: number, msgId: number): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: msgId }),
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
