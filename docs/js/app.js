/* Fundus – Kern: Hilfsfunktionen, Ereignisse, Katalog, Warenkorb, Produktansicht, Installation, Updates.
 *
 * Öffentliche Schnittstelle (für auth.js, checkout.js, admin.js, fx.js):
 *   Fundus.on(type, fn) / Fundus.emit(type, detail)       Ereignisbus
 *   Fundus.util   Hilfsfunktionen (siehe unten)
 *   Fundus.shop   Katalog, Warenkorb, Darstellung
 * Module hängen sich als Fundus.fx / Fundus.auth / Fundus.checkout / Fundus.admin an
 * und bekommen beim Start init() aufgerufen (in dieser Reihenfolge).
 */
(() => {
'use strict';
const F = window.Fundus = window.Fundus || {};
const ic = F.ic;
const art = p => F.art.svg(p);

/* ---------- Helfer ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch (e) { return f; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* Speicher nicht verfügbar */ } }
};
const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const dec1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const int = new Intl.NumberFormat('de-DE');
const dayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
const dateFmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const round2 = n => Math.round(n * 100) / 100;

/* ---------- Ereignisse ---------- */
const bus = new EventTarget();
F.on = (type, fn) => bus.addEventListener(type, e => { try { fn(e.detail || {}); } catch (err) { console.error(err); } });
F.emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail: detail || {} }));

/* ---------- Lieferdaten ---------- */
function plusWorkdays(n, from) {
  const d = from ? new Date(from) : new Date();
  let added = 0;
  while (added < n) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0) added++; }
  return d;
}
function dayLabel(d) {
  const t = new Date(); t.setDate(t.getDate() + 1);
  return d.toDateString() === t.toDateString() ? `morgen, ${dayFmt.format(d)}` : dayFmt.format(d);
}
const fastDate = () => dayLabel(plusWorkdays(1));
const stdRange = () => `${dayFmt.format(plusWorkdays(3))} – ${dayFmt.format(plusWorkdays(5))}`;

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg, action, opts) {
  const t = $('#toast');
  // Über offenen Dialogen anzeigen: Toast in den obersten offenen Dialog hängen
  const open = $$('dialog[open]');
  const host = open.length ? open[open.length - 1] : document.body;
  if (t.parentElement !== host) host.appendChild(t);
  t.className = 'toast' + (opts && opts.type ? ' ' + opts.type : '');
  t.innerHTML = `<span>${msg}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  if (action) t.querySelector('button').onclick = () => { t.hidden = true; action.run(); };
  t.hidden = false;
  void t.offsetWidth; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, (opts && opts.duration) || 4200);
}

/* ---------- Dialoge ---------- */
function openDlg(d) {
  if (!d.open) d.showModal();
  const sc = d.querySelector('.dlg, .cart-list');
  if (sc) sc.scrollTop = 0;
  F.emit('dialog:open', { dlg: d });
}
const closeAll = () => $$('dialog[open]').forEach(d => d.close());
function wireDialog(d) {
  if (d.dataset.wired) return;
  d.dataset.wired = '1';
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
}

F.util = {
  $, $$, store, eur, dec1, int, dayFmt, dateFmt, dateTimeFmt, esc, reduced, uid, round2, ic,
  toast, openDlg, closeAll, wireDialog, plusWorkdays, fastDate, stdRange, safeImg: F.art.safeImg
};

/* ---------- Zustand ---------- */
const CATS = F.db.CATS;
const S = {
  q: '', cat: 'alle', sort: 'empf', hand: false, fast: false, deals: false, favsOnly: false,
  products: [],
  settings: null,
  cart: store.get('fundus.cart', {}),
  favs: new Set(store.get('fundus.favs', []))
};
const byId = id => S.products.find(p => p.id === id) || null;
const shopProducts = () => S.products.filter(p => p.active !== false);
const saveCart = () => store.set('fundus.cart', S.cart);
const saveFavs = () => store.set('fundus.favs', [...S.favs]);
const stockOf = p => (p && Number.isFinite(+p.stock) ? Math.max(0, Math.floor(+p.stock)) : 99);
const FREE = () => S.settings.freeShipping;

function cleanCart() {
  let changed = false;
  for (const id of Object.keys(S.cart)) {
    const p = byId(id);
    const max = p && p.active !== false ? stockOf(p) : 0;
    if (!(S.cart[id] > 0) || !max) { delete S.cart[id]; changed = true; }
    else if (S.cart[id] > max) { S.cart[id] = max; changed = true; }
  }
  if (changed) saveCart();
  return changed;
}

/* ---------- Bausteine ---------- */
function delivery(p) {
  const free = p.price >= FREE() ? ' · versandkostenfrei' : '';
  return p.express ? `<b>Lieferung ${fastDate()}</b>${free}` : `Lieferung ${stdRange()}${free}`;
}
const stars = r => `<span class="stars" role="img" aria-label="${dec1.format(r)} von 5 Sternen"><span style="width:${(r / 5) * 100}%"></span></span>`;
const rating = p => (p.reviews
  ? `<p class="rate">${stars(p.rating)}<span>${dec1.format(p.rating)} (${int.format(p.reviews)})</span></p>`
  : '<p class="rate"><span>Neu · noch keine Bewertungen</span></p>');
const pct = p => (p.old && p.old > p.price ? Math.round((1 - p.price / p.old) * 100) : 0);
function priceHTML(p) {
  const off = pct(p);
  return `<p class="price"><strong>${eur.format(p.price)}</strong>${off ? `<s>${eur.format(p.old)}</s><span class="pct">−${off} %</span>` : ''}</p>`;
}
function stockHTML(p) {
  const n = stockOf(p);
  if (!n) return '<p class="stock out">Ausverkauft</p>';
  if (n <= 5) return `<p class="stock low">Nur noch ${n} verfügbar</p>`;
  return '';
}
function card(p, opts) {
  const o = opts || {};
  const fav = S.favs.has(p.id);
  const off = pct(p);
  const n = stockOf(p);
  const me = F.auth && F.auth.current ? F.auth.current() : null;
  const mine = me && p.sellerId && p.sellerId === me.id;
  const badges = [
    mine ? '<span class="badge own">Dein Angebot</span>' : '',
    !n ? '<span class="badge">Ausverkauft</span>' : '',
    p.handmade ? '<span class="badge hand">Handgemacht</span>' : '',
    off ? '<span class="badge sale">Angebot</span>' : '',
    p.badge && !off ? `<span class="badge">${esc(p.badge)}</span>` : ''
  ].filter(Boolean).slice(0, 2).join('');
  return `<article class="card${n ? '' : ' soldout'}" data-pid="${esc(p.id)}">
    <button class="pic" type="button" data-open="${esc(p.id)}" style="--tint:${esc(p.tint || '#E7ECE6')}" aria-label="${esc(p.name)} ansehen">${art(p)}<span class="badges">${badges}</span></button>
    ${o.preview ? '' : `<button class="fav" type="button" data-fav="${esc(p.id)}" aria-pressed="${fav}" aria-label="${fav ? 'Vom Merkzettel entfernen' : 'Auf den Merkzettel'}">${ic('heart')}</button>`}
    <div class="cbody">
      <p class="seller">${esc(p.seller)}${p.city ? ' · ' + esc(p.city) : ''}</p>
      <h3 class="name"><button type="button" data-open="${esc(p.id)}">${esc(p.name)}</button></h3>
      ${rating(p)}
      ${priceHTML(p)}
      ${stockHTML(p) || `<p class="ship">${delivery(p)}</p>`}
      <button class="btn" type="button" data-add="${esc(p.id)}"${n ? '' : ' disabled'} aria-label="${esc(p.name)} in den Warenkorb">${ic('cart')}<span>${n ? 'In den Warenkorb' : 'Ausverkauft'}</span></button>
    </div>
  </article>`;
}
function device() {
  const ids = ['p1', 'p4', 'p2', 'p6', 'p15', 'p11'];
  const items = ids.map(byId).filter(Boolean);
  while (items.length < 6 && S.products[items.length]) items.push(S.products[items.length]);
  return `<div class="device" aria-hidden="true"><div class="screen"><div class="s-top"><span class="s-logo"></span><span class="s-search"></span></div><div class="s-grid">${items.map(p => `<div class="s-tile" style="--tint:${esc(p.tint || '#E7ECE6')}">${art(p)}</div>`).join('')}</div></div></div>`;
}

/* ---------- Liste ---------- */
function visible() {
  const q = S.q.trim().toLowerCase();
  const me = F.auth && F.auth.current ? F.auth.current() : null;
  const score = p => (p.rating || 0) * Math.log10((p.reviews || 0) + 10) + (stockOf(p) ? 0 : -100);
  const isNew = p => (me && p.sellerId === me.id ? 1 : 0);
  const sorters = {
    empf: (a, b) => isNew(b) - isNew(a) || score(b) - score(a),
    neu: (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
    auf: (a, b) => a.price - b.price,
    ab: (a, b) => b.price - a.price,
    bew: (a, b) => (b.rating || 0) - (a.rating || 0) || (b.reviews || 0) - (a.reviews || 0)
  };
  return shopProducts().filter(p =>
    (S.cat === 'alle' || p.cat === S.cat) &&
    (!S.hand || p.handmade) && (!S.fast || p.express) && (!S.deals || pct(p)) &&
    (!S.favsOnly || S.favs.has(p.id)) &&
    (!q || [p.name, p.seller, p.city, CATS[p.cat], p.desc].join(' ').toLowerCase().includes(q))
  ).sort(sorters[S.sort] || sorters.empf);
}
function renderChips() {
  const cats = [['alle', 'Alle'], ...Object.entries(CATS)];
  $('#chips').innerHTML =
    cats.map(([k, l]) => `<button type="button" class="chip" data-cat="${k}" aria-pressed="${S.cat === k}">${l}</button>`).join('') +
    '<span class="chip-sep" aria-hidden="true"></span>' +
    [['hand', 'Handgemacht'], ['fast', 'Morgen da'], ['deals', 'Angebote']]
      .map(([k, l]) => `<button type="button" class="chip tog" data-tog="${k}" aria-pressed="${S[k]}">${S[k] ? ic('check') : ''}${l}</button>`).join('') +
    (S.favsOnly ? `<button type="button" class="chip tog" data-tog="favsOnly" aria-pressed="true">${ic('heart')}Merkzettel${ic('close')}</button>` : '');
}
function render() {
  renderChips();
  $('#searchCat').value = S.cat;
  $('#sort').value = S.sort;
  if ($('#q').value !== S.q) $('#q').value = S.q;
  const list = visible();
  const grid = $('#grid');
  grid.innerHTML = list.map(p => card(p)).join('');
  $('#empty').hidden = list.length > 0;
  $('#resultCount').textContent = `${list.length} Artikel`;
  let title = 'Beliebt diese Woche';
  if (S.favsOnly) title = 'Dein Merkzettel';
  else if (S.q.trim()) title = `Ergebnisse für „${S.q.trim()}“`;
  else if (S.cat !== 'alle') title = CATS[S.cat];
  else if (S.hand) title = 'Handgemacht';
  else if (S.deals) title = 'Angebote';
  else if (S.fast) title = 'Morgen bei dir';
  $('#resultsTitle').textContent = title;
  $('#emptyMsg').textContent = S.favsOnly && !S.favs.size
    ? 'Tippe auf das Herz bei einem Artikel, um ihn hier zu sammeln.'
    : 'Versuch es mit einem anderen Suchbegriff oder entferne einen Filter.';
  F.emit('grid:render', { grid, count: list.length });
}
const toShop = () => $('#shop').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
function resetFilters() { Object.assign(S, { q: '', cat: 'alle', hand: false, fast: false, deals: false, favsOnly: false }); }
function renderDecor() {
  const pick = ['p1', 'p4', 'p6', 'p2'].map(byId).filter(Boolean);
  $('#collage').innerHTML = pick.map(p => `<div class="tile" style="--tint:${esc(p.tint)}">${art(p)}</div>`).join('');
  $$('.device-slot').forEach(el => { el.innerHTML = device(); });
}

/* ---------- Kopfzeile ---------- */
function cartCount() { return Object.values(S.cart).reduce((a, b) => a + b, 0); }
function updateBadges() {
  const n = cartCount();
  const f = S.favs.size;
  $('#cartCount').textContent = n; $('#cartCount').hidden = !n;
  $('#favCount').textContent = f; $('#favCount').hidden = !f;
  $('#cartBtn').setAttribute('aria-label', `Warenkorb, ${n} Artikel`);
  $('#favBtn').setAttribute('aria-label', `Merkzettel, ${f} Artikel`);
}
function updateAccountUI() {
  const me = F.auth && F.auth.current ? F.auth.current() : null;
  const first = me ? String(me.name || me.email).trim().split(/\s+/)[0] : '';
  $('#accountLabel').textContent = me ? first : 'Anmelden';
  $('#accountBtn').setAttribute('aria-label', me ? `Konto von ${first}` : 'Anmelden oder registrieren');
  $('#adminBtn').hidden = !(me && (me.role === 'admin' || me.role === 'seller'));
  $('#adminLabel').textContent = me && me.role === 'seller' ? 'Mein Shop' : 'Verwaltung';
}

/* ---------- Produktdetails ---------- */
let dtQty = 1;
function openProduct(id) {
  const p = byId(id);
  if (!p) return;
  dtQty = 1;
  const fav = S.favs.has(p.id);
  const off = pct(p);
  const n = stockOf(p);
  const me = F.auth && F.auth.current ? F.auth.current() : null;
  const canEdit = me && (me.role === 'admin' || (p.sellerId && p.sellerId === me.id));
  $('#dtBody').innerHTML = `
    <button class="x" type="button" data-close aria-label="Schließen">${ic('close')}</button>
    <div class="dt">
      <div class="pic" style="--tint:${esc(p.tint || '#E7ECE6')}">${art(p)}<span class="badges">${p.handmade ? '<span class="badge hand">Handgemacht</span>' : ''}${off ? `<span class="badge sale">−${off} %</span>` : ''}</span></div>
      <div class="dt-info">
        <p class="seller">von <button class="linkbtn" type="button" data-seller="${esc(p.seller)}">${esc(p.seller)}</button>${p.city ? ' · ' + esc(p.city) : ''}</p>
        <h2 id="dtTitle">${esc(p.name)}</h2>
        ${rating(p)}
        <div>${priceHTML(p)}<p class="vat">inkl. MwSt., ${p.price >= FREE() ? 'versandkostenfrei' : `zzgl. ${eur.format(S.settings.shipping)} Versand`}</p></div>
        ${stockHTML(p)}
        ${n ? `<p class="ship">${delivery(p)}</p>` : ''}
        <div class="buybox">
          <div class="stepper" role="group" aria-label="Menge">
            <button type="button" data-dq="-1" aria-label="Eins weniger"${n ? '' : ' disabled'}>${ic('minus')}</button>
            <output id="dtQty" aria-live="polite">${n ? 1 : 0}</output>
            <button type="button" data-dq="1" aria-label="Eins mehr"${n ? '' : ' disabled'}>${ic('plus')}</button>
          </div>
          <button class="btn" type="button" data-add="${esc(p.id)}" data-from="detail"${n ? '' : ' disabled'}>${ic('cart')}In den Warenkorb</button>
          <button class="btn dark" type="button" data-buy="${esc(p.id)}"${n ? '' : ' disabled'}>Sofort kaufen</button>
        </div>
        <div class="row">
          <button class="linkbtn" type="button" data-fav="${esc(p.id)}" aria-pressed="${fav}">${fav ? 'Auf dem Merkzettel ✓' : 'Auf den Merkzettel'}</button>
          ${canEdit ? `<button class="btn ghost small" type="button" data-edit="${esc(p.id)}">${ic('edit')}Bearbeiten</button>` : ''}
        </div>
        <p class="dt-desc">${esc(p.desc)}</p>
        <dl class="facts">${(p.facts || []).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      </div>
    </div>`;
  openDlg($('#dlgProduct'));
}

/* ---------- Warenkorb ---------- */
const cartLines = () => Object.entries(S.cart).map(([id, q]) => ({ p: byId(id), q })).filter(l => l.p);
/* Summen. opts: { express: bool, coupon: {code,type:'percent'|'fixed',value,minTotal} } */
function totals(opts) {
  const o = opts || {};
  const st = S.settings;
  const sub = round2(cartLines().reduce((a, l) => a + l.p.price * l.q, 0));
  let discount = 0;
  const c = o.coupon;
  if (c && sub >= (c.minTotal || 0)) discount = c.type === 'percent' ? round2(sub * c.value / 100) : Math.min(sub, c.value);
  const ship = sub ? (sub >= st.freeShipping ? 0 : st.shipping) + (o.express ? st.express : 0) : 0;
  return { sub, discount: round2(discount), ship: round2(ship), total: round2(Math.max(0, sub - discount) + ship), count: cartCount() };
}
function addToCart(id, n, el) {
  const p = byId(id);
  if (!p) return false;
  const max = stockOf(p);
  const have = S.cart[id] || 0;
  const qty = Math.min(n || 1, max - have);
  if (qty <= 0) { toast(max ? `Mehr als ${max} Stück sind nicht verfügbar.` : 'Dieser Artikel ist ausverkauft.'); return false; }
  S.cart[id] = have + qty;
  saveCart(); updateBadges(); renderCart();
  F.emit('cart:add', { id, qty, el: el || null });
  F.emit('cart:change', { count: cartCount() });
  return true;
}
function setQty(id, q) {
  const p = byId(id);
  const max = stockOf(p);
  if (q > 0 && p) S.cart[id] = Math.min(max, q); else delete S.cart[id];
  saveCart(); updateBadges(); renderCart();
  F.emit('cart:change', { count: cartCount() });
}
function clearCart() {
  S.cart = {}; saveCart(); updateBadges(); renderCart();
  F.emit('cart:change', { count: 0 });
}
function renderCart() {
  const L = cartLines();
  const list = $('#cartList'), foot = $('#cartFoot');
  if (!L.length) {
    list.innerHTML = `<div class="cart-empty">${ic('cart')}<p><b>Dein Warenkorb ist leer.</b></p><p>Stöbere in den Kategorien oder sieh dir die Angebote an.</p><button class="btn" type="button" data-close>Weiter einkaufen</button></div>`;
    foot.hidden = true;
    return;
  }
  foot.hidden = false;
  list.innerHTML = L.map(({ p, q }) => `<div class="cline" data-pid="${esc(p.id)}">
      <button class="thumb" type="button" data-open="${esc(p.id)}" style="--tint:${esc(p.tint || '#E7ECE6')}" aria-label="${esc(p.name)} ansehen">${art(p)}</button>
      <div class="cl-info">
        <p class="cl-name">${esc(p.name)}</p>
        <p class="seller">${esc(p.seller)} · ${eur.format(p.price)}</p>
        <div class="stepper" role="group" aria-label="Menge ${esc(p.name)}">
          <button type="button" data-qty="${esc(p.id)}" data-d="-1" aria-label="${q > 1 ? 'Eins weniger' : 'Entfernen'}">${ic(q > 1 ? 'minus' : 'trash')}</button>
          <output>${q}</output>
          <button type="button" data-qty="${esc(p.id)}" data-d="1" aria-label="Eins mehr"${q >= stockOf(p) ? ' disabled' : ''}>${ic('plus')}</button>
        </div>
      </div>
      <p class="cl-price">${eur.format(p.price * q)}</p>
    </div>`).join('');
  const t = totals();
  const rest = FREE() - t.sub;
  foot.innerHTML = `
    <div class="freebar">${rest > 0 ? `<span>Noch <b>${eur.format(rest)}</b> bis zum kostenlosen Versand</span>` : `<span>${ic('check')} <b>Versandkostenfrei</b></span>`}<span class="bar"><span style="width:${Math.min(100, (t.sub / FREE()) * 100)}%"></span></span></div>
    <dl class="sum">
      <div><dt>Zwischensumme</dt><dd>${eur.format(t.sub)}</dd></div>
      <div><dt>Versand</dt><dd>${t.ship ? eur.format(t.ship) : 'kostenlos'}</dd></div>
      <div class="tot"><dt>Gesamt <small>inkl. MwSt.</small></dt><dd>${eur.format(t.total)}</dd></div>
    </dl>
    <button class="btn wide" type="button" id="toCheckout">${ic('lock')}Zur Kasse</button>`;
}
function openCart() { renderCart(); openDlg($('#dlgCart')); }
function openCheckout() {
  if (!cartLines().length) return;
  if (F.checkout && F.checkout.open) { $('#dlgCart').close(); F.checkout.open(); }
  else toast('Die Kasse wird gerade geladen. Bitte versuch es gleich noch einmal.');
}

/* ---------- Katalog laden ---------- */
async function loadCatalog() {
  S.products = await F.db.products.all();
  cleanCart();
}
async function refresh() {
  await loadCatalog();
  render(); renderDecor(); updateBadges(); renderCart();
}

/* Bestellstatus: gemeinsames Vokabular für Konto, Kasse und Verwaltung */
const STATUS = {
  pending_payment: { label: 'Zahlung offen', tone: 'warn' },
  paid: { label: 'Bezahlt', tone: 'info' },
  processing: { label: 'In Bearbeitung', tone: 'info' },
  shipped: { label: 'Versendet', tone: 'brand' },
  delivered: { label: 'Zugestellt', tone: 'good' },
  cancelled: { label: 'Storniert', tone: 'muted' },
  refunded: { label: 'Erstattet', tone: 'muted' }
};
const statusPill = s => `<span class="pill tone-${(STATUS[s] || { tone: 'muted' }).tone}">${esc((STATUS[s] || { label: s }).label)}</span>`;
const PAYMENT = { card: 'Kreditkarte', paypal: 'PayPal', sepa: 'Lastschrift', invoice: 'Rechnung' };

F.shop = {
  CATS, STATUS, PAYMENT, statusPill,
  products: () => S.products.slice(),
  byId,
  stockOf,
  settings: () => S.settings,
  cart: { lines: cartLines, count: cartCount, add: addToCart, set: setQty, clear: clearCart, totals },
  openCart, openProduct, openCheckout, render, refresh, resetFilters, toShop,
  ui: { card, rating, priceHTML, stockHTML, delivery, stars, pct, art }
};

/* ---------- App-Installation ---------- */
let deferredPrompt = null;
// In der Claude-Vorschau (eingebettet) oder als lokale Datei kann sich die Seite nicht als App installieren.
const notInstallableHere = (() => {
  if (!/^https?:$/.test(location.protocol)) return true;
  try { return window.self !== window.top; } catch (e) { return true; }
})();
// Die Android-App (WebView) meldet sich mit diesem Zusatz im User-Agent.
const appMatch = navigator.userAgent.match(/FundusApp\/([\d.]+)/);
const inApp = !!appMatch;
document.documentElement.classList.toggle('in-app', inApp);
// Zurück-Taste der Android-App: zuerst das oberste offene Fenster schließen.
window.fundusBack = () => {
  const open = $$('dialog[open]');
  if (!open.length) return false;
  open[open.length - 1].close();
  return true;
};
const isStandalone = () => inApp || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function platform() {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}
F.util.env = { inApp, appVersion: appMatch ? appMatch[1] : null, isStandalone, platform, notInstallableHere };
function selectTab(name) {
  $$('#dlgInstall [role="tab"]').forEach(t => {
    const on = t.id === `tab-${name}`;
    t.setAttribute('aria-selected', on);
    t.tabIndex = on ? 0 : -1;
    $('#' + t.getAttribute('aria-controls')).hidden = !on;
  });
}
function updateInstallUI() {
  const sa = isStandalone();
  $('#appBtn').hidden = sa;
  $('#apkBand').hidden = sa || platform() !== 'android';
  $('#pwaBtn').hidden = !deferredPrompt;
  $('#pwaSteps').hidden = !!deferredPrompt;
  $('#installState').innerHTML = sa
    ? `${ic('check')}Du nutzt Fundus gerade als App.`
    : deferredPrompt ? `${ic('check')}Bereit zur Installation auf diesem Gerät.`
    : notInstallableHere ? 'Zum Installieren den Shop im Browser öffnen.' : '';
}
async function promptInstall() {
  const ev = deferredPrompt;
  if (!ev) return;
  deferredPrompt = null;
  ev.prompt();
  try { const r = await ev.userChoice; if (r.outcome === 'accepted') toast('Fundus wird installiert.'); } catch (e) { /* abgebrochen */ }
  updateInstallUI();
}
function install() {
  if (isStandalone()) { toast('Du nutzt Fundus bereits als App. Updates kommen automatisch.'); return; }
  const pf = platform();
  // Auf Android zuerst den APK-Download zeigen, sonst direkt Chromes Installationsdialog
  if (deferredPrompt && pf !== 'android') { promptInstall(); return; }
  const away = notInstallableHere && pf !== 'android';
  $('#inAway').hidden = !away;
  $('#inThen').hidden = !away;
  selectTab(pf);
  updateInstallUI();
  closeAll();
  openDlg($('#dlgInstall'));
}

/* ---------- Automatische Updates ----------
 * Website und App laden die Seite immer zuerst aus dem Netz (Service Worker „network first“).
 * Neue Funktionen kommen dadurch ohne Neuinstallation an. Läuft die Seite lange offen,
 * meldet sie eine neue Version und lädt auf Wunsch neu. Braucht die Android-Hülle selbst
 * einmal ein Update, zeigt app.json das an.
 */
function registerServiceWorker() {
  try {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'activated' && navigator.serviceWorker.controller) {
            toast('Eine neue Version von Fundus ist da.', { label: 'Neu laden', run: () => location.reload() }, { duration: 15000 });
          }
        });
      });
      const check = () => reg.update().catch(() => { /* offline */ });
      setInterval(check, 20 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    }).catch(() => { /* ohne Offline-Modus weiter */ });
  } catch (e) { /* Umgebung ohne Service Worker */ }
}
const versionNewer = (a, b) => {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
};
async function checkAppShellUpdate() {
  if (!inApp || notInstallableHere) return;
  try {
    const r = await fetch('app.json', { cache: 'no-store' });
    const info = (await r.json()).android || {};
    if (info.versionName && versionNewer(info.versionName, F.util.env.appVersion)) {
      toast(`App-Update ${esc(info.versionName)} verfügbar.`, { label: 'Laden', run: () => { location.href = info.url; } }, { duration: 20000 });
    }
  } catch (e) { /* offline */ }
}

/* ---------- Klicks ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button, a');
  if (!t || t.disabled) return;
  const ds = t.dataset;
  if ('close' in ds) { t.closest('dialog')?.close(); return; }
  if (ds.open) { openProduct(ds.open); return; }
  if (ds.add) {
    const n = ds.from === 'detail' ? dtQty : 1;
    const p = byId(ds.add);
    const src = ds.from === 'detail' ? $('#dlgProduct .dt .pic') : t.closest('.card')?.querySelector('.pic') || t;
    if (!addToCart(ds.add, n, src)) return;
    if (ds.from === 'detail') $('#dlgProduct').close();
    toast(`${n > 1 ? n + ' × ' : ''}${esc(p.name.split(',')[0])} liegt im Warenkorb.`, { label: 'Ansehen', run: openCart });
    return;
  }
  if (ds.buy) {
    const have = S.cart[ds.buy] || 0;
    if (!have && !addToCart(ds.buy, dtQty)) return;
    $('#dlgProduct').close(); openCheckout();
    return;
  }
  if (ds.dq) {
    const p = $('#dlgProduct .dt') && byId($('#dlgProduct [data-add]')?.dataset.add);
    const max = p ? Math.max(1, stockOf(p) - (S.cart[p.id] || 0)) : 99;
    dtQty = Math.max(1, Math.min(max, dtQty + Number(ds.dq)));
    $('#dtQty').textContent = dtQty;
    return;
  }
  if (ds.fav) {
    const id = ds.fav;
    const on = !S.favs.has(id);
    on ? S.favs.add(id) : S.favs.delete(id);
    saveFavs(); updateBadges();
    $$(`[data-fav="${CSS.escape(id)}"]`).forEach(b => {
      b.setAttribute('aria-pressed', on);
      if (b.classList.contains('fav')) b.setAttribute('aria-label', on ? 'Vom Merkzettel entfernen' : 'Auf den Merkzettel');
      else b.textContent = on ? 'Auf dem Merkzettel ✓' : 'Auf den Merkzettel';
    });
    F.emit('fav:toggle', { id, on, el: t });
    if (S.favsOnly) render();
    return;
  }
  if (ds.qty) {
    const id = ds.qty;
    setQty(id, (S.cart[id] || 0) + Number(ds.d));
    return;
  }
  if (ds.cat) { S.cat = ds.cat; S.favsOnly = false; render(); return; }
  if (ds.catlink) { resetFilters(); S.cat = ds.catlink; render(); toShop(); return; }
  if (ds.tog) { S[ds.tog] = !S[ds.tog]; render(); return; }
  if (ds.go) {
    resetFilters();
    if (ds.go === 'hand') S.hand = true;
    if (ds.go === 'deals') S.deals = true;
    if (ds.go === 'favs') S.favsOnly = true;
    render(); toShop();
    return;
  }
  if (ds.seller) { resetFilters(); S.q = ds.seller; closeAll(); render(); toShop(); return; }
  if ('install' in ds) { install(); return; }
  if ('sell' in ds) {
    if (F.admin && F.admin.open) { closeAll(); F.admin.open('new-product'); }
    return;
  }
  if (ds.edit) {
    if (F.admin && F.admin.open) { closeAll(); F.admin.open('edit-product', ds.edit); }
    return;
  }
  if (t.id === 'toCheckout') { openCheckout(); return; }
  if (t.id === 'cartBtn') { openCart(); return; }
  if (t.id === 'favBtn') { resetFilters(); S.favsOnly = true; render(); toShop(); return; }
  if (t.id === 'resetBtn') { resetFilters(); render(); return; }
  if (t.id === 'accountBtn') { if (F.auth && F.auth.openAccount) F.auth.openAccount(); return; }
  if (t.id === 'adminBtn') { if (F.admin && F.admin.open) F.admin.open('dashboard'); return; }
});

/* ---------- Start ---------- */
async function start() {
  $$('i[data-ic]').forEach(i => { i.outerHTML = ic(i.dataset.ic); });
  $$('dialog').forEach(wireDialog);
  const catOpts = Object.entries(CATS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
  $('#searchCat').innerHTML = `<option value="alle">Alle Kategorien</option>${catOpts}`;
  $('#footCats').innerHTML = Object.entries(CATS).slice(0, 5).map(([k, l]) => `<li><button class="linkbtn" type="button" data-catlink="${k}">${l}</button></li>`).join('');

  const header = $('#top');
  const setHH = () => document.documentElement.style.setProperty('--hh', header.offsetHeight + 'px');
  setHH();
  if ('ResizeObserver' in window) new ResizeObserver(setHH).observe(header);

  await F.db.ready;
  S.settings = await F.db.settings.get();
  await loadCatalog();

  // Module starten (Reihenfolge: Effekte, Konto, Kasse, Verwaltung)
  for (const name of ['fx', 'auth', 'checkout', 'admin']) {
    const m = F[name];
    if (m && typeof m.init === 'function') {
      try { await m.init(); } catch (err) { console.error(`Modul ${name}:`, err); }
    }
  }
  $$('dialog').forEach(wireDialog);

  render(); renderDecor(); updateBadges(); renderCart(); updateAccountUI(); updateInstallUI();
  if (F.db.volatile) toast('Dieser Browser erlaubt kein Speichern. Änderungen gehen beim Schließen verloren.', null, { duration: 8000 });

  F.on('products:change', async () => { await loadCatalog(); render(); renderDecor(); updateBadges(); renderCart(); });
  F.on('settings:change', async () => { S.settings = await F.db.settings.get(); render(); renderCart(); });
  F.on('session', () => { updateAccountUI(); render(); });

  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; updateInstallUI(); });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; closeAll(); toast('Fertig! Fundus liegt jetzt auf deinem Startbildschirm.'); updateInstallUI(); });
  $('#dlgInstall .tabs').addEventListener('click', e => { const t = e.target.closest('[role="tab"]'); if (t) selectTab(t.id.replace('tab-', '')); });
  $('#dlgInstall .tabs').addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const tabs = $$('#dlgInstall [role="tab"]');
    const i = tabs.findIndex(t => t.getAttribute('aria-selected') === 'true');
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    selectTab(next.id.replace('tab-', '')); next.focus();
  });
  $('#pwaBtn').addEventListener('click', () => { $('#dlgInstall').close(); promptInstall(); });

  let searchTimer;
  $('#q').addEventListener('input', e => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { S.q = e.target.value; S.favsOnly = false; render(); }, 150); });
  $('#searchForm').addEventListener('submit', e => { e.preventDefault(); S.q = $('#q').value; S.favsOnly = false; render(); $('#q').blur(); toShop(); });
  $('#searchCat').addEventListener('change', e => { S.cat = e.target.value; render(); });
  $('#sort').addEventListener('change', e => { S.sort = e.target.value; render(); });

  registerServiceWorker();
  checkAppShellUpdate();
  document.documentElement.classList.add('ready');
  F.emit('ready', {});
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
})();
