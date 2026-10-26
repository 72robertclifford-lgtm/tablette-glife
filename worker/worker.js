// Cloudflare Worker : liste des applis de la tablette GLife, partagée par tout le monde.
// Stockage : KV (binding APPS_KV). Mot de passe admin : secret ADMIN_PASSWORD (jamais dans le code).

const DEFAULT_APPS = [
  { id: 'casaverde', label: 'Casa Verde', color: '#1ed27a', icon: '', url: 'https://casaverdeglite.netlify.app/' },
  { id: 'cid', label: 'CID', color: '#2b8fd6', icon: '', url: 'https://72robertclifford-lgtm.github.io/CID-PANEL/' },
  { id: 'ltdsud', label: 'LTD Sud', color: '#f28c28', icon: '', url: '' },
  { id: 'bennys', label: "Benny's", color: '#d4a72c', icon: '', url: '' },
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS } });

async function loadApps(env) {
  const raw = await env.APPS_KV.get('apps');
  if (!raw) return DEFAULT_APPS;
  try { const list = JSON.parse(raw); return Array.isArray(list) ? list : DEFAULT_APPS; } catch { return DEFAULT_APPS; }
}
const saveApps = (env, list) => env.APPS_KV.put('apps', JSON.stringify(list));

// Comparaison à temps constant pour le mot de passe
function samePassword(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

// Anti force brute : 5 essais ratés par IP et par minute
async function tooManyTries(env, ip) {
  const n = parseInt((await env.APPS_KV.get('fail:' + ip)) || '0', 10);
  return n >= 5;
}
async function addFail(env, ip) {
  const n = parseInt((await env.APPS_KV.get('fail:' + ip)) || '0', 10);
  await env.APPS_KV.put('fail:' + ip, String(n + 1), { expirationTtl: 60 });
}

function clean(app) {
  const label = String(app.label || '').trim();
  let url = String(app.url || '').trim();
  if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
  if (label.length < 1 || label.length > 24) return [null, 'Le nom doit faire entre 1 et 24 caractères.'];
  if (!url || url.length > 500) return [null, 'Colle le lien du site.'];
  const color = /^#[0-9a-f]{6}$/i.test(app.color || '') ? app.color : '#1ed27a';
  const icon = /^https?:\/\//i.test(app.icon || '') && app.icon.length <= 500 ? app.icon : '';
  return [{ label, url, color, icon }, null];
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const path = new URL(request.url).pathname.replace(/\/+$/, '');

    if (request.method === 'GET' && (path === '' || path === '/apps')) return json(await loadApps(env));

    // Tout le reste demande le mot de passe admin
    const ip = request.headers.get('CF-Connecting-IP') || 'inconnu';
    if (await tooManyTries(env, ip)) return json({ error: "Trop d'essais. Réessaie dans une minute." }, 429);
    if (!samePassword(request.headers.get('X-Admin-Password'), env.ADMIN_PASSWORD)) {
      await addFail(env, ip);
      return json({ error: 'Mot de passe incorrect.' }, 401);
    }

    if (request.method === 'POST' && path === '/login') return json({ ok: true });

    const list = await loadApps(env);
    const m = path.match(/^\/apps\/([\w-]+)$/);

    if (request.method === 'POST' && path === '/apps') {
      const [app, err] = clean(await request.json().catch(() => ({})));
      if (!app) return json({ error: err }, 400);
      app.id = 'app_' + Date.now().toString(36);
      list.push(app);
      await saveApps(env, list);
      return json(list);
    }
    if (request.method === 'PUT' && m) {
      const i = list.findIndex((a) => a.id === m[1]);
      if (i < 0) return json({ error: "Cette appli n'existe plus." }, 404);
      const [app, err] = clean(await request.json().catch(() => ({})));
      if (!app) return json({ error: err }, 400);
      list[i] = { ...app, id: m[1] };
      await saveApps(env, list);
      return json(list);
    }
    if (request.method === 'DELETE' && m) {
      const next = list.filter((a) => a.id !== m[1]);
      await saveApps(env, next);
      return json(next);
    }
    return json({ error: 'Introuvable' }, 404);
  },
};
