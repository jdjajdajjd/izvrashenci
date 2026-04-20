export type BotState =
  | 'idle'
  | 'target_id'
  | 'full_name'
  | 'birth_date'
  | 'city'
  | 'phone'
  | 'avatar'
  | 'done'
  | 'add_media_photos'
  | 'edit_field'
  | 'add_info'
  | 'add_notes'
  | 'add_public_messages'
  | 'edit_relative'
  | 'parse_file';

export type MediaSection = 'correspondence' | 'gallery';
export type MediaType = 'image' | 'video';

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

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  mime_type?: string;
  file_size?: number;
  file_name?: string;
}

export interface TelegramVideo {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramMessage {
  message_id: number;
  from: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  photo?: TelegramPhotoSize[];
  video?: TelegramVideo;
  document?: TelegramDocument;
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

export interface Relatives {
  mother?: string;
  father?: string;
  brother_1?: string;
  brother_2?: string;
  brother_3?: string;
  sister_1?: string;
  sister_2?: string;
  sister_3?: string;
  grandma_1?: string;
  grandma_2?: string;
  grandpa_1?: string;
  grandpa_2?: string;
}

export interface Dossier {
  id: number;
  full_name: string;
  birth_date: string;
  city: string;
  phone: string;
  avatar_url: string;
  username: string;
  suspected_of: string;
  info_text: string;
  notes: string;
  public_messages: string;
  relatives: Relatives;
  hidden_sections: string[];
  created_at: string;
}

export interface DossierMedia {
  id: string;
  dossier_id: number;
  section: MediaSection;
  media_type: MediaType;
  url: string;
  created_at: string;
}

export interface ParsedReport {
  full_name?: string;
  birth_date?: string;
  city?: string;
  phone?: string;
  username?: string;
  suspected_of?: string;
  info_text?: string;
  relatives?: Relatives;
}

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  PAGES_DOMAIN: string;
  KIE_AI_KEY?: string;
}
