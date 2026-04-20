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

  const dossierMatch = url.pathname.match(/^\/api\/dossier\/(\d+)$/);
  if (dossierMatch) {
    const telegramId = parseInt(dossierMatch[1], 10);
    const db = new SupabaseClient(env);
    const d  = await db.getDossier(telegramId);
    if (!d) return json({ error: 'Dossier not found' }, 404);
    return json({
      full_name:       d.full_name,
      birth_date:      d.birth_date,
      city:            d.city,
      phone:           d.phone,
      avatar_url:      d.avatar_url,
      username:        d.username        ?? '',
      suspected_of:    d.suspected_of    ?? '',
      info_text:       d.info_text       ?? '',
      notes:           d.notes           ?? '',
      public_messages: d.public_messages ?? '',
      relatives:       d.relatives       ?? {},
      hidden_sections: d.hidden_sections ?? [],
    });
  }

  const mediaMatch = url.pathname.match(/^\/api\/dossier\/(\d+)\/media$/);
  if (mediaMatch) {
    const telegramId = parseInt(mediaMatch[1], 10);
    const db = new SupabaseClient(env);
    const media = await db.getMedia(telegramId);
    return json({
      correspondence: media.filter((m) => m.section === 'correspondence').map((m) => ({ url: m.url, type: m.media_type })),
      gallery:        media.filter((m) => m.section === 'gallery').map((m) => ({ url: m.url, type: m.media_type })),
    });
  }

  return json({ error: 'Not found' }, 404);
}
