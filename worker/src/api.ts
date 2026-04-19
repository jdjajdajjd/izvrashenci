import { SupabaseClient } from './supabase';
import type { Env } from './types';

const CORS: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

export async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/dossier\/(\d+)$/);

  if (!match) {
    return json({ error: 'Not found' }, 404);
  }

  const telegramId = parseInt(match[1], 10);
  if (isNaN(telegramId)) {
    return json({ error: 'Invalid telegram_id' }, 400);
  }

  const db = new SupabaseClient(env);
  const dossier = await db.getDossier(telegramId);

  if (!dossier) {
    return json({ error: 'Dossier not found' }, 404);
  }

  return json({
    full_name: dossier.full_name,
    birth_date: dossier.birth_date,
    city: dossier.city,
    phone: dossier.phone,
    avatar_url: dossier.avatar_url,
  });
}
