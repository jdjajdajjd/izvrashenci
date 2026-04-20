import type { BotState, Dossier, DossierMedia, Env, MediaSection, MediaType, Relatives, UserSession } from './types';

export class SupabaseClient {
  private readonly url: string;
  private readonly key: string;

  constructor(env: Env) {
    this.url = env.SUPABASE_URL;
    this.key = env.SUPABASE_KEY;
  }

  private headers(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
    };
  }

  async getSession(telegramId: number): Promise<UserSession | null> {
    const res = await fetch(
      `${this.url}/rest/v1/user_sessions?telegram_id=eq.${telegramId}&select=*`,
      { headers: this.headers() },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as UserSession[];
    return rows[0] ?? null;
  }

  async upsertSession(telegramId: number, state: BotState, tempData: Record<string, string>): Promise<void> {
    await fetch(`${this.url}/rest/v1/user_sessions`, {
      method: 'POST',
      headers: { ...this.headers(), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ telegram_id: telegramId, state, temp_data: tempData, updated_at: new Date().toISOString() }),
    });
  }

  async getAllDossiers(): Promise<Pick<Dossier, 'id' | 'full_name'>[]> {
    const res = await fetch(
      `${this.url}/rest/v1/dossiers?select=id,full_name&order=created_at.desc`,
      { headers: this.headers() },
    );
    if (!res.ok) return [];
    return (await res.json()) as Pick<Dossier, 'id' | 'full_name'>[];
  }

  async getDossier(telegramId: number): Promise<Dossier | null> {
    const res = await fetch(
      `${this.url}/rest/v1/dossiers?id=eq.${telegramId}&select=*`,
      { headers: this.headers() },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Dossier[];
    return rows[0] ?? null;
  }

  async upsertDossier(telegramId: number, data: Omit<Dossier, 'id' | 'created_at' | 'info_text' | 'hidden_sections'>): Promise<void> {
    await fetch(`${this.url}/rest/v1/dossiers`, {
      method: 'POST',
      headers: { ...this.headers(), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        id: telegramId,
        info_text: '',
        hidden_sections: [],
        suspected_of: '',
        username: '',
        notes: '',
        public_messages: '',
        relatives: {},
        ...data,
      }),
    });
  }

  async updateDossierField(id: number, field: string, value: string): Promise<void> {
    await fetch(`${this.url}/rest/v1/dossiers?id=eq.${id}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify({ [field]: value }),
    });
  }

  async updateHiddenSections(id: number, sections: string[]): Promise<void> {
    await fetch(`${this.url}/rest/v1/dossiers?id=eq.${id}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify({ hidden_sections: sections }),
    });
  }

  async updateRelatives(id: number, relatives: Relatives): Promise<void> {
    await fetch(`${this.url}/rest/v1/dossiers?id=eq.${id}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify({ relatives }),
    });
  }

  async applyParsedReport(id: number, data: Record<string, unknown>): Promise<void> {
    await fetch(`${this.url}/rest/v1/dossiers?id=eq.${id}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify(data),
    });
  }

  async getMedia(telegramId: number): Promise<DossierMedia[]> {
    const res = await fetch(
      `${this.url}/rest/v1/dossier_media?dossier_id=eq.${telegramId}&order=created_at.asc&select=*`,
      { headers: this.headers() },
    );
    if (!res.ok) return [];
    return (await res.json()) as DossierMedia[];
  }

  async insertMedia(telegramId: number, section: MediaSection, url: string, mediaType: MediaType): Promise<void> {
    await fetch(`${this.url}/rest/v1/dossier_media`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ dossier_id: telegramId, section, url, media_type: mediaType }),
    });
  }

  async uploadAvatar(telegramId: number, buffer: ArrayBuffer): Promise<string> {
    const path = `${telegramId}.jpg`;
    await fetch(`${this.url}/storage/v1/object/avatars/${path}`, {
      method: 'POST',
      headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
      body: buffer,
    });
    return `${this.url}/storage/v1/object/public/avatars/${path}`;
  }

  async uploadMedia(telegramId: number, section: MediaSection, buffer: ArrayBuffer, uuid: string, mediaType: MediaType): Promise<string> {
    const ext         = mediaType === 'video' ? 'mp4' : 'jpg';
    const contentType = mediaType === 'video' ? 'video/mp4' : 'image/jpeg';
    const path        = `${telegramId}/${section}/${uuid}.${ext}`;
    await fetch(`${this.url}/storage/v1/object/media/${path}`, {
      method: 'POST',
      headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, 'Content-Type': contentType, 'x-upsert': 'true' },
      body: buffer,
    });
    return `${this.url}/storage/v1/object/public/media/${path}`;
  }
}
