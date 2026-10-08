/* Fundus – Konto: Registrieren, Anmelden, Kundenkonto.
 *
 * Fundus.auth = {
 *   init()                     Dialoge anlegen, Sitzung wiederherstellen, dann emit('session', { user })
 *   current()                  angemeldeter Nutzer ohne Passwortdaten oder null (synchron)
 *   isAdmin()
 *   requireLogin(reason?)      Promise<user|null>: öffnet Anmelden/Registrieren, null bei Abbruch
 *   openAccount(tab?)          'overview' | 'orders' | 'addresses' | 'settings'; abgemeldet: Anmelden
 *   logout()
 *   update(patch)              name, addresses, shopName, city und Rolle 'customer' -> 'seller'
 *   setPassword(userId, pw)    nur für Admins (Verwaltung → Kunden: Passwort neu setzen)
 *   hashPassword(pw)           -> { hash, salt, iter } (PBKDF2-SHA256, hex)
 * }
 * Passwörter liegen nur als PBKDF2-Hash mit zufälligem Salt im Nutzer (user.pw). Fehlt
 * crypto.subtle, legt das Modul keine Konten an und sagt das deutlich.
 * Sendet 'session' { user } bei Anmeldung, Abmeldung und jeder Änderung am eigenen Konto.
 */
(() => {
'use strict';
const F = window.Fundus = window.Fundus || {};
const U = F.util;
const { $, $$, esc, ic } = U;

/* ---------- Konstanten ---------- */
const ITER = 150000;
const MAX_FAILS = 5;
const LOCK_MS = 30000;
const LOCK_KEY = 'fundus.authLock';
const MAX_ADDR = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/;
const TABS = { overview: ['Übersicht', 'user'], orders: ['Bestellungen', 'box'], addresses: ['Adressen', 'truck'], settings: ['Einstellungen', 'settings'] };
const ROLES = { admin: 'Admin', seller: 'Verkäufer', customer: 'Kunde' };
const BANK = { name: 'Fundus Demo', iban: 'DE89 3704 0044 0532 0130 00' };
const PAY_STATE = { paid: 'bezahlt', pending: 'offen', refunded: 'erstattet', failed: 'fehlgeschlagen' };
const FLOW = ['paid', 'processing', 'shipped', 'delivered'];
const STRENGTH = ['', 'Schwach', 'Mittel', 'Gut', 'Stark'];
const NO_CRYPTO = 'Dieser Browser kann Passwörter nicht sicher speichern. Öffne den Shop in einem aktuellen Browser über https, zum Beispiel Chrome, Firefox, Safari oder Edge.';
const monthFmt = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
const pctFmt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

/* ---------- Zustand ---------- */
const S = {
  me: null,            // angemeldeter Nutzer mit Passwortdaten (nur intern)
  users: 0,            // Anzahl Konten auf diesem Gerät
  mode: 'login',       // Anmelden oder Registrieren
  waiters: [],         // offene requireLogin()-Versprechen
  busy: false,
  saving: false,       // eigene Speichervorgänge: users:change dann nicht noch einmal auswerten
  lock: { fails: 0, until: 0 },
  lockTimer: 0,
  wasLocked: false,
  heightTimer: 0,
  tab: 'overview',
  tok: 0,              // verhindert, dass ein älteres Rendern ein neueres überschreibt
  orders: [],
  otherAdmins: 0,
  open: new Set(),     // aufgeklappte Bestellungen
  addrEdit: null,      // null | 'new' | Adress-ID
  addrDel: null,       // Adresse mit offener Rückfrage
  delStep: false,      // Konto löschen: Rückfrage offen
  started: false
};

/* ---------- Helfer ---------- */
const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
const pub = u => { if (!u) return null; const c = clone(u); delete c.pw; return c; };
const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 200);
const money = n => U.eur.format(Number(n) || 0);
const num = n => U.int.format(Number(n) || 0);
const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
const when = (s, fmt) => { const d = new Date(s); return s && !isNaN(d) ? (fmt || U.dateFmt).format(d) : ''; };
const hex = (v, f) => (/^#[0-9a-f]{3,8}$/i.test(String(v || '')) ? v : f);
const wait = ms => new Promise(r => setTimeout(r, ms));
const firstName = u => String((u && (u.name || u.email)) || '').trim().split(/\s+/)[0];
const domId = s => String(s).replace(/[^\w-]/g, '_');
const fine = () => matchMedia('(pointer: fine)').matches;
const dlgA = () => document.getElementById('dlgAuth');
const dlgK = () => document.getElementById('dlgAccount');
const accountOpen = () => !!(dlgK() && dlgK().open);
function initials(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  const a = Array.from(w[0])[0] || '';
  const b = w.length > 1 ? Array.from(w[w.length - 1])[0] || '' : '';
  return (a + b).toUpperCase();
}
// Bestellpositionen nur mit geprüften Farben und Motiven an die Illustration geben
function artOf(it) {
  const pic = Object.prototype.hasOwnProperty.call(F.art.ART, it.pic) ? it.pic : 'linen';
  return F.shop.ui.art({ pic, c: hex(it.c, '#7E9AB0'), d: hex(it.d, '#E8E1D3'), img: it.img });
}

/* ---------- Passwörter ---------- */
const cryptoOk = () => !!(window.crypto && window.crypto.subtle && typeof window.crypto.getRandomValues === 'function' && window.TextEncoder);
const toHex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
const fromHex = h => new Uint8Array((String(h || '').match(/[0-9a-f]{2}/gi) || []).map(x => parseInt(x, 16)));
async function derive(password, salt, iter) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(password).normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
  return toHex(bits);
}
// Vergleich in konstanter Zeit: läuft immer über die volle Länge
function same(a, b) {
  const x = String(a), y = String(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x.charCodeAt(i) | 0) ^ (y.charCodeAt(i) | 0);
  return diff === 0;
}
async function hashPassword(password) {
  if (!cryptoOk()) throw new Error(NO_CRYPTO);
  if (typeof password !== 'string' || !password) throw new Error('Gib ein Passwort ein.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { hash: await derive(password, salt, ITER), salt: toHex(salt), iter: ITER };
}
async function checkPassword(password, pw) {
  if (!cryptoOk() || !pw || typeof pw.hash !== 'string' || typeof pw.salt !== 'string') return false;
  const iter = Number(pw.iter);
  // Unsinnige Werte (z. B. aus einer fremden Sicherung) nicht rechnen lassen
  if (!Number.isInteger(iter) || iter < 1000 || iter > 5e6) return false;
  const salt = fromHex(pw.salt);
  if (salt.length < 8) return false;
  return same(await derive(password, salt, iter), pw.hash.toLowerCase());
}
function pwProblem(pw) {
  const s = String(pw || '');
  if (!s) return 'Gib ein Passwort ein.';
  if (s.length < 8) return `Das Passwort braucht mindestens 8 Zeichen. Es fehlen noch ${8 - s.length}.`;
  if (s.length > 200) return 'Das Passwort darf höchstens 200 Zeichen lang sein.';
  if (!/\p{L}/u.test(s) || !/\d/.test(s)) return 'Nimm mindestens einen Buchstaben und eine Ziffer.';
  return '';
}
// 0 = leer, 1 = zu kurz/schwach, 2 = mittel, 3 = gut, 4 = stark
function strength(pw) {
  const s = String(pw || '');
  if (!s) return 0;
  if (pwProblem(s)) return 1;
  const kinds = [/\p{Ll}/u, /\p{Lu}/u, /\d/, /[^\p{L}\d]/u].filter(r => r.test(s)).length;
  let n = 2;
  if (s.length >= 12) n++;
  if (kinds >= 3) n++;
  if (/^(.)\1+$/.test(s) || /(0123|1234|2345|3456|4567|5678|6789|abcd|qwert|asdf|passwor|fundus)/i.test(s)) n = Math.min(n, 1);
  return Math.min(n, 4);
}

/* ---------- Sperre nach Fehlversuchen ---------- */
function loadLock() {
  const l = U.store.get(LOCK_KEY, null);
  S.lock = { fails: Math.max(0, Number(l && l.fails) || 0), until: Number(l && l.until) || 0 };
}
const saveLock = () => U.store.set(LOCK_KEY, S.lock);
// Höchstens 30 Sekunden, auch wenn die Uhr des Geräts zurückgestellt wurde
const lockLeft = () => Math.min(LOCK_MS / 1000, Math.max(0, Math.ceil((S.lock.until - Date.now()) / 1000)));
function failAttempt() {
  S.lock.fails += 1;
  if (S.lock.fails >= MAX_FAILS) { S.lock = { fails: 0, until: Date.now() + LOCK_MS }; }
  saveLock();
  return lockLeft() ? 0 : MAX_FAILS - S.lock.fails;
}
function clearLock() { S.lock = { fails: 0, until: 0 }; saveLock(); }
function tickLock() {
  clearTimeout(S.lockTimer);
  const d = dlgA();
  if (!d) return;
  const f = $('#auLogin', d), b = $('#auLoginBtn', d), box = $('.au-alert', f);
  const left = lockLeft();
  if (left > 0) {
    b.disabled = true;
    b.textContent = `Noch ${left} s warten`;
    const n = $('[data-au-left]', box);
    if (!S.wasLocked || box.hidden || !n) {
      box.className = 'au-alert';
      box.innerHTML = `${ic('lock')}<span>Zu viele falsche Versuche. Warte <b data-au-left aria-hidden="true">${left}</b><span class="sr">${left}</span> Sekunden, dann versuch es noch einmal.</span>`;
      box.hidden = false;
    } else n.textContent = left;
    S.wasLocked = true;
    if (d.open) S.lockTimer = setTimeout(tickLock, 1000);
  } else {
    if (!S.busy) { b.disabled = !cryptoOk(); b.textContent = b.dataset.auLabel; }
    if (S.wasLocked) {
      S.wasLocked = false;
      box.className = 'au-alert ok';
      box.innerHTML = `${ic('check')}<span>Du kannst dich jetzt wieder anmelden.</span>`;
      box.hidden = false;
    }
  }
}

/* ---------- Formular-Bausteine ---------- */
const eyeBtn = id => `<button class="au-eye" type="button" data-au-eye="${id}" aria-controls="${id}" aria-pressed="false" aria-label="Passwort anzeigen">${ic('eye')}</button>`;
const meterHTML = id => `<div class="au-meter" id="${id}Meter" data-l="0"><div class="au-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></div><span class="au-ml"></span></div>
  <ul class="au-rules" aria-label="Anforderungen an das Passwort"><li data-rule="len" data-ok="false">${ic('check')}Mindestens 8 Zeichen</li><li data-rule="mix" data-ok="false">${ic('check')}Buchstabe und Ziffer</li></ul>`;
// o: { id, label, type, ac, value, hint, pw, meter, attrs, cls }
function field(o) {
  const desc = [o.hint ? o.id + 'Hint' : '', o.meter ? o.id + 'Meter' : '', o.id + 'Err'].filter(Boolean).join(' ');
  return `<div class="field au-field${o.cls ? ' ' + o.cls : ''}">
    <label for="${o.id}">${o.label}</label>
    <div class="au-inp${o.pw ? ' au-pw' : ''}">
      <input class="inp" id="${o.id}" name="${o.id}" type="${o.pw ? 'password' : o.type || 'text'}" autocomplete="${o.ac || 'off'}" value="${o.pw ? '' : esc(o.value || '')}" aria-describedby="${desc}" aria-invalid="false"${o.attrs || ''}>
      ${o.pw ? eyeBtn(o.id) : ''}
    </div>
    ${o.meter ? meterHTML(o.id) : ''}
    ${o.hint ? `<p class="hint" id="${o.id}Hint">${o.hint}</p>` : ''}
    <p class="hint err au-err" id="${o.id}Err" hidden></p>
  </div>`;
}
// Fehler direkt am Feld; act = { label, mode } zeigt einen Knopf zum Wechseln
function fieldErr(id, msg, act) {
  const inp = document.getElementById(id), box = document.getElementById(id + 'Err');
  if (!inp || !box) return true;
  box.innerHTML = msg ? `${ic('alert')}<span>${esc(msg)}</span>${act ? `<button class="linkbtn au-lb" type="button" data-au-mode="${esc(act.mode)}">${esc(act.label)}</button>` : ''}` : '';
  box.hidden = !msg;
  inp.setAttribute('aria-invalid', msg ? 'true' : 'false');
  return true;
}
function formErr(form, msg, tone) {
  const box = form && $('.au-alert', form);
  if (!box) return;
  box.className = 'au-alert' + (tone ? ' ' + tone : '');
  box.innerHTML = msg ? `${ic(tone === 'ok' ? 'check' : 'alert')}<span>${esc(msg)}</span>` : '';
  box.hidden = !msg;
}
function clearErrs(form) {
  $$('.au-err', form).forEach(e => { e.hidden = true; e.innerHTML = ''; });
  $$('[aria-invalid="true"]', form).forEach(i => i.setAttribute('aria-invalid', 'false'));
  formErr(form, '');
}
// Fehler sichtbar machen: erstes falsches Feld fokussieren, Formular kurz schütteln
function fail(form) {
  const bad = $('[aria-invalid="true"]', form);
  if (bad) bad.focus();
  if (!U.reduced()) { form.classList.remove('au-shake'); void form.offsetWidth; form.classList.add('au-shake'); }
  return false;
}
function busy(form, on, label) {
  S.busy = on;
  const b = form && $('button[type="submit"]', form);
  if (!b) return;
  if (on) {
    b.disabled = true;
    b.innerHTML = `<span class="au-spin" aria-hidden="true"></span>${esc(label || 'Einen Moment …')}`;
    form.setAttribute('aria-busy', 'true');
  } else {
    b.disabled = false;
    b.classList.remove('au-ok');
    b.innerHTML = esc(b.dataset.auLabel || 'Speichern');
    form.removeAttribute('aria-busy');
  }
}
function meter(inp) {
  const f = inp.closest('.au-field');
  const m = f && $('.au-meter', f);
  if (!m) return;
  const v = inp.value, l = strength(v);
  m.dataset.l = l;
  $('.au-ml', m).innerHTML = v ? `<span class="sr">Passwortstärke: </span>${l === 1 && v.length < 8 ? 'Zu kurz' : STRENGTH[l]}` : '';
  const ok = { len: v.length >= 8, mix: /\p{L}/u.test(v) && /\d/.test(v) };
  $$('.au-rules li', f).forEach(li => { li.dataset.ok = ok[li.dataset.rule]; });
}
function toggleEye(b) {
  const inp = document.getElementById(b.dataset.auEye);
  if (!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  b.setAttribute('aria-pressed', String(show));
  b.innerHTML = ic(show ? 'eyeOff' : 'eye');
}
function focusId(id) {
  const el = id && document.getElementById(id);
  if (el) el.focus();
}

/* ---------- Sitzung ---------- */
function current() { return pub(S.me); }
function isAdmin() { return !!(S.me && S.me.role === 'admin'); }
async function saveUser(rec) {
  S.saving = true;
  try { return await F.db.users.save(rec); } finally { S.saving = false; }
}
async function signIn(user) {
  S.me = user;
  await F.db.session.set(user.id);
  clearLock();
  F.emit('session', { user: current() });
}
async function logout() {
  if (!S.me) return;
  S.me = null;
  try { await F.db.session.set(null); } catch (e) { /* Sitzung muss nicht gespeichert werden */ }
  if (accountOpen()) dlgK().close();
  F.emit('session', { user: null });
  U.toast('Du bist abgemeldet.');
}
// Konto wurde von außen gesperrt oder entfernt
async function forceOut(msg) {
  S.me = null;
  try { await F.db.session.set(null); } catch (e) { /* egal */ }
  if (accountOpen()) dlgK().close();
  F.emit('session', { user: null });
  U.toast(esc(msg), null, { type: 'err', duration: 8000 });
}
// Aktuellen Stand des eigenen Kontos aus der Datenbank holen (fremde Änderungen nicht überschreiben)
async function fresh() {
  const u = S.me && await F.db.users.get(S.me.id);
  if (!u || u.blocked) {
    await forceOut(u ? 'Dein Konto wurde gesperrt. Du bist jetzt abgemeldet.' : 'Dein Konto gibt es auf diesem Gerät nicht mehr. Du bist jetzt abgemeldet.');
    throw new Error('Du bist nicht mehr angemeldet.');
  }
  return u;
}

function cleanAddresses(list) {
  if (!Array.isArray(list)) throw new Error('Die Adressen haben ein ungültiges Format.');
  if (list.length > MAX_ADDR) throw new Error(`Du kannst höchstens ${MAX_ADDR} Adressen speichern. Entferne zuerst eine.`);
  const ids = new Set();
  return list.map(a => {
    const x = a || {};
    let id = /^[\w-]{1,40}$/.test(String(x.id || '')) ? String(x.id) : '';
    if (!id || ids.has(id)) id = U.uid('a');
    ids.add(id);
    const r = { id, name: clean(x.name, 80), street: clean(x.street, 100), zip: clean(x.zip, 10), city: clean(x.city, 60) };
    if (!r.name || !r.street || !r.zip || !r.city) throw new Error('Eine Adresse ist unvollständig. Name, Straße, PLZ und Ort werden gebraucht.');
    return r;
  });
}

// Eigene Daten ändern. Erlaubt: name, addresses, shopName, city, role 'customer' -> 'seller'
async function update(patch) {
  if (!S.me) throw new Error('Bitte melde dich zuerst an.');
  const p = patch && typeof patch === 'object' ? patch : {};
  const base = await fresh();
  const next = clone(base);
  if ('name' in p) {
    const n = clean(p.name, 60);
    if (n.length < 2) throw new Error('Gib einen Namen mit mindestens 2 Zeichen ein.');
    next.name = n;
  }
  if ('addresses' in p) next.addresses = cleanAddresses(p.addresses);
  if ('shopName' in p) {
    const s = clean(p.shopName, 60);
    if (s.length < 2) throw new Error('Gib deinem Shop einen Namen mit mindestens 2 Zeichen.');
    next.shopName = s;
  }
  if ('city' in p) next.city = clean(p.city, 60);
  if ('role' in p && p.role !== base.role) {
    if (!(p.role === 'seller' && base.role === 'customer')) throw new Error('Diese Rolle kannst du nicht selbst ändern. Wende dich an die Verwaltung des Shops.');
    if (!next.shopName) throw new Error('Gib deinem Shop einen Namen, dann kannst du verkaufen.');
    next.role = 'seller';
  }
  // Andere Felder (E-Mail, Passwort, Sperre) bleiben, wie sie sind
  S.me = await saveUser(next);
  F.emit('session', { user: current() });
  if (accountOpen()) { renderHeader(); if (S.tab === 'overview') renderPanel(false); }
  return current();
}

// Passwort eines Kontos neu setzen (Verwaltung). Nur für Admins.
async function setPassword(userId, newPassword) {
  if (!isAdmin()) throw new Error('Nur Admins können Passwörter neu setzen.');
  const prob = pwProblem(newPassword);
  if (prob) throw new Error(prob);
  const u = await F.db.users.get(userId);
  if (!u) throw new Error('Dieses Konto gibt es nicht mehr.');
  u.pw = await hashPassword(newPassword);
  const saved = await saveUser(u);
  if (S.me && saved.id === S.me.id) S.me = saved;
  clearLock();
  return pub(saved);
}

/* ---------- Anmelden / Registrieren ---------- */
function requireLogin(reason) {
  if (S.me) return Promise.resolve(current());
  return new Promise(resolve => {
    S.waiters.push(resolve);
    openAuth(null, reason);
  });
}
function openAuth(mode, reason) {
  const d = dlgA();
  const r = $('#auReason', d);
  const why = clean(reason, 200);
  r.innerHTML = why ? `${ic('info')}<span>${esc(why)}</span>` : '';
  r.hidden = !why;
  if (why) d.setAttribute('aria-describedby', 'auReason'); else d.removeAttribute('aria-describedby');
  $('#auFirst', d).hidden = S.users > 0;
  const safe = cryptoOk();
  $$('.au-pane', d).forEach(f => { if (!safe) formErr(f, NO_CRYPTO); $('button[type="submit"]', f).disabled = !safe; });
  if (!d.open) {
    setMode(mode || (S.users ? 'login' : 'register'), false);
    U.openDlg(d);
    if (fine()) focusFirst();
    tickLock();
  } else if (mode) setMode(mode, true);
}
function focusFirst() {
  const d = dlgA();
  if (S.mode === 'login') focusId($('#auLoginEmail', d).value ? 'auLoginPw' : 'auLoginEmail');
  else focusId('auRegName');
}
// Weicher Wechsel: Höhe gleitet, Formulare blenden seitlich über
function setMode(mode, animate) {
  const d = dlgA();
  const stage = $('#auStage', d);
  const anim = animate && d.open && S.mode !== mode && !U.reduced();
  const h0 = stage.offsetHeight;
  S.mode = mode;
  $('#auSwitch', d).dataset.mode = mode;
  $$('#auSwitch [role="tab"]', d).forEach(t => {
    const on = t.dataset.auMode === mode;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  });
  $$('.au-pane', d).forEach(p => {
    const on = p.dataset.pane === mode;
    p.classList.toggle('on', on);
    p.inert = !on;
    p.setAttribute('aria-hidden', String(!on));
  });
  $('#auTitle', d).textContent = mode === 'login' ? 'Willkommen zurück' : 'Willkommen bei Fundus';
  // Schon getippte E-Mail mitnehmen
  const from = $(mode === 'login' ? '#auRegEmail' : '#auLoginEmail', d);
  const to = $(mode === 'login' ? '#auLoginEmail' : '#auRegEmail', d);
  if (from.value && !to.value) to.value = from.value;
  if (!anim) return;
  const h1 = $(`.au-pane[data-pane="${mode}"]`, d).offsetHeight;
  clearTimeout(S.heightTimer);
  stage.classList.add('au-anim');
  stage.style.height = h0 + 'px';
  void stage.offsetHeight;
  stage.style.height = h1 + 'px';
  S.heightTimer = setTimeout(() => { stage.classList.remove('au-anim'); stage.style.height = ''; }, 380);
}
function resetAuth() {
  const d = dlgA();
  clearTimeout(S.lockTimer);
  $$('input', d).forEach(i => { i.value = ''; i.setAttribute('aria-invalid', 'false'); if (i.closest('.au-pw')) i.type = 'password'; });
  $$('.au-eye', d).forEach(b => { b.setAttribute('aria-pressed', 'false'); b.innerHTML = ic('eye'); });
  $$('.au-pane', d).forEach(f => { clearErrs(f); busy(f, false); f.classList.remove('au-shake'); });
  $$('.au-meter', d).forEach(m => { m.dataset.l = 0; $('.au-ml', m).textContent = ''; });
  $$('.au-rules li', d).forEach(li => { li.dataset.ok = 'false'; });
  const fb = $('#auForgotBtn', d);
  fb.setAttribute('aria-expanded', 'false');
  $('#auForgot', d).classList.remove('open');
  $('#auForgot', d).inert = true;
  S.wasLocked = false;
  S.busy = false;
}
// Kurzer Erfolgsmoment im Knopf, dann schließen
async function success(form, text) {
  const b = $('button[type="submit"]', form);
  b.classList.add('au-ok');
  b.innerHTML = `${ic('check')}${esc(text)}`;
  if (!U.reduced()) await wait(480);
  dlgA().close();
}

async function onLogin(f) {
  if (S.busy) return;
  clearErrs(f);
  if (!cryptoOk()) { formErr(f, NO_CRYPTO); fail(f); return; }
  if (lockLeft()) { tickLock(); fail(f); return; }
  const email = clean($('#auLoginEmail', f).value, 254).toLowerCase();
  const pw = $('#auLoginPw', f).value;
  let bad = false;
  if (!email) bad = fieldErr('auLoginEmail', 'Gib deine E-Mail-Adresse ein.');
  else if (!EMAIL_RE.test(email)) bad = fieldErr('auLoginEmail', 'Diese E-Mail-Adresse ist unvollständig. Beispiel: name@beispiel.de');
  if (!pw) bad = fieldErr('auLoginPw', 'Gib dein Passwort ein.');
  if (bad) { fail(f); return; }
  busy(f, true, 'Prüfe Passwort …');
  try {
    let user = await F.db.users.byEmail(email);
    if (!user) {
      fieldErr('auLoginEmail', 'Zu dieser E-Mail gibt es auf diesem Gerät kein Konto. Konten gelten nur auf dem Gerät, auf dem sie angelegt wurden.', { label: 'Konto erstellen', mode: 'register' });
      fail(f);
      return;
    }
    if (!(await checkPassword(pw, user.pw))) {
      const left = failAttempt();
      if (left) {
        fieldErr('auLoginPw', `Das Passwort stimmt nicht. Achte auf Groß- und Kleinschreibung. ${left === 1 ? 'Noch 1 Versuch, dann musst du 30 Sekunden warten.' : `Noch ${left} Versuche.`}`);
        $('#auLoginPw', f).select();
      }
      fail(f);
      return;
    }
    if (user.blocked) {
      formErr(f, 'Dieses Konto ist gesperrt. Wende dich an die Verwaltung dieses Shops.');
      fail(f);
      return;
    }
    // Dialog inzwischen geschlossen: Abbruch gilt, nicht doch noch anmelden
    if (!dlgA().open) return;
    // Ältere Hashes mit weniger Runden beim Anmelden erneuern
    if (Number(user.pw.iter) !== ITER) {
      try { user.pw = await hashPassword(pw); user = await saveUser(user); } catch (e) { /* alter Hash bleibt gültig */ }
    }
    await signIn(user);
    await success(f, 'Angemeldet');
    U.toast(`Hallo ${esc(firstName(user))}, schön, dass du wieder da bist.`, null, { type: 'ok' });
  } catch (err) {
    formErr(f, (err && err.message) || 'Die Anmeldung hat nicht geklappt. Versuch es noch einmal.');
    fail(f);
  } finally {
    busy(f, false);
    if (lockLeft()) tickLock();
  }
}

async function onRegister(f) {
  if (S.busy) return;
  clearErrs(f);
  if (!cryptoOk()) { formErr(f, NO_CRYPTO); fail(f); return; }
  const name = clean($('#auRegName', f).value, 60);
  const email = clean($('#auRegEmail', f).value, 254).toLowerCase();
  const pw = $('#auRegPw', f).value, pw2 = $('#auRegPw2', f).value;
  let bad = false;
  if (name.length < 2) bad = fieldErr('auRegName', name ? 'Der Name ist zu kurz. Gib mindestens 2 Zeichen ein.' : 'Gib deinen Namen ein. Er steht später auf deinen Bestellungen.');
  if (!email) bad = fieldErr('auRegEmail', 'Gib deine E-Mail-Adresse ein. Mit ihr meldest du dich an.');
  else if (!EMAIL_RE.test(email)) bad = fieldErr('auRegEmail', 'Diese E-Mail-Adresse ist unvollständig. Beispiel: name@beispiel.de');
  const prob = pwProblem(pw);
  if (prob) bad = fieldErr('auRegPw', prob);
  if (!pw2) bad = fieldErr('auRegPw2', 'Wiederhole dein Passwort.');
  else if (!prob && pw !== pw2) bad = fieldErr('auRegPw2', 'Die Passwörter sind nicht gleich. Tipp das Passwort noch einmal ein.');
  if (bad) { fail(f); return; }
  busy(f, true, 'Konto wird erstellt …');
  try {
    if (await F.db.users.byEmail(email)) {
      fieldErr('auRegEmail', 'Mit dieser E-Mail gibt es schon ein Konto.', { label: 'Jetzt anmelden', mode: 'login' });
      fail(f);
      return;
    }
    const first = !(await F.db.users.all()).length;
    const pwRec = await hashPassword(pw);
    if (!dlgA().open) return;
    const user = await saveUser({ email, name, role: first ? 'admin' : 'customer', pw: pwRec, addresses: [] });
    await countUsers();
    await signIn(user);
    await success(f, 'Konto erstellt');
    if (first) {
      const act = F.admin && typeof F.admin.open === 'function' ? { label: 'Verwaltung öffnen', run: () => F.admin.open('dashboard') } : null;
      U.toast(`Willkommen, ${esc(firstName(user))}. Du bist die erste Person hier und leitest jetzt den Shop. Über „Verwaltung“ oben fügst du Artikel hinzu.`, act, { type: 'ok', duration: 12000 });
    } else {
      U.toast(`Willkommen bei Fundus, ${esc(firstName(user))}. Dein Konto ist angelegt.`, null, { type: 'ok' });
    }
    confetti();
  } catch (err) {
    formErr(f, (err && err.message) || 'Das Konto konnte nicht angelegt werden. Versuch es noch einmal.');
    fail(f);
  } finally {
    busy(f, false);
  }
}
function confetti() {
  if (U.reduced() || !F.fx || typeof F.fx.confetti !== 'function') return;
  try { F.fx.confetti(); } catch (e) { /* nur Dekoration */ }
}

function buildAuth() {
  const d = document.createElement('dialog');
  d.id = 'dlgAuth';
  d.className = 'narrow au-auth';
  d.setAttribute('aria-labelledby', 'auTitle');
  d.innerHTML = `<div class="dlg">
    <button class="x" type="button" data-close aria-label="Schließen">${ic('close')}</button>
    <p class="eyebrow">Dein Fundus-Konto</p>
    <h2 class="au-title" id="auTitle">Willkommen zurück</h2>
    <p class="au-reason" id="auReason" hidden></p>
    <div class="au-switch" id="auSwitch" role="tablist" aria-label="Anmelden oder registrieren" data-mode="login">
      <button type="button" role="tab" id="auTabLogin" aria-controls="auLogin" aria-selected="true" data-au-mode="login">Anmelden</button>
      <button type="button" role="tab" id="auTabReg" aria-controls="auRegister" aria-selected="false" tabindex="-1" data-au-mode="register">Registrieren</button>
    </div>
    <div class="au-stage" id="auStage">
      <form class="au-pane on" id="auLogin" data-pane="login" role="tabpanel" aria-labelledby="auTabLogin" novalidate>
        ${field({ id: 'auLoginEmail', label: 'E-Mail-Adresse', type: 'email', ac: 'username', attrs: ' inputmode="email" autocapitalize="off" spellcheck="false" required' })}
        ${field({ id: 'auLoginPw', label: 'Passwort', ac: 'current-password', pw: true, attrs: ' required' })}
        <div class="au-forgot">
          <button class="linkbtn au-lb" type="button" id="auForgotBtn" aria-expanded="false" aria-controls="auForgot">Passwort vergessen?</button>
          <div class="au-fold" id="auForgot" inert><div><p>Fundus hat keinen Mail-Server und kann dir keinen Link schicken. Bitte eine Person mit Admin-Rechten in diesem Shop, dein Passwort unter <b>Verwaltung</b> bei den Kunden neu zu setzen. Danach meldest du dich mit dem neuen Passwort an.</p></div></div>
        </div>
        <div class="au-alert" role="alert" hidden></div>
        <button class="btn dark wide au-submit" type="submit" id="auLoginBtn" data-au-label="Anmelden">Anmelden</button>
        <div class="au-new">
          <b>Neu bei Fundus?</b>
          <p>Mit einem Konto siehst du deine Bestellungen, speicherst Adressen und kannst selbst verkaufen.</p>
          <button class="btn ghost" type="button" data-au-mode="register">Konto erstellen</button>
        </div>
      </form>
      <form class="au-pane" id="auRegister" data-pane="register" role="tabpanel" aria-labelledby="auTabReg" novalidate inert aria-hidden="true">
        <p class="au-first" id="auFirst" hidden>${ic('star')}<span>Du bist die erste Person auf diesem Gerät. Mit deinem Konto leitest du den Shop und kannst Artikel hinzufügen.</span></p>
        ${field({ id: 'auRegName', label: 'Vor- und Nachname', ac: 'name', attrs: ' autocapitalize="words" maxlength="60" required' })}
        ${field({ id: 'auRegEmail', label: 'E-Mail-Adresse', type: 'email', ac: 'email', hint: 'Damit meldest du dich später an.', attrs: ' inputmode="email" autocapitalize="off" spellcheck="false" required' })}
        ${field({ id: 'auRegPw', label: 'Passwort', ac: 'new-password', pw: true, meter: true, attrs: ' maxlength="200" required' })}
        ${field({ id: 'auRegPw2', label: 'Passwort wiederholen', ac: 'new-password', pw: true, attrs: ' maxlength="200" required' })}
        <div class="au-alert" role="alert" hidden></div>
        <button class="btn dark wide au-submit" type="submit" id="auRegBtn" data-au-label="Konto erstellen">Konto erstellen</button>
        <p class="au-alt">Schon ein Konto? <button class="linkbtn au-lb" type="button" data-au-mode="login">Anmelden</button></p>
      </form>
    </div>
    <p class="demo-note au-note">${ic('lock')}<span>Konten liegen nur auf diesem Gerät. Dein Passwort wird nicht im Klartext gespeichert.</span></p>
  </div>`;
  d.addEventListener('submit', e => {
    e.preventDefault();
    if (e.target.id === 'auLogin') onLogin(e.target);
    else if (e.target.id === 'auRegister') onRegister(e.target);
  });
  d.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t || t.disabled) return;
    const ds = t.dataset;
    if (ds.auMode) {
      const tab = t.getAttribute('role') === 'tab';
      setMode(ds.auMode, true);
      // Der geklickte Knopf ist jetzt evtl. ausgeblendet: Fokus sinnvoll setzen
      if (!tab) { if (fine()) focusFirst(); else $(`#auSwitch [data-au-mode="${S.mode}"]`, d).focus(); }
      return;
    }
    if (ds.auEye) { toggleEye(t); return; }
    if (t.id === 'auForgotBtn') {
      const open = t.getAttribute('aria-expanded') !== 'true';
      t.setAttribute('aria-expanded', String(open));
      $('#auForgot', d).classList.toggle('open', open);
      $('#auForgot', d).inert = !open;
    }
  });
  d.addEventListener('input', onInput);
  d.addEventListener('keydown', e => tabKeys(e, '#auSwitch', t => { setMode(t.dataset.auMode, true); }));
  d.addEventListener('animationend', e => { if (e.animationName === 'au-shake') e.target.classList.remove('au-shake'); });
  d.addEventListener('close', () => {
    const user = current();
    S.waiters.splice(0).forEach(r => r(user));
    resetAuth();
  });
  return d;
}
function onInput(e) {
  const t = e.target;
  if (!t.id || t.tagName !== 'INPUT') return;
  if (t.getAttribute('aria-invalid') === 'true') fieldErr(t.id, '');
  if (t.type === 'password' || t.closest('.au-pw')) meter(t);
}
// Pfeiltasten in Tab-Leisten (Rollen-Fokus wie bei der App-Installation)
function tabKeys(e, sel, pick) {
  const list = e.target.closest(sel);
  if (!list || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
  const tabs = $$('[role="tab"]', list);
  const i = tabs.indexOf(e.target.closest('[role="tab"]'));
  if (i < 0) return;
  e.preventDefault();
  const n = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
  pick(tabs[n]);
  tabs[n].focus();
}

/* ---------- Konto ---------- */
function openAccount(tab) {
  const t = TABS[tab] ? tab : null;
  if (!S.me) {
    requireLogin().then(u => { if (u && t) openAccount(t); });
    return;
  }
  S.tab = t || 'overview';
  S.addrEdit = null; S.addrDel = null; S.delStep = false;
  renderHeader();
  renderTabs();
  const d = dlgK();
  renderPanel(true).then(() => {
    if (!d.open) return;
    const sel = $(`#auTab-${S.tab}`, d);
    if (sel && !d.contains(document.activeElement)) sel.focus();
  });
  U.openDlg(d);
  const sel = $(`#auTab-${S.tab}`, d);
  if (sel) sel.focus();
}
async function setTab(tab, opts) {
  if (!TABS[tab] || !S.me) return;
  const o = opts || {};
  S.tab = tab;
  S.addrEdit = null; S.addrDel = null; S.delStep = false;
  if (o.open) S.open.add(o.open);
  renderTabs();
  $('#auBody').scrollTop = 0;
  await renderPanel(true);
  if (o.focus) {
    const el = document.getElementById(o.focus);
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'center', behavior: U.reduced() ? 'auto' : 'smooth' }); }
  } else if (o.open) {
    const el = document.getElementById('auO-' + domId(o.open));
    if (el) el.scrollIntoView({ block: 'start', behavior: U.reduced() ? 'auto' : 'smooth' });
  }
}
function renderHeader() {
  const me = S.me;
  if (!me) return;
  const role = ROLES[me.role] ? me.role : 'customer';
  $('#auWho').innerHTML = `<span class="au-avatar" aria-hidden="true">${esc(initials(me.name || me.email))}</span>
    <div class="au-whotxt">
      <h2 id="auAccName">${esc(me.name || 'Dein Konto')}</h2>
      <p><span class="au-mail">${esc(me.email)}</span><span class="au-role ${role}">${ROLES[role]}</span>${role === 'seller' && me.shopName ? `<span class="au-shop">${ic('store')}${esc(me.shopName)}</span>` : ''}</p>
    </div>`;
}
function renderTabs() {
  $$('#dlgAccount .au-tabs [role="tab"]').forEach(t => {
    const on = t.dataset.auTab === S.tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  });
}
async function loadOrders() {
  const list = await F.db.orders.byUser(S.me.id);
  S.orders = (Array.isArray(list) ? list : []).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
async function countUsers() {
  try { S.users = (await F.db.users.all()).length; } catch (e) { /* Zahl bleibt */ }
}
async function countOtherAdmins() {
  const all = await F.db.users.all();
  return all.filter(u => u.role === 'admin' && !u.blocked && u.id !== S.me.id).length;
}
async function renderPanel(enter) {
  const d = dlgK();
  if (!d || !S.me) return;
  const panel = $('#auPanel', d);
  const tok = ++S.tok;
  try {
    if (S.tab === 'overview' || S.tab === 'orders') await loadOrders();
    if (S.tab === 'settings') S.otherAdmins = await countOtherAdmins();
  } catch (e) { console.error(e); }
  if (tok !== S.tok || !S.me) return;
  // Fokus nach dem Neuzeichnen wiederherstellen
  const act = document.activeElement;
  const keep = act && panel.contains(act) && act.id ? act.id : '';
  panel.classList.remove('au-in', 'au-enter');
  panel.innerHTML = VIEWS[S.tab]();
  panel.setAttribute('aria-labelledby', 'auTab-' + S.tab);
  if (enter && !U.reduced()) {
    void panel.offsetWidth;
    panel.classList.add('au-in', 'au-enter');
    $$('[data-au-count]', panel).forEach(countUp);
  }
  if (keep) focusId(keep);
}
// Zahlen hochzählen (eigene kleine Animation, damit das Format sicher stimmt)
function countUp(el) {
  const to = Number(el.dataset.auCount) || 0;
  const fmt = 'auEur' in el.dataset ? v => U.eur.format(v) : v => U.int.format(Math.round(v));
  if (!to) return;
  const t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / 700);
    el.textContent = fmt(k < 1 ? to * (1 - Math.pow(1 - k, 3)) : to);
    if (k < 1 && el.isConnected) requestAnimationFrame(step);
  };
  el.textContent = fmt(0);
  requestAnimationFrame(step);
}
const empty = (icon, title, text, action) => `<div class="au-empty au-rise">${ic(icon)}<b>${title}</b><p>${text}</p>${action || ''}</div>`;

/* Übersicht */
function viewOverview() {
  const me = S.me, os = S.orders;
  const spent = os.filter(o => !['cancelled', 'refunded', 'pending_payment'].includes(o.status)).reduce((a, o) => a + (Number(o.total) || 0), 0);
  const favList = U.store.get('fundus.favs', []);
  const favs = Array.isArray(favList) ? favList.length : 0;
  const due = os.find(o => o.status === 'pending_payment');
  const last = os[0];
  const addrs = (me.addresses || []).length;
  let roleCard = '';
  if (me.role === 'admin') {
    roleCard = `<div class="au-card hl" style="--i:3">${ic('dashboard')}<h3>Verwaltung</h3><p>Du leitest diesen Shop. Hier fügst du Artikel hinzu, bearbeitest Bestellungen und verwaltest Kunden.</p><button class="btn" type="button" id="auGoAdmin" data-au-admin="dashboard">Verwaltung öffnen</button></div>`;
  } else if (me.role === 'seller') {
    roleCard = `<div class="au-card hl" style="--i:3">${ic('store')}<h3>${esc(me.shopName || 'Mein Shop')}</h3><p>Stell neue Artikel ein und sieh, was sich verkauft.</p><div class="row"><button class="btn" type="button" id="auGoAdmin" data-au-admin="dashboard">Mein Shop öffnen</button><button class="btn line" type="button" data-au-admin="new-product">Artikel einstellen</button></div></div>`;
  } else {
    roleCard = `<div class="au-card" style="--i:3">${ic('store')}<h3>Selbst verkaufen</h3><p>Du machst Dinge von Hand? Eröffne deinen eigenen Shop auf Fundus.</p><button class="btn ghost" type="button" id="auGoSell" data-au-tab="settings" data-au-focus="auSellShop">Verkäufer werden</button></div>`;
  }
  return `
    ${due ? `<div class="au-alert warn au-due">${ic('info')}<span><b>Zahlung offen</b> für Bestellung ${esc(due.id)}. Überweise ${money(due.total)}, dann geht sie in den Versand.</span><button class="btn au-btn" type="button" id="auGoDue" data-au-tab="orders" data-au-open="${esc(due.id)}">Zahlungsdaten</button></div>` : ''}
    <div class="au-stats">
      <button class="au-stat" type="button" id="auStatOrders" data-au-tab="orders" style="--i:0"><b data-au-count="${os.length}">${num(os.length)}</b><span>${os.length === 1 ? 'Bestellung' : 'Bestellungen'}</span></button>
      <div class="au-stat" style="--i:1"><b data-au-count="${spent}" data-au-eur>${money(spent)}</b><span>Ausgegeben</span></div>
      <button class="au-stat" type="button" id="auStatFavs" data-au-favs style="--i:2"><b data-au-count="${favs}">${num(favs)}</b><span>Auf dem Merkzettel</span></button>
    </div>
    ${last ? `<section class="au-last au-rise" style="--i:2" aria-labelledby="auLastH">
      <div class="au-sechead"><h3 class="au-h" id="auLastH">Letzte Bestellung</h3><button class="linkbtn au-lb" type="button" id="auAllOrders" data-au-tab="orders">Alle ansehen</button></div>
      <button class="au-lastrow" type="button" id="auLastRow" data-au-tab="orders" data-au-open="${esc(last.id)}">
        <span class="au-othumbs">${(last.items || []).slice(0, 3).map(it => thumb(it, false)).join('')}</span>
        <span class="au-lastinfo"><b>${esc(last.id)}</b><small>${when(last.createdAt)}</small></span>
        ${F.shop.statusPill(last.status)}
        <b class="au-ototal">${money(last.total)}</b>
      </button>
    </section>` : ''}
    <div class="au-cards">
      ${roleCard}
      <div class="au-card" style="--i:4">${ic('truck')}<h3>Lieferadressen</h3><p>${addrs ? `${plural(addrs, 'Adresse', 'Adressen')} gespeichert. Die Kasse füllt sie automatisch aus.` : 'Noch keine gespeichert. Mit einer Adresse geht die Kasse schneller.'}</p><button class="btn ghost" type="button" id="auGoAddr" data-au-tab="addresses">Adressen verwalten</button></div>
      <div class="au-card" style="--i:5">${ic('lock')}<h3>Sicherheit</h3><p>Ändere dein Passwort oder melde dich auf diesem Gerät ab.</p><button class="btn ghost" type="button" id="auGoPw" data-au-tab="settings" data-au-focus="auPwOld">Passwort ändern</button></div>
    </div>
    <p class="hint au-since">${me.createdAt ? `Mitglied seit ${esc(when(me.createdAt, monthFmt))}. ` : ''}Dein Konto ist auf diesem Gerät gespeichert.</p>`;
}

/* Bestellungen */
function thumb(it, link) {
  const p = link ? F.shop.byId(it.productId) : null;
  const st = `style="--tint:${esc(hex(it.tint, '#E7ECE6'))}"`;
  if (p) return `<button class="au-th" type="button" data-open="${esc(p.id)}" ${st} aria-label="${esc(it.name)} ansehen">${artOf(it)}</button>`;
  return `<span class="au-th" ${st}${link ? ` role="img" aria-label="${esc(it.name)}"` : ' aria-hidden="true"'}>${artOf(it)}</span>`;
}
function viewOrders() {
  if (!S.orders.length) {
    return empty('box', 'Noch keine Bestellungen', 'Hier erscheinen deine Bestellungen, sobald du etwas kaufst. Du siehst dann den Status und kannst Artikel mit einem Tipp nochmal bestellen.',
      '<button class="btn" type="button" id="auToShop" data-au-shop>Zum Shop</button>');
  }
  return `<p class="hint au-count">${plural(S.orders.length, 'Bestellung', 'Bestellungen')}, die neueste zuerst</p>
    <div class="au-orders">${S.orders.map(orderHTML).join('')}</div>`;
}
function orderHTML(o, i) {
  const id = domId(o.id);
  const open = S.open.has(o.id);
  const items = Array.isArray(o.items) ? o.items : [];
  const count = items.reduce((a, x) => a + (Number(x.qty) || 0), 0);
  const thumbs = items.slice(0, 4).map(it => thumb(it, true)).join('') + (items.length > 4 ? `<span class="au-th more" aria-label="und ${items.length - 4} weitere">+${items.length - 4}</span>` : '');
  return `<article class="au-order${open ? ' open' : ''}" id="auO-${id}" style="--i:${Math.min(i, 8)}" aria-labelledby="auOn-${id}">
    <div class="au-ohead">
      <div class="au-ometa"><h3 class="au-onum" id="auOn-${id}">Bestellung ${esc(o.id)}</h3><p class="hint">${when(o.createdAt)} · ${plural(count, 'Artikel', 'Artikel')}</p></div>
      <div class="au-ostate">${F.shop.statusPill(o.status)}<b class="au-ototal">${money(o.total)}</b></div>
    </div>
    <div class="au-othumbs">${thumbs}</div>
    ${o.status === 'pending_payment' ? bankHTML(o) : ''}
    <div class="au-oacts">
      <button class="btn ghost au-btn au-more" type="button" id="auOt-${id}" aria-expanded="${open}" aria-controls="auOd-${id}" data-au-toggle="${esc(o.id)}">Details</button>
      <button class="btn au-btn" type="button" id="auOr-${id}" data-au-rebuy="${esc(o.id)}">${ic('refresh')}Nochmal kaufen</button>
    </div>
    <div class="au-fold au-odetail${open ? ' open' : ''}" id="auOd-${id}"${open ? '' : ' inert'}><div>${detailHTML(o)}</div></div>
  </article>`;
}
function bankHTML(o) {
  return `<div class="au-bank">
    <p><b>Bitte überweise ${money(o.total)}</b><span class="hint">Sobald das Geld da ist, ändert sich der Status auf „Bezahlt“. Testmodus: Es wird kein echtes Geld bewegt.</span></p>
    <dl>
      <div><dt>Empfänger</dt><dd><span>${esc(BANK.name)}</span></dd></div>
      <div><dt>IBAN</dt><dd><span class="au-sel">${esc(BANK.iban)}</span><button class="au-copy" type="button" data-au-copy="${esc(BANK.iban.replace(/\s/g, ''))}" aria-label="IBAN kopieren">${ic('copy')}</button></dd></div>
      <div><dt>Verwendungszweck</dt><dd><span class="au-sel">${esc(o.id)}</span><button class="au-copy" type="button" data-au-copy="${esc(o.id)}" aria-label="Verwendungszweck kopieren">${ic('copy')}</button></dd></div>
      <div><dt>Betrag</dt><dd><span>${money(o.total)}</span></dd></div>
    </dl>
  </div>`;
}
function timeline(o) {
  const hist = (Array.isArray(o.history) ? o.history : []).filter(h => h && h.status)
    .slice().sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
  const steps = (hist.length ? hist : [{ status: o.status, at: o.createdAt }]).map(h => ({ status: h.status, at: h.at, note: h.note, done: true }));
  // Noch ausstehende Schritte blass dazu, solange die Bestellung normal läuft
  if (!['cancelled', 'refunded'].includes(o.status)) {
    FLOW.slice(FLOW.indexOf(o.status) + 1).forEach(s => { if (!steps.some(x => x.status === s)) steps.push({ status: s, done: false }); });
  }
  const now = steps.filter(s => s.done).length - 1;
  const label = s => (F.shop.STATUS[s] || { label: s }).label;
  return `<ol class="au-tl">${steps.map((s, i) => `<li class="${s.done ? 'done' : 'todo'}${i === now ? ' now' : ''}"><div><b>${esc(label(s.status))}</b>${s.at ? `<small>${when(s.at, U.dateTimeFmt)}</small>` : '<small>ausstehend</small>'}${s.note ? `<small>${esc(s.note)}</small>` : ''}</div></li>`).join('')}</ol>`;
}
function detailHTML(o) {
  const a = o.address || {};
  const p = o.payment || {};
  const method = F.shop.PAYMENT[p.method] || 'Unbekannt';
  const card = p.method === 'card' && (p.brand || p.last4) ? ` · ${esc(p.brand || 'Karte')}${/^\d{4}$/.test(String(p.last4 || '')) ? ` •••• ${esc(p.last4)}` : ''}` : '';
  const items = Array.isArray(o.items) ? o.items : [];
  const eta = o.eta && ['paid', 'processing', 'shipped'].includes(o.status) ? (when(o.eta, U.dayFmt) || esc(o.eta)) : '';
  return `<div class="au-odgrid">
    <section class="au-blk"><h4>Verlauf</h4>${timeline(o)}</section>
    <div class="au-blkcol">
      <section class="au-blk"><h4>Lieferadresse</h4><address>${esc(a.name)}<br>${esc(a.street)}<br>${esc(a.zip)} ${esc(a.city)}</address>${eta ? `<p class="au-eta">${ic('truck')}Voraussichtlich da: <b>${eta}</b></p>` : ''}</section>
      <section class="au-blk"><h4>Zahlung</h4><p>${ic(p.method === 'sepa' || p.method === 'invoice' ? 'bank' : 'card')}<span>${esc(method)}${card}${PAY_STATE[p.status] ? ` · ${PAY_STATE[p.status]}` : ''}</span></p>${p.txn ? `<p class="hint">Vorgang ${esc(p.txn)}</p>` : ''}</section>
    </div>
    <section class="au-blk au-wide"><h4>Artikel</h4>
      <ul class="au-items">${items.map(it => {
        const pr = F.shop.byId(it.productId);
        const nm = pr ? `<button class="linkbtn" type="button" data-open="${esc(pr.id)}">${esc(it.name)}</button>` : esc(it.name);
        return `<li><span>${num(it.qty)} × ${nm}</span><span>${money((Number(it.price) || 0) * (Number(it.qty) || 0))}</span></li>`;
      }).join('')}</ul>
      <dl class="sum">
        <div><dt>Zwischensumme</dt><dd>${money(o.subtotal)}</dd></div>
        ${Number(o.discount) > 0 ? `<div><dt>Rabatt${o.coupon ? ` (${esc(typeof o.coupon === 'string' ? o.coupon : o.coupon.code || '')})` : ''}</dt><dd>−${money(o.discount)}</dd></div>` : ''}
        <div><dt>Versand${o.shipMethod === 'exp' ? ' (Express)' : ''}</dt><dd>${Number(o.shipping) ? money(o.shipping) : 'kostenlos'}</dd></div>
        <div class="tot"><dt>Gesamt</dt><dd>${money(o.total)}</dd></div>
      </dl>
    </section>
  </div>`;
}
function toggleOrder(b, id) {
  const art = b.closest('.au-order');
  const open = !art.classList.contains('open');
  art.classList.toggle('open', open);
  b.setAttribute('aria-expanded', String(open));
  const det = $('.au-odetail', art);
  det.classList.toggle('open', open);
  det.inert = !open;
  if (open) S.open.add(id); else S.open.delete(id);
}
// Noch verfügbare Artikel einer Bestellung wieder in den Warenkorb
function rebuy(id, btn) {
  const o = S.orders.find(x => x.id === id);
  if (!o) return;
  const inCart = {};
  F.shop.cart.lines().forEach(l => { inCart[l.p.id] = l.q; });
  const src = btn.closest('.au-order') ? $('.au-th', btn.closest('.au-order')) : btn;
  let added = 0, gone = 0;
  (o.items || []).forEach(it => {
    const p = F.shop.byId(it.productId);
    const free = p && p.active !== false ? F.shop.stockOf(p) - (inCart[p.id] || 0) : 0;
    const n = Math.min(Math.max(1, Math.floor(Number(it.qty)) || 1), free);
    if (n > 0 && F.shop.cart.add(p.id, n, src)) { added += n; inCart[p.id] = (inCart[p.id] || 0) + n; } else gone++;
  });
  const toCart = { label: 'Zum Warenkorb', run: () => { dlgK().close(); F.shop.openCart(); } };
  if (!added) { U.toast('Diese Artikel sind gerade nicht verfügbar oder liegen schon alle im Warenkorb.'); return; }
  const msg = `${plural(added, 'Artikel', 'Artikel')} ${added === 1 ? 'liegt' : 'liegen'} im Warenkorb.` + (gone ? ` ${gone} ${gone === 1 ? 'Artikel ist' : 'Artikel sind'} gerade nicht verfügbar.` : '');
  U.toast(msg, toCart, { type: 'ok' });
}
async function copyText(text, b) {
  const label = (b.getAttribute('aria-label') || 'Text').replace(/ kopieren$/, '');
  try {
    if (!navigator.clipboard || !window.isSecureContext) throw new Error('kein Zugriff');
    await navigator.clipboard.writeText(text);
    b.innerHTML = ic('check');
    setTimeout(() => { if (b.isConnected) b.innerHTML = ic('copy'); }, 1600);
    U.toast(`${esc(label)} kopiert.`, null, { type: 'ok', duration: 2500 });
  } catch (e) {
    // Ohne Zwischenablage (z. B. in der App): Text markieren
    const span = b.previousElementSibling;
    if (span) { const r = document.createRange(); r.selectNodeContents(span); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    U.toast('Kopieren klappt hier nicht. Der Text ist markiert, halte ihn gedrückt und wähle „Kopieren“.');
  }
}

/* Adressen */
function viewAddresses() {
  const list = S.me.addresses || [];
  if (!list.length && !S.addrEdit) {
    return empty('truck', 'Noch keine Adresse gespeichert', 'Speichere eine Lieferadresse. Die Kasse füllt sie dann automatisch aus.',
      '<button class="btn" type="button" id="auAddrNew" data-au-addr="new">Adresse hinzufügen</button>');
  }
  const editing = S.addrEdit && S.addrEdit !== 'new' ? list.find(a => a.id === S.addrEdit) : null;
  return `<div class="au-sechead">
      <p class="hint">${list.length} von ${MAX_ADDR} gespeichert. Die erste ist deine Standardadresse für die Kasse.</p>
      ${!S.addrEdit && list.length < MAX_ADDR ? `<button class="btn au-btn" type="button" id="auAddrNew" data-au-addr="new">${ic('plus')}Neue Adresse</button>` : ''}
    </div>
    ${S.addrEdit === 'new' ? addrForm({ name: S.me.name }) : ''}
    <div class="au-addrs">${list.map((a, i) => (editing && editing.id === a.id ? addrForm(a) : addrCard(a, i))).join('')}</div>`;
}
function addrCard(a, i) {
  const id = esc(a.id);
  const ask = S.addrDel === a.id;
  return `<article class="au-addr${i === 0 ? ' first' : ''}" style="--i:${Math.min(i, 8)}">
    ${i === 0 ? '<span class="au-std">Standard</span>' : ''}
    <address><b>${esc(a.name)}</b><br>${esc(a.street)}<br>${esc(a.zip)} ${esc(a.city)}</address>
    ${ask ? `<div class="au-confirm" role="group" aria-labelledby="auDelQ-${domId(a.id)}">
        <p id="auDelQ-${domId(a.id)}"><b>Diese Adresse entfernen?</b></p>
        <div class="row"><button class="btn danger au-btn" type="button" id="auAddrRm" data-au-addr-rm="${id}">Entfernen</button><button class="btn ghost au-btn" type="button" id="auAddrKeep" data-au-addr-keep>Behalten</button></div>
      </div>`
    : `<div class="au-acts">
        <button class="linkbtn au-lb" type="button" id="auAe-${domId(a.id)}" data-au-addr="${id}">Bearbeiten</button>
        ${i ? `<button class="linkbtn au-lb" type="button" data-au-std="${id}">Als Standard</button>` : ''}
        <button class="linkbtn au-lb au-del" type="button" data-au-addr-del="${id}">Entfernen</button>
      </div>`}
  </article>`;
}
function addrForm(a) {
  return `<form class="au-form" id="auAddrForm" data-id="${esc(a.id || '')}" novalidate aria-labelledby="auAddrH">
    <h3 class="au-h" id="auAddrH">${a.id ? 'Adresse bearbeiten' : 'Neue Adresse'}</h3>
    ${field({ id: 'auAddrName', label: 'Vor- und Nachname', ac: 'shipping name', value: a.name, attrs: ' maxlength="80" required' })}
    ${field({ id: 'auAddrStreet', label: 'Straße und Hausnummer', ac: 'shipping address-line1', value: a.street, attrs: ' maxlength="100" required' })}
    <div class="two">
      ${field({ id: 'auAddrZip', label: 'PLZ', ac: 'shipping postal-code', value: a.zip, attrs: ' inputmode="numeric" maxlength="5" required' })}
      ${field({ id: 'auAddrCity', label: 'Ort', ac: 'shipping address-level2', value: a.city, attrs: ' maxlength="60" required' })}
    </div>
    <div class="au-alert" role="alert" hidden></div>
    <div class="row"><button class="btn dark" type="submit" data-au-label="Adresse speichern">Adresse speichern</button><button class="btn ghost" type="button" data-au-addr-cancel>Abbrechen</button></div>
  </form>`;
}
async function saveAddr(f) {
  if (S.busy) return;
  clearErrs(f);
  const v = id => clean($('#' + id, f).value, 100);
  const a = { name: v('auAddrName'), street: v('auAddrStreet'), zip: v('auAddrZip').replace(/\s/g, ''), city: v('auAddrCity') };
  let bad = false;
  if (a.name.length < 2) bad = fieldErr('auAddrName', 'Gib den Namen der Person ein, die das Paket annimmt.');
  if (!a.street) bad = fieldErr('auAddrStreet', 'Gib Straße und Hausnummer ein.');
  else if (!/\d/.test(a.street)) bad = fieldErr('auAddrStreet', 'Die Hausnummer fehlt. Beispiel: Lindenstraße 12');
  if (!/^\d{5}$/.test(a.zip)) bad = fieldErr('auAddrZip', 'Die PLZ hat 5 Ziffern. Beispiel: 04109');
  if (a.city.length < 2) bad = fieldErr('auAddrCity', 'Gib den Ort ein.');
  if (bad) { fail(f); return; }
  const list = clone(S.me.addresses || []);
  const editId = f.dataset.id;
  const i = editId ? list.findIndex(x => x.id === editId) : -1;
  if (i >= 0) list[i] = Object.assign({ id: editId }, a);
  else if (list.length >= MAX_ADDR) { formErr(f, `Du hast schon ${MAX_ADDR} Adressen gespeichert. Entferne zuerst eine.`); fail(f); return; }
  else list.push(Object.assign({ id: U.uid('a') }, a));
  busy(f, true, 'Speichern …');
  try {
    await update({ addresses: list });
    S.addrEdit = null;
    busy(f, false);
    await renderPanel(false);
    focusId('auAddrNew');
    U.toast('Adresse gespeichert.', null, { type: 'ok' });
  } catch (err) {
    busy(f, false);
    formErr(f, err.message);
    fail(f);
  }
}
async function changeAddrs(fn, msg) {
  if (S.busy) return;
  S.busy = true;
  try {
    await update({ addresses: fn(clone(S.me.addresses || [])) });
    S.addrDel = null;
    await renderPanel(false);
    focusId('auAddrNew');
    U.toast(msg, null, { type: 'ok' });
  } catch (err) {
    U.toast(esc(err.message), null, { type: 'err' });
  } finally { S.busy = false; }
}

/* Einstellungen */
function viewSettings() {
  const me = S.me;
  return `
    <section class="au-sec" aria-labelledby="auSecName">
      <h3 id="auSecName">Persönliche Daten</h3>
      <form id="auNameForm" novalidate>
        ${field({ id: 'auSetName', label: 'Name', ac: 'name', value: me.name, attrs: ' maxlength="60" required' })}
        <div class="field"><span class="lbl">E-Mail-Adresse</span><p class="au-ro">${esc(me.email)}</p><p class="hint">Mit ihr meldest du dich an. Sie lässt sich nicht ändern.</p></div>
        <div class="au-alert" role="alert" hidden></div>
        <button class="btn dark" type="submit" data-au-label="Name speichern">Name speichern</button>
      </form>
    </section>
    <section class="au-sec" aria-labelledby="auSecPw">
      <h3 id="auSecPw">Passwort ändern</h3>
      <form id="auPwForm" novalidate>
        <input class="sr" id="auPwUser" type="email" autocomplete="username" value="${esc(me.email)}" aria-label="E-Mail-Adresse" tabindex="-1" aria-hidden="true" readonly>
        ${field({ id: 'auPwOld', label: 'Aktuelles Passwort', ac: 'current-password', pw: true, attrs: ' required' })}
        ${field({ id: 'auPwNew', label: 'Neues Passwort', ac: 'new-password', pw: true, meter: true, attrs: ' maxlength="200" required' })}
        ${field({ id: 'auPwNew2', label: 'Neues Passwort wiederholen', ac: 'new-password', pw: true, attrs: ' maxlength="200" required' })}
        <div class="au-alert" role="alert" hidden></div>
        <button class="btn dark" type="submit" data-au-label="Passwort ändern">Passwort ändern</button>
      </form>
    </section>
    <section class="au-sec" id="auSellBox" aria-labelledby="auSecSell">${sellHTML()}</section>
    <section class="au-sec" aria-labelledby="auSecOut">
      <h3 id="auSecOut">Abmelden</h3>
      <p>Du meldest dich auf diesem Gerät ab. Warenkorb und Merkzettel bleiben erhalten.</p>
      <button class="btn ghost" type="button" id="auLogout" data-au-logout>${ic('logout')}Abmelden</button>
    </section>
    <section class="au-sec au-danger" id="auDelBox" aria-labelledby="auSecDel">${delHTML()}</section>`;
}
function sellHTML() {
  const me = S.me;
  const st = F.shop.settings() || {};
  if (me.role === 'admin') {
    return `<h3 id="auSecSell">Verwaltung</h3><p>Als Admin verwaltest du den ganzen Shop: Artikel, Bestellungen, Kunden und Einstellungen.</p>
      <button class="btn ghost" type="button" data-au-admin="dashboard">${ic('dashboard')}Verwaltung öffnen</button>`;
  }
  const seller = me.role === 'seller';
  return `<h3 id="auSecSell">${seller ? 'Dein Shop' : 'Verkäufer werden'}</h3>
    <p>${seller ? 'So steht dein Shop bei deinen Artikeln.' : `Eröffne deinen eigenen Shop auf Fundus und stell danach Artikel ein. Keine Grundgebühr${Number(st.commission) ? `, ${pctFmt.format(st.commission)} % Provision nur bei Verkauf` : ''}.`}</p>
    <form id="auSellForm" novalidate>
      ${field({ id: 'auSellShop', label: 'Name deines Shops', ac: 'organization', value: me.shopName, hint: 'Zum Beispiel „Töpferei Lindner“.', attrs: ' maxlength="60" required' })}
      ${field({ id: 'auSellCity', label: 'Stadt, aus der du versendest', ac: 'address-level2', value: me.city, attrs: ' maxlength="60" required' })}
      <div class="au-alert" role="alert" hidden></div>
      <div class="row">
        <button class="btn dark" type="submit" data-au-label="${seller ? 'Shop-Daten speichern' : 'Verkäufer werden'}">${seller ? 'Shop-Daten speichern' : 'Verkäufer werden'}</button>
        ${seller ? '<button class="btn ghost" type="button" data-au-admin="dashboard">Mein Shop öffnen</button>' : ''}
      </div>
    </form>`;
}
function delHTML() {
  const me = S.me;
  const head = '<h3 id="auSecDel">Konto löschen</h3>';
  if (me.role === 'admin' && !S.otherAdmins) {
    return `${head}<p>Du bist der einzige Admin dieses Shops. Ernenne in der Verwaltung zuerst eine andere Person zum Admin. Danach kannst du dein Konto löschen.</p>
      <button class="btn ghost" type="button" disabled>Konto löschen</button>`;
  }
  if (!S.delStep) {
    return `${head}<p>Damit löschst du dein Konto und deine gespeicherten Adressen von diesem Gerät. Deine Bestellungen bleiben für Versand und Rückfragen erhalten.</p>
      <button class="btn ghost au-delbtn" type="button" id="auDelStart" data-au-del>${ic('trash')}Konto löschen</button>`;
  }
  return `${head}
    <form class="au-confirm" id="auDelForm" novalidate>
      <p><b>Bist du sicher?</b> Das lässt sich nicht rückgängig machen. Gib zur Bestätigung dein Passwort ein.</p>
      ${field({ id: 'auDelPw', label: 'Passwort', ac: 'current-password', pw: true, attrs: ' required' })}
      <div class="au-alert" role="alert" hidden></div>
      <div class="row"><button class="btn danger" type="submit" data-au-label="Endgültig löschen">Endgültig löschen</button><button class="btn ghost" type="button" id="auDelCancel" data-au-del-cancel>Abbrechen</button></div>
    </form>`;
}
async function saveName(f) {
  if (S.busy) return;
  clearErrs(f);
  const name = clean($('#auSetName', f).value, 60);
  if (name.length < 2) { fieldErr('auSetName', name ? 'Der Name ist zu kurz. Gib mindestens 2 Zeichen ein.' : 'Gib deinen Namen ein.'); fail(f); return; }
  if (name === S.me.name) { formErr(f, 'Der Name ist schon so gespeichert.', 'ok'); return; }
  busy(f, true, 'Speichern …');
  try {
    await update({ name });
    U.toast('Dein Name ist gespeichert.', null, { type: 'ok' });
  } catch (err) { formErr(f, err.message); fail(f); } finally { busy(f, false); }
}
async function changePw(f) {
  if (S.busy) return;
  clearErrs(f);
  if (!cryptoOk()) { formErr(f, NO_CRYPTO); fail(f); return; }
  const old = $('#auPwOld', f).value, n1 = $('#auPwNew', f).value, n2 = $('#auPwNew2', f).value;
  let bad = false;
  if (!old) bad = fieldErr('auPwOld', 'Gib dein aktuelles Passwort ein.');
  const prob = pwProblem(n1);
  if (prob) bad = fieldErr('auPwNew', prob);
  else if (n1 === old) bad = fieldErr('auPwNew', 'Das neue Passwort ist dasselbe wie das alte. Wähle ein anderes.');
  if (!n2) bad = fieldErr('auPwNew2', 'Wiederhole das neue Passwort.');
  else if (!prob && n1 !== n2) bad = fieldErr('auPwNew2', 'Die Passwörter sind nicht gleich. Tipp das neue Passwort noch einmal ein.');
  if (bad) { fail(f); return; }
  busy(f, true, 'Prüfe Passwort …');
  try {
    const base = await fresh();
    if (!(await checkPassword(old, base.pw))) { fieldErr('auPwOld', 'Das aktuelle Passwort stimmt nicht.'); fail(f); return; }
    base.pw = await hashPassword(n1);
    S.me = await saveUser(base);
    $$('input', f).forEach(i => { if (i.id !== 'auPwUser') i.value = ''; });
    meter($('#auPwNew', f));
    formErr(f, 'Dein Passwort ist geändert. Nutze ab jetzt das neue Passwort.', 'ok');
    U.toast('Passwort geändert.', null, { type: 'ok' });
  } catch (err) { formErr(f, err.message); fail(f); } finally { busy(f, false); }
}
async function saveSeller(f) {
  if (S.busy) return;
  clearErrs(f);
  const shopName = clean($('#auSellShop', f).value, 60), city = clean($('#auSellCity', f).value, 60);
  let bad = false;
  if (shopName.length < 2) bad = fieldErr('auSellShop', 'Gib deinem Shop einen Namen mit mindestens 2 Zeichen.');
  if (city.length < 2) bad = fieldErr('auSellCity', 'Gib die Stadt ein, aus der du versendest.');
  if (bad) { fail(f); return; }
  const was = S.me.role;
  busy(f, true, 'Speichern …');
  try {
    await update(was === 'customer' ? { role: 'seller', shopName, city } : { shopName, city });
    busy(f, false);
    $('#auSellBox').innerHTML = sellHTML();
    if (was === 'customer') {
      const act = F.admin && typeof F.admin.open === 'function' ? { label: 'Artikel einstellen', run: () => openAdmin('new-product') } : null;
      U.toast(`Dein Shop „${esc(shopName)}“ ist eröffnet. Stell jetzt deinen ersten Artikel ein.`, act, { type: 'ok', duration: 10000 });
      confetti();
      focusId('auSellShop');
    } else {
      formErr($('#auSellForm'), 'Deine Shop-Daten sind gespeichert.', 'ok');
    }
  } catch (err) { busy(f, false); formErr(f, err.message); fail(f); }
}
async function deleteAccount(f) {
  if (S.busy) return;
  clearErrs(f);
  const pw = $('#auDelPw', f).value;
  if (!pw) { fieldErr('auDelPw', 'Gib zur Bestätigung dein Passwort ein.'); fail(f); return; }
  busy(f, true, 'Lösche Konto …');
  try {
    const base = await fresh();
    if (base.role === 'admin' && !(await countOtherAdmins())) {
      formErr(f, 'Du bist der einzige Admin. Ernenne zuerst eine andere Person zum Admin.');
      fail(f);
      return;
    }
    if (!(await checkPassword(pw, base.pw))) { fieldErr('auDelPw', 'Das Passwort stimmt nicht.'); fail(f); return; }
    S.saving = true;
    try { await F.db.users.remove(base.id); } finally { S.saving = false; }
    S.me = null;
    await countUsers();
    await F.db.session.set(null);
    dlgK().close();
    F.emit('session', { user: null });
    U.toast('Dein Konto ist gelöscht. Danke, dass du bei Fundus warst.');
  } catch (err) { formErr(f, err.message); fail(f); } finally { busy(f, false); }
}
function openAdmin(section) {
  if (!(F.admin && typeof F.admin.open === 'function')) { U.toast('Die Verwaltung lädt noch. Versuch es gleich noch einmal.'); return; }
  if (accountOpen()) dlgK().close();
  F.admin.open(section);
}

const VIEWS = { overview: viewOverview, orders: viewOrders, addresses: viewAddresses, settings: viewSettings };

function buildAccount() {
  const d = document.createElement('dialog');
  d.id = 'dlgAccount';
  d.className = 'au-acc';
  d.setAttribute('aria-labelledby', 'auAccName');
  d.innerHTML = `<div class="au-top">
      <button class="x" type="button" data-close aria-label="Konto schließen">${ic('close')}</button>
      <div class="au-who" id="auWho"></div>
      <div class="au-tabs" role="tablist" aria-label="Bereiche deines Kontos">
        ${Object.entries(TABS).map(([k, [l, i]]) => `<button type="button" role="tab" id="auTab-${k}" aria-controls="auPanel" aria-selected="false" tabindex="-1" data-au-tab="${k}">${ic(i)}<span>${l}</span></button>`).join('')}
      </div>
    </div>
    <div class="dlg au-body" id="auBody"><div id="auPanel" role="tabpanel"></div></div>`;
  d.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t || t.disabled || !S.me) return;
    const ds = t.dataset;
    if (ds.auTab) { setTab(ds.auTab, { focus: ds.auFocus, open: ds.auOpen }); return; }
    if (ds.auToggle) { toggleOrder(t, ds.auToggle); return; }
    if (ds.auRebuy) { rebuy(ds.auRebuy, t); return; }
    if (ds.auCopy) { copyText(ds.auCopy, t); return; }
    if ('auShop' in ds) { d.close(); F.shop.toShop(); return; }
    if ('auFavs' in ds) { d.close(); const b = $('#favBtn'); if (b) b.click(); return; }
    if (ds.auAdmin) { openAdmin(ds.auAdmin); return; }
    if (ds.auEye) { toggleEye(t); return; }
    if (ds.auAddr) { S.addrEdit = ds.auAddr; S.addrDel = null; renderPanel(false).then(() => focusId('auAddrName')); return; }
    if ('auAddrCancel' in ds) { const back = S.addrEdit; S.addrEdit = null; renderPanel(false).then(() => focusId(back && back !== 'new' ? 'auAe-' + domId(back) : 'auAddrNew')); return; }
    if (ds.auAddrDel) { S.addrDel = ds.auAddrDel; S.addrEdit = null; renderPanel(false).then(() => focusId('auAddrKeep')); return; }
    if ('auAddrKeep' in ds) { const back = S.addrDel; S.addrDel = null; renderPanel(false).then(() => focusId('auAe-' + domId(back))); return; }
    if (ds.auAddrRm) { const id = ds.auAddrRm; changeAddrs(l => l.filter(a => a.id !== id), 'Adresse entfernt.'); return; }
    if (ds.auStd) { const id = ds.auStd; changeAddrs(l => l.filter(a => a.id === id).concat(l.filter(a => a.id !== id)), 'Das ist jetzt deine Standardadresse.'); return; }
    if ('auLogout' in ds) { logout(); return; }
    if ('auDel' in ds) { S.delStep = true; $('#auDelBox').innerHTML = delHTML(); focusId('auDelPw'); return; }
    if ('auDelCancel' in ds) { S.delStep = false; $('#auDelBox').innerHTML = delHTML(); focusId('auDelStart'); }
  });
  d.addEventListener('submit', e => {
    e.preventDefault();
    if (!S.me) return;
    const f = e.target;
    const run = { auNameForm: saveName, auPwForm: changePw, auSellForm: saveSeller, auAddrForm: saveAddr, auDelForm: deleteAccount }[f.id];
    if (run) run(f);
  });
  d.addEventListener('input', onInput);
  d.addEventListener('keydown', e => tabKeys(e, '.au-tabs', t => setTab(t.dataset.auTab)));
  d.addEventListener('animationend', e => { if (e.animationName === 'au-shake') e.target.classList.remove('au-shake'); });
  d.addEventListener('close', () => { S.delStep = false; S.addrEdit = null; S.addrDel = null; });
  return d;
}

/* ---------- Ereignisse von außen ---------- */
async function onUsersChange(ev) {
  try {
    if (!S.me) return;
    if (ev.id && ev.id !== S.me.id) {
      // Andere Konten: nur die Admin-Zahl beim Löschen kann sich ändern
      if (accountOpen() && S.tab === 'settings' && $('#auDelBox')) { S.otherAdmins = await countOtherAdmins(); if (!S.delStep) $('#auDelBox').innerHTML = delHTML(); }
      return;
    }
    const u = await F.db.users.get(S.me.id);
    if (!u) { await forceOut('Dein Konto gibt es auf diesem Gerät nicht mehr. Du bist jetzt abgemeldet.'); return; }
    if (u.blocked) { await forceOut('Dein Konto wurde gesperrt. Du bist jetzt abgemeldet.'); return; }
    if (JSON.stringify(u) === JSON.stringify(S.me)) return;
    S.me = u;
    F.emit('session', { user: current() });
    if (accountOpen()) { renderHeader(); renderPanel(false); }
  } catch (err) { console.error(err); }
}

/* ---------- Start ---------- */
async function init() {
  if (S.started) return;
  S.started = true;
  if (!document.getElementById('auth-style')) {
    const st = document.createElement('style');
    st.id = 'auth-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  if (!dlgA()) document.body.appendChild(buildAuth());
  if (!dlgK()) document.body.appendChild(buildAccount());
  U.wireDialog(dlgA());
  U.wireDialog(dlgK());
  loadLock();
  try {
    const users = await F.db.users.all();
    S.users = users.length;
    const id = await F.db.session.get();
    const u = id ? users.find(x => x.id === id) : null;
    if (u && !u.blocked) S.me = u;
    else if (id) await F.db.session.set(null);
  } catch (err) { console.error(err); }
  F.on('users:change', ev => {
    countUsers();
    // Eigene Speichervorgänge sind schon verarbeitet
    if (!S.saving) onUsersChange(ev || {});
  });
  F.on('orders:change', () => { if (accountOpen() && S.me && (S.tab === 'orders' || S.tab === 'overview')) renderPanel(false); });
  F.emit('session', { user: current() });
}

/* ---------- Styles ---------- */
const CSS = `
/* Anmelden / Registrieren */
dialog.au-auth{width:min(500px,calc(100% - 24px));margin:min(6vh,56px) auto auto;max-height:calc(100% - min(6vh,56px) - 12px)}
.au-auth .dlg{padding:24px 26px 22px}
.au-auth .eyebrow{margin-bottom:6px}
.au-title{font:800 clamp(24px,3.4vw,30px)/1.1 var(--f-display);letter-spacing:-.02em;margin:0 0 16px;padding-right:48px}
.au-reason,.au-first{display:flex;gap:10px;align-items:flex-start;margin:0 0 16px;padding:12px 14px;border-radius:12px;font-size:15px;font-weight:600;color:var(--ink);background:color-mix(in oklab,var(--accent) 20%,var(--surface));animation:au-drop .25s ease-out}
.au-first{margin:0;background:color-mix(in oklab,var(--good) 13%,var(--surface))}
.au-reason .ic,.au-first .ic{width:20px;height:20px;margin-top:1px;color:var(--link)}
.au-switch{position:relative;display:grid;grid-template-columns:1fr 1fr;padding:4px;margin:0 0 20px;border-radius:999px;background:var(--surface-2)}
.au-switch::before{content:"";position:absolute;top:4px;bottom:4px;left:4px;width:calc(50% - 4px);border-radius:999px;background:var(--surface);box-shadow:0 1px 4px color-mix(in oklab,var(--ink) 18%,transparent);transition:transform .34s cubic-bezier(.3,.7,.2,1)}
.au-switch[data-mode="register"]::before{transform:translateX(100%)}
.au-switch button{position:relative;min-height:44px;border:0;border-radius:999px;background:none;color:var(--ink-soft);font-weight:700;font-size:15px;transition:color .25s}
.au-switch button[aria-selected="true"]{color:var(--ink)}
.au-stage{position:relative}
.au-stage.au-anim{overflow:hidden;transition:height .34s cubic-bezier(.3,.7,.2,1)}
.au-pane{display:grid;gap:14px;align-content:start;transition:opacity .26s ease .06s,transform .34s cubic-bezier(.3,.7,.2,1)}
.au-pane:not(.on){position:absolute;top:0;left:0;right:0;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .16s ease,transform .34s cubic-bezier(.3,.7,.2,1),visibility 0s .34s}
.au-pane[data-pane="login"]:not(.on){transform:translateX(-32px)}
.au-pane[data-pane="register"]:not(.on){transform:translateX(32px)}
.au-inp{position:relative}
.au-pw .inp{padding-right:54px}
.au-eye{position:absolute;top:2px;right:2px;display:grid;place-items:center;width:44px;height:44px;border:0;border-radius:10px;background:none;color:var(--ink-soft)}
.au-eye:hover,.au-eye[aria-pressed="true"]{color:var(--ink)}
.au-eye .ic{width:20px;height:20px}
.au-field .inp[aria-invalid="true"]{border-color:var(--sale)}
.au-field .inp[aria-invalid="true"]:focus{box-shadow:0 0 0 3px color-mix(in oklab,var(--sale) 25%,transparent)}
.au-err{display:flex;flex-wrap:wrap;align-items:center;gap:0 6px;animation:au-drop .2s ease-out}
.au-err .ic{width:16px;height:16px;flex:none}
.au-err > span{flex:1 1 180px}
.au-err .linkbtn{color:var(--link)}
.au-lb{min-height:44px;padding:0 2px}
.au-meter{display:flex;align-items:center;gap:12px;font-size:13px;color:var(--ink-soft)}
.au-bars{flex:1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}
.au-bars i{height:6px;border-radius:3px;background:var(--line);transition:background-color .25s}
.au-meter[data-l="1"] i:nth-child(1){background:var(--sale)}
.au-meter[data-l="2"] i:nth-child(-n+2){background:var(--accent)}
.au-meter[data-l="3"] i:nth-child(-n+3){background:var(--link)}
.au-meter[data-l="4"] i{background:var(--good)}
.au-ml{min-width:5.2em;text-align:right;font-weight:700;color:var(--ink)}
.au-rules{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:4px 16px;font-size:13px;color:var(--ink-soft)}
.au-rules li{display:flex;align-items:center;gap:6px}
.au-rules .ic{width:16px;height:16px;padding:2px;border-radius:50%;background:var(--line);color:transparent;transition:background-color .2s,color .2s,transform .2s}
.au-rules li[data-ok="true"]{color:var(--ink)}
.au-rules li[data-ok="true"] .ic{background:var(--good);color:var(--surface);transform:scale(1.12)}
.au-forgot{display:grid;margin-top:-6px}
.au-forgot > .linkbtn{justify-self:end}
.au-fold{display:grid;grid-template-rows:0fr;transition:grid-template-rows .32s cubic-bezier(.3,.7,.2,1)}
.au-fold > div{min-height:0;overflow:hidden}
.au-fold.open{grid-template-rows:1fr}
.au-forgot p{margin-top:4px;padding:12px 14px;border-radius:12px;background:var(--surface-2);font-size:14px}
.au-alert{display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px 10px;padding:12px 14px;border-radius:12px;background:color-mix(in oklab,var(--sale) 13%,var(--surface));color:var(--ink);font-size:14px;font-weight:600;animation:au-drop .22s ease-out}
.au-alert > .ic{width:20px;height:20px;color:var(--sale)}
.au-alert > span{flex:1 1 200px}
.au-alert.ok{background:color-mix(in oklab,var(--good) 13%,var(--surface))}
.au-alert.ok > .ic{color:var(--good)}
.au-alert.warn{align-items:center;background:color-mix(in oklab,var(--accent) 22%,var(--surface))}
.au-alert.warn > .ic{color:var(--ink)}
.au-submit{gap:10px}
.au-submit.au-ok{background:var(--good);color:var(--surface)}
.au-submit.au-ok .ic{animation:au-pop .35s cubic-bezier(.3,1.6,.5,1)}
.au-spin{width:18px;height:18px;flex:none;border-radius:50%;border:2.5px solid currentColor;border-right-color:transparent;animation:au-spin .7s linear infinite}
.au-new{display:grid;gap:8px;margin-top:6px;padding:16px 18px;border-radius:16px;background:var(--surface-2)}
.au-new b{font:800 17px/1.2 var(--f-display)}
.au-new p{font-size:14px;color:var(--ink-soft)}
.au-new .btn{justify-self:start;margin-top:2px}
.au-alt{text-align:center;font-size:14px;color:var(--ink-soft)}
.au-note{display:flex;align-items:center;gap:8px;margin-top:18px}
.au-note .ic{width:16px;height:16px;flex:none}
.au-shake{animation:au-shake .42s cubic-bezier(.36,.07,.19,.97)}

/* Konto */
dialog.au-acc{width:min(820px,calc(100% - 24px))}
dialog.au-acc[open]{height:min(860px,calc(100% - 24px))}
.au-top{position:relative;flex:none;padding:22px 26px 0;border-bottom:1px solid var(--line)}
.au-who{display:flex;align-items:center;gap:16px;min-width:0;padding-right:52px;margin-bottom:16px}
.au-avatar{flex:none;display:grid;place-items:center;width:60px;height:60px;border-radius:50%;background:var(--brand);color:var(--brand-ink);font:800 22px/1 var(--f-display);letter-spacing:.02em;box-shadow:0 0 0 3px var(--surface),0 0 0 5px var(--accent)}
.au-whotxt{min-width:0}
.au-who h2{margin:0 0 4px;font:800 clamp(21px,3vw,27px)/1.15 var(--f-display);letter-spacing:-.02em;overflow-wrap:anywhere}
.au-who p{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:14px;color:var(--ink-soft)}
.au-mail{overflow-wrap:anywhere}
.au-role{padding:5px 8px;border-radius:6px;background:var(--surface-2);color:var(--ink);font:700 11px/1 var(--f-body);letter-spacing:.06em;text-transform:uppercase}
.au-role.admin{background:var(--brand);color:var(--brand-ink)}
.au-role.seller{background:var(--accent);color:var(--accent-ink)}
.au-shop{display:inline-flex;align-items:center;gap:4px;font-weight:600;color:var(--ink)}
.au-shop .ic{width:16px;height:16px}
.au-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;padding:4px;margin-bottom:16px;border-radius:999px;background:var(--surface-2)}
.au-tabs button{display:flex;align-items:center;justify-content:center;gap:7px;min-width:0;min-height:44px;padding:0 10px;border:0;border-radius:999px;background:transparent;color:var(--ink-soft);font-weight:700;font-size:14px;white-space:nowrap;transition:background-color .2s,color .2s,box-shadow .2s}
.au-tabs button .ic{width:18px;height:18px}
.au-tabs button:hover{color:var(--ink)}
.au-tabs button[aria-selected="true"]{background:var(--surface);color:var(--ink);box-shadow:0 1px 4px color-mix(in oklab,var(--ink) 16%,transparent)}
.au-acc .au-body{padding:22px 26px 30px}
.au-in{animation:au-in .3s ease-out}
.au-enter .au-stat,.au-enter .au-card,.au-enter .au-order,.au-enter .au-addr,.au-enter .au-rise{animation:au-rise .42s cubic-bezier(.3,.7,.2,1) both;animation-delay:calc(var(--i,0) * 45ms)}
.au-btn{min-height:44px;padding:0 16px;font-size:14px}
.au-h{margin:0;font:800 19px/1.2 var(--f-display);letter-spacing:-.01em}
.au-sechead{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 16px;margin-bottom:12px}
.au-due{margin-bottom:18px}
.au-due .btn{margin-left:auto}
.au-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:22px}
.au-stat{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:0;min-height:44px;padding:16px 18px;border:0;border-radius:16px;background:var(--surface-2);color:var(--ink);font:inherit;text-align:left;transition:background-color .2s,transform .15s}
button.au-stat:hover{background:color-mix(in oklab,var(--link) 10%,var(--surface-2))}
button.au-stat:active{transform:translateY(1px)}
.au-stat b{font:800 clamp(22px,3vw,30px)/1.1 var(--f-display);letter-spacing:-.01em;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.au-stat span{font-size:14px;font-weight:600;color:var(--ink-soft)}
.au-last{margin-bottom:22px}
.au-lastrow{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;width:100%;min-height:44px;padding:12px 16px;border:1px solid var(--line);border-radius:16px;background:var(--surface);color:var(--ink);font:inherit;text-align:left;transition:border-color .2s,box-shadow .2s}
.au-lastrow:hover{border-color:transparent;box-shadow:var(--shadow)}
.au-lastrow .au-othumbs{margin:0}
.au-lastinfo{flex:1 1 140px;display:flex;flex-direction:column;min-width:0}
.au-lastinfo small{color:var(--ink-soft);font-size:13px}
.au-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px}
.au-card{display:grid;gap:8px;align-content:start;padding:18px;border:1px solid var(--line);border-radius:16px}
.au-card > .ic{width:26px;height:26px;color:var(--link)}
.au-card h3{margin:0;font:800 18px/1.2 var(--f-display);overflow-wrap:anywhere}
.au-card p{font-size:14px;color:var(--ink-soft)}
.au-card .btn{justify-self:start;margin-top:4px}
.au-card .row .btn{margin-top:0}
.au-card .row{margin-top:4px}
.au-card.hl{background:var(--brand);color:var(--brand-ink);border-color:transparent}
.au-card.hl p{color:inherit;opacity:.88}
.au-card.hl > .ic{color:var(--accent)}
.au-since{margin-top:20px}
.au-empty{display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:32px 24px;border:1.5px dashed var(--line);border-radius:18px}
.au-empty > .ic{width:42px;height:42px;color:var(--ink-soft)}
.au-empty b{font:800 21px/1.2 var(--f-display)}
.au-empty p{max-width:48ch;color:var(--ink-soft)}
.au-count{margin-bottom:12px}
.au-orders{display:grid;gap:12px}
.au-order{scroll-margin-top:16px;padding:14px 16px;border:1px solid var(--line);border-radius:16px;background:var(--surface);transition:border-color .25s,box-shadow .25s}
.au-order.open{border-color:color-mix(in oklab,var(--link) 45%,var(--line));box-shadow:var(--shadow)}
.au-ohead{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:8px 16px}
.au-ometa{min-width:0}
.au-onum{margin:0;font:700 16px/1.3 var(--f-body);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.au-ostate{display:flex;align-items:center;gap:12px}
.au-ototal{font:800 18px/1.2 var(--f-display);font-variant-numeric:tabular-nums;white-space:nowrap}
.au-othumbs{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.au-th{flex:none;display:block;width:52px;height:52px;padding:0;border:0;border-radius:10px;overflow:hidden;background:var(--tint);background:color-mix(in oklab,var(--tint) var(--tint-mix),var(--surface))}
.au-th svg,.au-th img{display:block;width:100%;height:100%;transition:transform .25s}
button.au-th:hover svg,button.au-th:hover img{transform:scale(1.08)}
.au-th.more{display:grid;place-items:center;background:var(--surface-2);color:var(--ink-soft);font-weight:700;font-size:14px}
.au-lastrow .au-th{width:44px;height:44px}
.au-oacts{display:flex;flex-wrap:wrap;gap:8px}
.au-more::after{content:"";width:8px;height:8px;margin-left:2px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:translateY(-2px) rotate(45deg);transition:transform .25s}
.au-more[aria-expanded="true"]::after{transform:translateY(2px) rotate(-135deg)}
.au-odgrid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px 24px;margin-top:14px;padding-top:16px;border-top:1px solid var(--line)}
.au-blkcol{display:grid;gap:18px;align-content:start}
.au-blk h4{margin:0 0 8px;font:700 12px/1.2 var(--f-body);letter-spacing:.1em;text-transform:uppercase;color:var(--ink-soft)}
.au-blk address{font-style:normal}
.au-blk > p{display:flex;align-items:center;gap:8px}
.au-blk > p .ic{width:20px;height:20px;color:var(--ink-soft)}
.au-blk > p.hint{margin-top:4px}
.au-eta{margin-top:8px;font-size:14px}
.au-wide{grid-column:1 / -1}
.au-items{list-style:none;margin:0 0 12px;padding:0;display:grid;gap:2px;font-size:15px}
.au-items li{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:32px}
.au-items li > span:last-child{font-variant-numeric:tabular-nums;white-space:nowrap}
.au-items li > span:first-child{display:flex;align-items:center;gap:6px;min-width:0}
.au-items .linkbtn{display:inline-flex;align-items:center;min-height:44px;text-align:left}
.au-tl{list-style:none;margin:0;padding:0;display:grid}
.au-tl li{position:relative;display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;padding-bottom:14px}
.au-tl li::before{content:"";width:12px;height:12px;margin:5px 0 0 5px;border-radius:50%;background:var(--good);box-shadow:0 0 0 3px color-mix(in oklab,var(--good) 22%,transparent)}
.au-tl li::after{content:"";position:absolute;left:10px;top:22px;bottom:2px;width:2px;border-radius:1px;background:var(--line)}
.au-tl li.done:not(.now)::after{background:var(--good)}
.au-tl li:last-child{padding-bottom:0}
.au-tl li:last-child::after{display:none}
.au-tl li.now::before{animation:au-pulse 2.2s ease-in-out infinite}
.au-tl li.todo{color:var(--ink-soft)}
.au-tl li.todo::before{background:var(--surface);box-shadow:inset 0 0 0 2px var(--line)}
.au-tl b{font-weight:700;font-size:15px}
.au-tl small{display:block;font-size:13px;color:var(--ink-soft);overflow-wrap:anywhere}
.au-bank{display:grid;gap:12px;margin-bottom:12px;padding:16px;border-radius:14px;background:color-mix(in oklab,var(--accent) 16%,var(--surface));box-shadow:inset 0 0 0 1.5px color-mix(in oklab,var(--accent) 55%,transparent)}
.au-bank > p{display:grid;gap:2px}
.au-bank dl{margin:0;display:grid;gap:6px}
.au-bank dl > div{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:0 12px;min-height:44px}
.au-bank dt{font-size:14px;color:var(--ink-soft)}
.au-bank dd{margin:0;display:flex;align-items:center;gap:4px;font-weight:700;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.au-sel{white-space:nowrap;user-select:all;-webkit-user-select:all}
.au-copy{flex:none;display:grid;place-items:center;width:44px;height:44px;border:0;border-radius:10px;background:transparent;color:var(--ink)}
.au-copy:hover{background:color-mix(in oklab,var(--ink) 8%,transparent)}
.au-copy .ic{width:18px;height:18px}
.au-addrs{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,250px),1fr));gap:12px}
.au-addr{display:grid;gap:6px;align-content:start;padding:16px 18px 10px;border:1.5px solid var(--line);border-radius:16px}
.au-addr.first{border-color:color-mix(in oklab,var(--link) 60%,var(--line))}
.au-addr address{font-style:normal;overflow-wrap:anywhere}
.au-std{justify-self:start;padding:4px 8px;border-radius:6px;background:color-mix(in oklab,var(--link) 14%,var(--surface));color:var(--link);font:700 11px/1 var(--f-body);letter-spacing:.06em;text-transform:uppercase}
.au-acts{display:flex;flex-wrap:wrap;gap:0 16px}
.au-acts .au-del{color:var(--sale)}
.au-form{display:grid;gap:14px;margin-bottom:16px;padding:18px;border-radius:16px;background:var(--surface-2);animation:au-drop .25s ease-out}
.au-addrs .au-form{grid-column:1 / -1;margin:0}
.au-form .inp{background:var(--surface)}
.au-confirm{display:grid;gap:12px;padding:14px;border-radius:12px;background:color-mix(in oklab,var(--sale) 11%,var(--surface));animation:au-drop .22s ease-out}
.au-addr .au-confirm{margin:6px 0 6px}
.au-sec{display:grid;gap:12px;padding:22px 0;border-top:1px solid var(--line)}
.au-sec:first-child{padding-top:0;border-top:0}
.au-sec h3{margin:0;font:800 19px/1.2 var(--f-display)}
.au-sec > p{max-width:60ch;font-size:14px;color:var(--ink-soft)}
.au-sec form{display:grid;gap:14px;max-width:520px}
.au-sec > .btn,.au-sec form > .btn{justify-self:start}
.au-ro{display:flex;align-items:center;min-height:48px;padding:0 14px;border-radius:12px;background:var(--surface-2);font-weight:600;overflow-wrap:anywhere}
.au-danger h3{color:var(--sale)}
.au-delbtn{color:var(--sale)}

@keyframes au-shake{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(4px)}30%,50%,70%{transform:translateX(-7px)}40%,60%{transform:translateX(7px)}}
@keyframes au-drop{from{opacity:0;transform:translateY(-4px)}}
@keyframes au-in{from{opacity:0;transform:translateY(8px)}}
@keyframes au-rise{from{opacity:0;transform:translateY(14px)}}
@keyframes au-spin{to{transform:rotate(360deg)}}
@keyframes au-pop{from{opacity:0;transform:scale(.3)}}
@keyframes au-pulse{50%{box-shadow:0 0 0 7px color-mix(in oklab,var(--good) 10%,transparent)}}

@media (max-width:640px){
  .au-odgrid{grid-template-columns:minmax(0,1fr)}
}
@media (max-width:560px){
  .au-auth .dlg{padding:22px 18px 18px}
  .au-top{padding:18px 16px 0}
  .au-who{gap:12px;margin-bottom:14px}
  .au-avatar{width:50px;height:50px;font-size:19px}
  .au-tabs{grid-template-columns:repeat(2,minmax(0,1fr));border-radius:22px}
  .au-acc .au-body{padding:18px 16px 26px}
  .au-stats{grid-template-columns:minmax(0,1fr);gap:8px}
  .au-stat{flex-direction:row-reverse;align-items:center;justify-content:space-between;padding:12px 16px}
  .au-stat b{font-size:22px}
  .au-order{padding:14px}
  .au-th{width:44px;height:44px}
  .au-bank{padding:14px 12px}
  .au-bank dd{font-size:15px}
  .au-due .btn{margin-left:0}
}
`;

F.auth = { init, current, isAdmin, requireLogin, openAccount, logout, update, setPassword, hashPassword };
})();
