const IN_GAME = typeof GetParentResourceName === 'function';
const RESOURCE = IN_GAME ? GetParentResourceName() : 'glife_tablette';

const $ = (id) => document.getElementById(id);
const tablet = $('tablet');

let apps = [];
let isAdmin = false;
let clockTimer = null;
let editingId = null;
let current = null;

// ===== Outils =====
function post(name, data = {}) {
    if (!IN_GAME) return Preview.handle(name, data);
    return fetch(`https://${RESOURCE}/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(data),
    }).catch(() => {});
}

function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

function initials(label) {
    const words = String(label || '').replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}

function shade(hex, amount) {
    const n = parseInt(hex.replace('#', ''), 16);
    const clamp = (v) => Math.max(0, Math.min(255, v));
    const r = clamp((n >> 16) + amount), g = clamp(((n >> 8) & 255) + amount), b = clamp((n & 255) + amount);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function iconStyle(app) {
    const c = /^#[0-9a-f]{6}$/i.test(app.color || '') ? app.color : '#1ed27a';
    return `background: linear-gradient(145deg, ${shade(c, 25)}, ${shade(c, -45)});`;
}

function iconInner(app) {
    const text = escapeHtml(initials(app.label));
    if (app.icon) return `<img src="${escapeHtml(app.icon)}" alt="" data-fallback="${text}">`;
    return text;
}

// Si une icône ne charge pas, on remet les initiales
document.addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName === 'IMG' && img.dataset.fallback !== undefined) {
        img.replaceWith(document.createTextNode(img.dataset.fallback));
    }
}, true);

function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; }
}

function isHttp(url) { return /^https?:\/\//i.test(url); }

// Uniformise une appli (config.lua, ancien format, JSON du serveur)
function normalize(app) {
    let url = app.url || '';
    if (!url && Array.isArray(app.urls)) url = app.urls[0] || '';
    return {
        id: app.id,
        label: app.label,
        url,
        color: app.color,
        icon: app.icon || '',
        builtin: !!app.builtin,
        hidden: !!app.hidden,
    };
}

// ===== Horloge =====
function updateClock() {
    const now = new Date();
    const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    $('clock').textContent = time;
    $('big-clock').textContent = time;
    $('date').textContent = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ===== Navigation =====
function showView(id) {
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === id));
    if (id !== 'app-view') {
        document.querySelector('.screen').classList.remove('fullsite');
        appExtra().innerHTML = '';
        framesLayer().hidden = true; // le site reste chargé en mémoire : réouverture instantanée
        current = null;
    }
}

function goHome() {
    $('sheet').hidden = true;
    const wasHome = $('home').classList.contains('active');
    showView('home');
    if (!wasHome) {
        $('home').classList.add('again');
        renderApps();
    }
}

// Vague de couleur depuis l'icône, puis ouverture de l'appli
function launchApp(app, el) {
    const screen = document.querySelector('.screen');
    const burst = $('burst');
    const sr = screen.getBoundingClientRect();
    const ir = el.querySelector('.app-icon').getBoundingClientRect();
    const size = Math.hypot(sr.width, sr.height) * 2;
    const c = /^#[0-9a-f]{6}$/i.test(app.color || '') ? app.color : '#1ed27a';
    burst.style.left = `${ir.left + ir.width / 2 - sr.left}px`;
    burst.style.top = `${ir.top + ir.height / 2 - sr.top}px`;
    burst.style.width = burst.style.height = `${size}px`;
    burst.style.background = `radial-gradient(circle, ${shade(c, 20)} 0%, ${shade(c, -60)} 70%)`;
    burst.classList.remove('go');
    void burst.offsetWidth;
    burst.classList.add('go');
    preloadSite(app.url); // le site charge pendant l'animation
    setTimeout(() => openApp(app), 220);
}

// Écran de démarrage avec le logo, à chaque ouverture de la tablette
function playBoot() {
    const boot = $('boot');
    $('home').classList.remove('again');
    boot.hidden = false;
    clearTimeout(playBoot.t);
    playBoot.t = setTimeout(() => { boot.hidden = true; }, 1800);
}

// ===== Accueil =====
function renderApps() {
    const grid = $('apps');
    grid.innerHTML = '';

    apps.filter((a) => !a.hidden).forEach((app) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'app';
        el.style.setProperty('--i', grid.children.length);
        el.innerHTML = `
            <div class="app-icon" style="${iconStyle(app)}">${iconInner(app)}</div>
            <div class="app-label">${escapeHtml(app.label)}</div>`;
        el.addEventListener('click', () => launchApp(app, el));
        el.addEventListener('mouseenter', () => preloadSite(app.url), { once: true });
        el.addEventListener('touchstart', () => preloadSite(app.url), { once: true, passive: true });
        grid.appendChild(el);
    });

    if (!apps.some((a) => !a.hidden)) {
        grid.innerHTML = '<div class="empty">Aucune application disponible pour le moment.</div>';
    }

    $('admin-btn').classList.toggle('on', isAdmin);
    renderAdminList();
}

// ===== Espace admin (mot de passe vérifié par le serveur) =====
function openAdminArea() {
    if (isAdmin) return showView('admin-view');
    $('f-password').value = '';
    $('login-error').textContent = '';
    showView('login-view');
    setTimeout(() => $('f-password').focus(), 50);
}
$('admin-btn').addEventListener('click', openAdminArea);

function tryLogin() {
    const password = $('f-password').value;
    if (!password) {
        $('login-error').textContent = 'Entre le mot de passe.';
        return;
    }
    $('login-btn').disabled = true;
    $('login-error').textContent = '';
    post('login', { password });
}
$('login-btn').addEventListener('click', tryLogin);
$('f-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); tryLogin(); } });
$('eye').addEventListener('click', () => {
    const f = $('f-password');
    f.type = f.type === 'password' ? 'text' : 'password';
});

function onLoginResult(ok, message) {
    $('login-btn').disabled = false;
    if (ok) {
        isAdmin = true;
        renderApps();
        showView('admin-view');
        toast('Espace admin déverrouillé.');
    } else {
        $('login-error').textContent = message || 'Mot de passe incorrect.';
        const card = document.querySelector('.login-card');
        card.classList.remove('shake');
        void card.offsetWidth;
        card.classList.add('shake');
        $('f-password').select();
    }
}

$('logout-btn').addEventListener('click', () => {
    post('logout');
    isAdmin = false;
    renderApps();
    goHome();
    toast('Déconnecté de l\'espace admin.');
});

function renderAdminList() {
    const list = $('admin-list');
    if (!list) return;
    list.innerHTML = '';
    apps.forEach((app) => {
        const row = document.createElement('div');
        row.className = 'admin-row' + (app.hidden ? ' is-hidden' : '');
        row.innerHTML = `
            <div class="app-badge" style="${iconStyle(app)}">${iconInner(app)}</div>
            <div class="admin-info">
                <b>${escapeHtml(app.label)}</b>
                <span>${app.url ? escapeHtml(app.url.replace(/^https?:\/\//i, '')) : 'Pas encore de lien'}</span>
            </div>
            ${app.builtin
                ? (app.hidden
                    ? `<span class="admin-tag">Supprimée</span><button type="button" class="ghost" data-restore="${escapeHtml(app.id)}">Restaurer</button>`
                    : `<button type="button" class="danger-outline small" data-del="${escapeHtml(app.id)}">Supprimer</button>`)
                : `<button type="button" class="ghost" data-edit="${escapeHtml(app.id)}">Modifier</button>
                   <button type="button" class="danger-outline small" data-del="${escapeHtml(app.id)}">Supprimer</button>`}`;
        list.appendChild(row);
    });
    if (!apps.length) list.innerHTML = '<div class="empty">Aucune appli pour le moment.</div>';
}

$('admin-list').addEventListener('click', (e) => {
    const restore = e.target.closest('[data-restore]');
    if (restore) { post('hideApp', { id: restore.dataset.restore, hide: false }); return; }
    const edit = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-del]');
    const app = apps.find((a) => a.id === (edit || del)?.dataset[edit ? 'edit' : 'del']);
    if (!app) return;
    if (edit) openForm(app);
    if (del) askDelete(app);
});
$('admin-add').addEventListener('click', () => openForm(null));
$('form-back').addEventListener('click', () => showView(isAdmin ? 'admin-view' : 'home'));

function askDelete(app) {
    editingId = app.id;
    $('sheet-title').textContent = `Supprimer « ${app.label} » ?`;
    $('sheet').hidden = false;
}

// ===== Ouvrir une appli : le site s'affiche dans la tablette =====
function openApp(app) {
    $('app-title').textContent = app.label;
    $('app-badge').setAttribute('style', iconStyle(app));
    $('app-badge').innerHTML = iconInner(app);
    showView('app-view');
    current = app;
    renderSite();
}

// ===== Sites : gardés en mémoire pour s'ouvrir vite =====
const CAN_EMBED = IN_GAME || location.protocol === 'file:' || document.body.classList.contains('web') || window.GLIFE_API !== undefined;
const MAX_CACHED = 5;           // nombre de sites gardés chargés en mémoire
const frameCache = new Map();   // lien -> iframe

function framesLayer() {
    let l = $('frames');
    if (!l) {
        l = document.createElement('div');
        l.id = 'frames';
        l.hidden = true;
        $('app-body').appendChild(l);
    }
    return l;
}
function appExtra() {
    let x = $('app-extra');
    if (!x) {
        x = document.createElement('div');
        x.id = 'app-extra';
        $('app-body').appendChild(x);
    }
    return x;
}

function preloadSite(url) {
    if (!url || !CAN_EMBED) return null;
    let f = frameCache.get(url);
    if (f) {
        frameCache.delete(url); frameCache.set(url, f); // le plus récent en dernier
        return f;
    }
    f = document.createElement('iframe');
    f.className = 'site-frame';
    f.setAttribute('allow', 'autoplay; clipboard-read; clipboard-write; fullscreen');
    f.addEventListener('load', () => {
        f.dataset.loaded = '1';
        if (f.classList.contains('active')) { const l = $('site-loading'); if (l) l.remove(); }
    });
    f.src = url;
    framesLayer().appendChild(f);
    frameCache.set(url, f);
    sizeFrame(f);
    // on libère les plus anciens si trop de sites sont gardés
    while (frameCache.size > MAX_CACHED) {
        const [oldUrl, old] = frameCache.entries().next().value;
        if (old.classList.contains('active')) break;
        old.remove();
        frameCache.delete(oldUrl);
    }
    return f;
}

function renderSite() {
    const app = current;
    if (!app) return;
    const url = app.url;
    const layer = framesLayer();
    const extra = appExtra();

    if (!url) {
        layer.hidden = true;
        extra.innerHTML = `<div class="placeholder"><b>Bientôt disponible</b>
            <span>Le site de ${escapeHtml(app.label)} n'est pas encore relié.</span></div>`;
        return;
    }

    // Le site prend tout l'écran de la tablette ; seuls 3 petits boutons flottent dans un coin
    document.querySelector('.screen').classList.add('fullsite');
    extra.innerHTML = `<div class="floatbar">
            <button type="button" class="float-btn" data-back-home title="Retour à l'accueil">&#8249;</button>
            <button type="button" class="float-btn" data-reload title="Recharger">&#8635;</button>
            <a class="float-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener" data-external title="Ouvrir dans le navigateur">&#8599;</a>
        </div>`;

    if (!CAN_EMBED) {
        layer.hidden = true;
        extra.insertAdjacentHTML('afterbegin', `<div class="placeholder"><b>${escapeHtml(app.label)}</b>
            <span>En jeu, le site s'affiche ici, dans l'appli.<br>
            Cette page en ligne n'a pas le droit d'afficher d'autres sites.<br>
            Pour le voir dans la tablette, ouvre le fichier <b>Tablette-GLife-TEST.html</b> sur ton PC.</span>
            <code>${escapeHtml(url)}</code>
            <a href="${escapeHtml(url)}" target="_blank" rel="noopener">Ouvrir le site dans un nouvel onglet</a></div>`);
        return;
    }

    const frame = preloadSite(url);
    layer.querySelectorAll('.site-frame').forEach((f) => f.classList.toggle('active', f === frame));
    layer.hidden = false;
    fitSite();
    if (!frame.dataset.loaded) {
        extra.insertAdjacentHTML('afterbegin', `<div class="site-loading" id="site-loading">
            <div class="spinner"></div><span>Chargement de ${escapeHtml(hostOf(url))}...</span></div>`);
    }
}

// Le site est chargé en largeur PC puis réduit pour tenir en entier dans l'écran de la tablette
const SITE_WIDTH = 1280;
function sizeFrame(f) {
    const body = $('app-body');
    const w = body.clientWidth || document.querySelector('.screen').clientWidth;
    const h = body.clientHeight || document.querySelector('.screen').clientHeight;
    if (!w || !h) return;
    const s = Math.min(1, w / SITE_WIDTH);
    f.style.width = `${w / s}px`;
    f.style.height = `${h / s}px`;
    f.style.transform = `scale(${s})`;
}
function fitSite() {
    framesLayer().querySelectorAll('.site-frame').forEach(sizeFrame);
}
new ResizeObserver(fitSite).observe(document.querySelector('.screen'));

$('app-body').addEventListener('click', (e) => {
    if (e.target.closest('[data-back-home]')) return goHome();
    if (e.target.closest('[data-reload]')) {
        const f = framesLayer().querySelector('.site-frame.active');
        if (f) { delete f.dataset.loaded; f.src = f.src; }
        return;
    }
    const ext = e.target.closest('[data-external]');
    if (ext && IN_GAME && typeof window.invokeNative === 'function') {
        e.preventDefault();
        window.invokeNative('openUrl', ext.href);
    }
});

// ===== Formulaire ajout / modification =====
function updateFormBadge() {
    const icon = $('f-icon').value.trim();
    const fake = { label: $('f-label').value || '?', color: $('f-color').value, icon: isHttp(icon) ? icon : '' };
    $('form-badge').setAttribute('style', iconStyle(fake));
    $('form-badge').innerHTML = iconInner(fake);
}
['f-label', 'f-color', 'f-icon'].forEach((id) => $(id).addEventListener('input', updateFormBadge));

function openForm(app) {
    editingId = app ? app.id : null;
    $('form-title').textContent = app ? `Modifier « ${app.label} »` : 'Ajouter un site';
    $('delete-btn').hidden = !app;
    $('f-label').value = app?.label || '';
    $('f-url').value = app?.url || '';
    $('f-color').value = /^#[0-9a-f]{6}$/i.test(app?.color || '') ? app.color : '#1ed27a';
    $('f-icon').value = app?.icon || '';
    updateFormBadge();
    showView('form-view');
    $('f-label').focus();
}

function submitForm() {
    let url = $('f-url').value.trim();
    if (url && !isHttp(url)) url = 'https://' + url;
    const data = {
        id: editingId || undefined,
        label: $('f-label').value.trim(),
        url,
        color: $('f-color').value,
        icon: $('f-icon').value.trim(),
    };
    if (data.label.length < 1 || data.label.length > 24) return toast('Le nom doit faire entre 1 et 24 caractères.');
    if (!data.url) return toast('Colle le lien du site.');
    if (data.icon && !isHttp(data.icon)) return toast("Le lien de l'icône doit commencer par http:// ou https://");
    post(editingId ? 'editApp' : 'addApp', data);
    showView('admin-view');
}
$('submit-btn').addEventListener('click', submitForm);
$('app-form').addEventListener('submit', (e) => e.preventDefault());
$('app-form').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); submitForm(); }
});

// Suppression avec confirmation intégrée à la tablette
$('delete-btn').addEventListener('click', () => {
    const app = apps.find((a) => a.id === editingId);
    if (app) askDelete(app);
});
$('sheet-cancel').addEventListener('click', () => { $('sheet').hidden = true; });
$('sheet-ok').addEventListener('click', () => {
    const target = apps.find((a) => a.id === editingId);
    if (target && target.builtin) post('hideApp', { id: target.id, hide: true });
    else if (editingId) post('removeApp', { id: editingId });
    editingId = null;
    $('sheet').hidden = true;
    showView('admin-view');
});

// ===== Toast =====
let toastTimer = null;
function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ===== Boutons et clavier =====
document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', goHome));

function close() {
    tablet.hidden = true;
    goHome();
    clearInterval(clockTimer);
    if (IN_GAME) post('close');
    else Preview.closed();
}

document.addEventListener('keydown', (e) => {
    if (tablet.hidden || e.key !== 'Escape') return;
    if (!$('sheet').hidden) { $('sheet').hidden = true; return; }
    if (!$('home').classList.contains('active')) goHome();
    else close();
});

// ===== Messages du client Lua =====
function setApps(list, admin) {
    apps = (list || []).map(normalize);
    if (admin !== undefined && admin !== null) isAdmin = !!admin;
    renderApps();
}

window.addEventListener('message', ({ data }) => {
    switch (data.action) {
        case 'open':
            $('server-name').textContent = data.serverName || 'GLife';
            setApps(data.apps, data.isAdmin);
            goHome();
            updateClock();
            clearInterval(clockTimer);
            clockTimer = setInterval(updateClock, 1000);
            playBoot();
            tablet.hidden = false;
            break;
        case 'apps':
            setApps(data.apps, data.isAdmin);
            break;
        case 'toast':
            toast(data.message);
            break;
        case 'loginResult':
            onLoginResult(data.ok, data.message);
            break;
        case 'close':
            tablet.hidden = true;
            goHome();
            clearInterval(clockTimer);
            break;
    }
});

/* =====================================================================
   TEST HORS JEU : actif seulement quand la page est ouverte dans un
   navigateur. Remplace le serveur (ajouts gardés dans le navigateur)
   et ajoute le champ « Tester un site ».
   ===================================================================== */
const Preview = (() => {
    const STORE = 'glife_tablette_test_sites';
    const CONFIG_APPS = [
        { id: 'casaverde', label: 'Casa Verde', color: '#1ed27a', url: 'https://casaverdeglite.netlify.app/', builtin: true },
        { id: 'ltdsud', label: 'LTD Sud', color: '#f28c28', url: '', builtin: true },
        { id: 'bennys', label: "Benny's", color: '#d4a72c', url: '', builtin: true },
    ];

    let custom = load();
    let admin = false;
    const TEST_PASSWORD = '72Master';

    function load() {
        try { const v = JSON.parse(localStorage.getItem(STORE) || '[]'); return Array.isArray(v) ? v : []; }
        catch (e) { return []; }
    }
    function save() { try { localStorage.setItem(STORE, JSON.stringify(custom)); } catch (e) {} }
    let hidden = [];
    try { hidden = JSON.parse(localStorage.getItem(STORE + '_hidden') || '[]'); } catch (e) {}
    function all() { return [...CONFIG_APPS.map((a) => ({ ...a, hidden: hidden.includes(a.id) })), ...custom]; }
    function push() { window.postMessage({ action: 'apps', apps: all(), isAdmin: admin }, '*'); }
    function msg(text) { window.postMessage({ action: 'toast', message: text }, '*'); }
    function openTablet() { window.postMessage({ action: 'open', serverName: 'GLife', apps: all(), isAdmin: admin }, '*'); }

    function handle(name, data) {
        if (name === 'login') {
            const ok = data.password === TEST_PASSWORD;
            if (ok) admin = true;
            setTimeout(() => window.postMessage({ action: 'loginResult', ok, message: ok ? '' : 'Mot de passe incorrect.' }, '*'), 250);
            return Promise.resolve();
        }
        if (name === 'logout') { admin = false; push(); return Promise.resolve(); }
        if (!admin) return Promise.resolve();
        if (name === 'hideApp') {
            hidden = hidden.filter((id) => id !== data.id);
            if (data.hide) hidden.push(data.id);
            try { localStorage.setItem(STORE + '_hidden', JSON.stringify(hidden)); } catch (e) {}
            const app = CONFIG_APPS.find((a) => a.id === data.id);
            if (app) msg(`Application « ${app.label} » ${data.hide ? 'supprimée' : 'restaurée'}.`);
            push();
            return Promise.resolve();
        }
        const clean = { label: data.label, url: data.url, color: data.color, icon: isHttp(data.icon || '') ? data.icon : '' };
        if (name === 'addApp') {
            custom.push({ ...clean, id: 'custom_' + Date.now() });
            msg(`Application « ${clean.label} » ajoutée.`);
        } else if (name === 'editApp') {
            const i = custom.findIndex((a) => a.id === data.id);
            if (i >= 0) custom[i] = { ...clean, id: data.id };
            msg(`Application « ${clean.label} » modifiée.`);
        } else if (name === 'removeApp') {
            const app = custom.find((a) => a.id === data.id);
            custom = custom.filter((a) => a.id !== data.id);
            if (app) msg(`Application « ${app.label} » supprimée.`);
        }
        save();
        push();
        return Promise.resolve();
    }

    function closed() { $('closed').hidden = false; }

    function boot() {
        document.body.classList.add('preview');
        document.body.insertAdjacentHTML('afterbegin', `
            <form class="quicktest" id="quicktest" autocomplete="off">
                <label for="qt-url">Tester un site</label>
                <input id="qt-url" placeholder="Colle un lien, ex : https://ton-site.fr" inputmode="url">
                <button type="button" class="primary" id="qt-go">Voir dans la tablette</button>
            </form>`);
        tablet.insertAdjacentHTML('afterend', `
            <div class="closed" id="closed" hidden>
                <span>Tablette rangée.</span>
                <button class="primary" id="reopen" type="button">Rouvrir la tablette</button>
            </div>`);

        const quickTest = () => {
            let url = $('qt-url').value.trim();
            if (!url) return msg('Colle un lien à tester.');
            if (!isHttp(url)) url = 'https://' + url;
            $('closed').hidden = true;
            if (tablet.hidden) openTablet();
            setTimeout(() => openApp(normalize({ id: 'quicktest', label: hostOf(url), color: '#1ed27a', url, builtin: true })), 30);
        };
        $('qt-go').addEventListener('click', quickTest);
        $('quicktest').addEventListener('submit', (e) => e.preventDefault());
        $('qt-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); quickTest(); } });
        $('reopen').addEventListener('click', () => { $('closed').hidden = true; openTablet(); });

        openTablet();
    }

    return { handle, closed, boot };
})();

if (!IN_GAME) Preview.boot();
