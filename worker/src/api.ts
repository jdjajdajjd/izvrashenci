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
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const url = new URL(request.url);

  // GET /api/dossier/:id
  const dossierMatch = url.pathname.match(/^\/api\/dossier\/(\d+)$/);
  if (dossierMatch) {
    const telegramId = parseInt(dossierMatch[1], 10);
    const db = new SupabaseClient(env);
    const dossier = await db.getDossier(telegramId);
    if (!dossier) return json({ error: 'Dossier not found' }, 404);
    return json({
      full_name: dossier.full_name,
      birth_date: dossier.birth_date,
      city: dossier.city,
      phone: dossier.phone,
      avatar_url: dossier.avatar_url,
    });
  }

  // GET /api/dossier/:id/media
  const mediaMatch = url.pathname.match(/^\/api\/dossier\/(\d+)\/media$/);
  if (mediaMatch) {
    const telegramId = parseInt(mediaMatch[1], 10);
    const db = new SupabaseClient(env);
    const media = await db.getMedia(telegramId);
    return json({
      correspondence: media.filter((m) => m.section === 'correspondence').map((m) => m.url),
      gallery: media.filter((m) => m.section === 'gallery').map((m) => m.url),
    });
  }

  return json({ error: 'Not found' }, 404);
}
