import { handleUpdate } from './bot';
import { handleApiRequest } from './api';
import type { Env, TelegramUpdate } from './types';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/webhook') {
      const update = (await request.json()) as TelegramUpdate;
      await handleUpdate(update, env);
      return new Response('OK', { status: 200 });
    }

    if (url.pathname.startsWith('/api/')) {
      return handleApiRequest(request, env);
    }

    return new Response('Not Found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
