export type BotState =
  | 'idle'
  | 'target_id'
  | 'full_name'
  | 'birth_date'
  | 'city'
  | 'phone'
  | 'avatar'
  | 'done'
  | 'add_media_id'
  | 'add_media_type'
  | 'add_media_photos';

export type MediaSection = 'correspondence' | 'gallery';

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramMessage {
  message_id: number;
  from: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  photo?: TelegramPhotoSize[];
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface InlineKeyboard {
  inline_keyboard: InlineButton[][];
}

export interface InlineButton {
  text: string;
  callback_data: string;
}

export interface UserSession {
  telegram_id: number;
  state: BotState;
  temp_data: Record<string, string>;
  updated_at: string;
}

export interface Dossier {
  id: number;
  full_name: string;
  birth_date: string;
  city: string;
  phone: string;
  avatar_url: string;
  created_at: string;
}

export interface DossierMedia {
  id: string;
  dossier_id: number;
  section: MediaSection;
  url: string;
  created_at: string;
}

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  PAGES_DOMAIN: string;
}
