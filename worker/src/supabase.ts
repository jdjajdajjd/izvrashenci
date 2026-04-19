import type { BotState, Dossier, Env, UserSession } from './types';

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

  async upsertSession(
    telegramId: number,
    state: BotState,
    tempData: Record<string, string>,
  ): Promise<void> {
    await fetch(`${this.url}/rest/v1/user_sessions`, {
      method: 'POST',
      headers: {
        ...this.headers(),
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        telegram_id: telegramId,
        state,
        temp_data: tempData,
        updated_at: new Date().toISOString(),
      }),
    });
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

  async upsertDossier(
    telegramId: number,
    data: Omit<Dossier, 'id' | 'created_at'>,
  ): Promise<void> {
    await fetch(`${this.url}/rest/v1/dossiers`, {
      method: 'POST',
      headers: {
        ...this.headers(),
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ id: telegramId, ...data }),
    });
  }

  async uploadAvatar(
    telegramId: number,
    buffer: ArrayBuffer,
    contentType: string,
  ): Promise<string> {
    const path = `${telegramId}.jpg`;
    await fetch(`${this.url}/storage/v1/object/avatars/${path}`, {
      method: 'POST',
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: buffer,
    });
    return `${this.url}/storage/v1/object/public/avatars/${path}`;
  }
}
