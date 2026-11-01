// Nonocat on Cloudflare: serves the game from public/ and keeps each player's
// progress in a Durable Object, a small database Cloudflare creates on deploy.
// Requests for game files never reach this code; only /api/progress does.
import { DurableObject } from 'cloudflare:workers';
import '../public/js/sync.js';

const { mergeProgress } = globalThis.Sync;
const MAX_BODY = 1000000;

// One store per nickname. Cloudflare runs each one's calls one at a time,
// so two phones saving at once can't overwrite each other.
export class PlayerSave extends DurableObject {
  async exchange(data, reset) {
    const stored = await this.ctx.storage.get('progress');
    const merged = mergeProgress(reset ? null : stored, data);
    await this.ctx.storage.put('progress', merged);
    return { data: merged, existed: !!stored };
  }

  async read() {
    return (await this.ctx.storage.get('progress')) || null;
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function playerStore(env, nick) {
  const key = String(nick || '').trim().toLowerCase();
  if (!key || key.length > 30) throw new Error('bad nickname');
  return env.PLAYERS.get(env.PLAYERS.idFromName(key));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/progress') return env.ASSETS.fetch(request);
    try {
      if (request.method === 'GET') {
        return json({ ok: true, data: await playerStore(env, url.searchParams.get('nick')).read() });
      }
      if (request.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405);
      const text = await request.text();
      if (text.length > MAX_BODY) return json({ ok: false, error: 'too large' }, 413);
      const body = JSON.parse(text);
      const result = await playerStore(env, body.nick).exchange(body.data, !!body.reset);
      return json({ ok: true, data: result.data, existed: result.existed });
    } catch (err) {
      return json({ ok: false, error: String((err && err.message) || err) }, 400);
    }
  },
};
