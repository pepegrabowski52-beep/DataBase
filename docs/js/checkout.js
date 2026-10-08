/* Fundus – Kasse und Zahlung im Testmodus.
 *
 * Fundus.checkout = { init(), open() }
 * Vier Schritte: Adresse, Versand, Zahlung, Prüfen. Danach wird die Bestellung gespeichert,
 * der Bestand abgezogen, der Warenkorb geleert und 'order:placed' { order } gesendet.
 *
 * Testmodus: Es fließt kein Geld. Es funktionieren nur die Testkarten, die Test-IBAN,
 * das PayPal-Testkonto und Rechnung. Kartennummer, Prüfnummer und IBAN stehen nur in den
 * Eingabefeldern, nie im Zustand, in der Bestellung oder im Speicher. Die Bestellung behält
 * nur Marke und die letzten 4 Ziffern. Nach dem Bezahlen und beim Schließen werden die Felder geleert.
 */
(() => {
'use strict';
const F = window.Fundus = window.Fundus || {};

/* ---------- Testdaten ---------- */
const TEST_CARDS = [
  { no: '4242424242424242', brand: 'Visa', result: 'ok', note: 'Zahlung klappt' },
  { no: '5555555555554444', brand: 'Mastercard', result: 'ok', note: 'Zahlung klappt' },
  { no: '4000002760003184', brand: 'Visa', result: '3ds', note: 'Bank fragt nach (3-D Secure)' },
  { no: '4000000000000002', brand: 'Visa', result: 'declined', note: 'Wird abgelehnt' },
  { no: '4000000000009995', brand: 'Visa', result: 'funds', note: 'Abgelehnt: Konto nicht gedeckt' }
];
const TEST_IBAN = 'DE89370400440532013000';
const PAYEE = 'Fundus Demo';
const INVOICE_MAX = 500;
const INVOICE_DAYS = 14;
const AMEX = 'American Express';
const STEPS = ['Adresse', 'Versand', 'Zahlung', 'Prüfen'];
const HEADS = ['Wohin dürfen wir liefern?', 'Wie schnell soll es gehen?', 'Wie möchtest du bezahlen?', 'Alles richtig?'];
const NEXT = ['Weiter zum Versand', 'Weiter zur Zahlung', 'Weiter zur Prüfung', 'Zahlungspflichtig bestellen (Test)'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ---------- Zustand (nur im Arbeitsspeicher, ohne Zahlungsdaten) ---------- */
const blankAddr = () => ({ owner: null, choice: 'new', name: '', email: '', street: '', zip: '', city: '', save: true });
const st = {
  step: 1, dir: 0,
  maxStep: 1,      // weitester erreichter Schritt (Sprung über die Schrittanzeige)
  addr: blankAddr(),
  ship: 'std',
  coupon: null, couponInput: '', couponMsg: '',
  pay: 'card',
  payInfo: null,   // { brand, last4 } nach der Prüfung in Schritt 3
  payErr: '',      // Meldung nach abgelehnter oder abgebrochener Zahlung
  agb: false,
  notice: '',      // HTML-Hinweis, z. B. wenn sich der Bestand geändert hat
  busy: false,
  order: null,     // abgeschlossene Bestellung (Erfolgsansicht)
  itemsOpen: null,
  lastTotal: null,
  snap: []         // Warenkorb beim letzten Zeichnen, um stille Änderungen zu erklären
};

/* ---------- Kurzformen ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => F.util.esc(s);
const eur = n => F.util.eur.format(n);
const ic = n => F.ic(n);
const toast = (msg, action, opts) => F.util.toast(msg, action, opts);
const reduced = () => F.util.reduced();
const wait = ms => new Promise(r => setTimeout(r, reduced() ? Math.min(ms, 150) : ms));
const digits = v => String(v || '').replace(/\D/g, '');
const pad2 = n => String(n).padStart(2, '0');
const isoDay = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const short = name => String(name || '').split(',')[0];
const safeTint = t => (/^#[0-9a-f]{3,8}$/i.test(String(t || '')) ? t : 'var(--surface-2)');
const dlg = () => $('#dlgCheckout');
const lines = () => F.shop.cart.lines();
const totals = () => F.shop.cart.totals({ express: st.ship === 'exp', coupon: st.coupon });
const auth = () => (F.auth && typeof F.auth.current === 'function' ? F.auth : null);
function me() {
  const a = auth();
  try { return a ? a.current() : null; } catch (e) { return null; }
}
function rand() {
  try { return [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join(''); }
  catch (e) { return Math.random().toString(36).slice(2, 14); }
}

/* ---------- Karten, IBAN, Ablaufdatum ---------- */
function brandOf(d) {
  if (/^3[47]/.test(d)) return AMEX;
  if (/^5[1-5]/.test(d)) return 'Mastercard';
  const p4 = +d.slice(0, 4);
  if (d.length >= 4 && p4 >= 2221 && p4 <= 2720) return 'Mastercard';
  if (/^4/.test(d)) return 'Visa';
  return '';
}
const cardLen = b => (b === AMEX ? 15 : b ? 16 : 19);
function fmtCard(d) {
  if (brandOf(d) === AMEX) return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(' ');
  return (d.match(/.{1,4}/g) || []).join(' ');
}
const cardFormat = raw => fmtCard(raw.slice(0, cardLen(brandOf(raw))));
function luhn(d) {
  let sum = 0, dbl = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = +d[i];
    if (dbl) { n *= 2; if (n > 9) n -= 9; }
    sum += n; dbl = !dbl;
  }
  return d.length > 0 && sum % 10 === 0;
}
const ibanClean = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 34);
const fmtIban = v => (v.match(/.{1,4}/g) || []).join(' ');
// Prüfziffer nach ISO 13616 (mod 97)
function ibanOk(iban) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const s = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  let m = 0;
  for (const ch of s) m = (m * 10 + +ch) % 97;
  return m === 1;
}
function fmtExp(d) {
  if (/^[2-9]/.test(d)) d = '0' + d;
  d = d.slice(0, 4);
  return d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d;
}
function expProblem(v) {
  const m = /^(\d{2})\/(\d{2})$/.exec(v);
  if (!v) return 'Gib das Ablaufdatum ein, z. B. 12/30.';
  if (!m) return 'Gib das Ablaufdatum als MM/JJ ein, z. B. 12/30.';
  const mm = +m[1], yy = 2000 + +m[2];
  if (mm < 1 || mm > 12) return 'Der Monat muss zwischen 01 und 12 liegen.';
  const now = new Date();
  if (yy < now.getFullYear() || (yy === now.getFullYear() && mm < now.getMonth() + 1)) return 'Die Karte ist abgelaufen. Nimm ein Datum in der Zukunft, z. B. 12/30.';
  return '';
}
// Eingabe neu formatieren und den Cursor hinter derselben Zahl von Zeichen halten
function reformat(inp, clean, format) {
  const v = inp.value;
  const pos = inp.selectionStart == null ? v.length : inp.selectionStart;
  const keep = clean(v.slice(0, pos)).length;
  const out = format(clean(v));
  if (out === v) return;
  inp.value = out;
  if (pos >= v.length || document.activeElement !== inp) return;
  let i = 0, n = 0;
  while (i < out.length && n < keep) { if (clean(out[i])) n++; i++; }
  try { inp.setSelectionRange(i, i); } catch (e) { /* Feldtyp ohne Cursor */ }
}

/* ---------- Gutscheine ---------- */
function findCoupon(code) {
  const c = String(code || '').trim().toLowerCase();
  const list = (F.shop.settings() || {}).coupons || [];
  return c ? list.find(x => String(x.code || '').toLowerCase() === c) || null : null;
}
function couponProblem(c, sub) {
  if (!c) return 'Diesen Gutschein kennen wir nicht. Prüf die Schreibweise.';
  if (!c.active || !(+c.value > 0)) return 'Dieser Gutschein ist nicht mehr gültig.';
  const min = +c.minTotal || 0;
  if (sub < min) return `Dieser Gutschein gilt ab ${eur(min)} Warenwert. Dir fehlen noch ${eur(min - sub)}.`;
  return '';
}
const couponLabel = c => (c.type === 'percent' ? `${esc(c.value)} % Rabatt` : `${eur(+c.value)} Rabatt`);
// Eingelösten Gutschein mit den aktuellen Einstellungen abgleichen
function checkCoupon() {
  if (!st.coupon) return;
  const code = st.coupon.code;
  const c = findCoupon(code);
  const msg = couponProblem(c, totals().sub);
  if (msg) { st.coupon = null; st.couponMsg = `Der Gutschein ${code} wurde entfernt. ${msg}`; }
  else st.coupon = Object.assign({}, c);
}
function applyCoupon(code) {
  const v = String(code || '').trim();
  const inp = $('#coCoupon');
  if (!v) { setErr('coCoupon', 'Gib einen Gutscheincode ein.'); if (inp) { inp.focus(); shake(inp); } return false; }
  const c = findCoupon(v);
  const msg = couponProblem(c, totals().sub);
  if (msg) { setErr('coCoupon', msg); if (inp) { inp.focus(); shake(inp); } return false; }
  st.coupon = Object.assign({}, c);
  st.couponInput = '';
  st.couponMsg = '';
  keepFocus(renderShip);
  renderSum(); renderFoot();
  announce(`Gutschein ${c.code} eingelöst.`);
  return true;
}

/* ---------- Adresse und Sitzung ---------- */
function savedList() {
  const u = me();
  return u && Array.isArray(u.addresses) ? u.addresses.filter(x => x && x.id) : [];
}
const savedAddr = () => savedList().find(x => x.id === st.addr.choice) || null;
// Nach An- oder Abmeldung: Daten eines anderen Kontos nicht stehen lassen, leere Felder vorausfüllen
function onSession() {
  const u = me();
  const id = u ? u.id : null;
  if (st.addr.owner && st.addr.owner !== id) st.addr = blankAddr();
  st.addr.owner = id;
  const a = st.addr;
  if (u) {
    if (!a.name) a.name = u.name || '';
    if (!a.email) a.email = u.email || '';
  }
  const list = savedList();
  if (a.choice !== 'new' && !list.some(x => x.id === a.choice)) a.choice = 'new';
  if (a.choice === 'new' && list.length && !a.street && !a.zip && !a.city) a.choice = list[0].id;
}
function addressNow() {
  const a = st.addr;
  const s = a.choice !== 'new' ? savedAddr() : null;
  const name = a.name.trim();
  return {
    name,
    email: a.email.trim().toLowerCase(),
    address: s
      ? { name: String(s.name || name).trim(), street: String(s.street || '').trim(), zip: String(s.zip || '').trim(), city: String(s.city || '').trim() }
      : { name, street: a.street.trim(), zip: a.zip.trim(), city: a.city.trim() }
  };
}
// Neue Adresse auf Wunsch im Konto speichern (ohne Doppelte)
async function saveAddress(addr) {
  const a = auth(), u = me();
  if (!a || !u || typeof a.update !== 'function' || st.addr.choice !== 'new' || !st.addr.save) return;
  const list = savedList().slice();
  const key = x => [x.name, x.street, x.zip, x.city].map(v => String(v || '').trim().toLowerCase()).join('|');
  if (list.some(x => key(x) === key(addr))) return;
  const rec = Object.assign({ id: F.util.uid('a') }, addr);
  try {
    await a.update({ addresses: list.concat(rec) });
    st.addr.choice = rec.id;
  } catch (e) {
    const why = e && e.message ? ' ' + esc(e.message) : '';
    toast(`Die Adresse ließ sich nicht im Konto speichern.${why} Deine Bestellung ist trotzdem eingegangen.`, null, { type: 'err', duration: 8000 });
  }
}

/* ---------- Prüfung je Schritt ---------- */
function stepErrors(n) {
  const e = [];
  const val = id => { const el = $('#' + id); return el ? el.value.trim() : ''; };
  if (n === 1) {
    const a = st.addr;
    if (a.name.trim().length < 2) e.push(['coName', 'Gib deinen Vor- und Nachnamen ein.']);
    if (!a.email.trim()) e.push(['coEmail', 'Gib deine E-Mail-Adresse ein.']);
    else if (!EMAIL.test(a.email.trim())) e.push(['coEmail', 'Die E-Mail-Adresse ist unvollständig. Beispiel: name@beispiel.de']);
    if (a.choice === 'new') {
      if (!a.street.trim()) e.push(['coStreet', 'Gib Straße und Hausnummer ein.']);
      else if (!/\d/.test(a.street)) e.push(['coStreet', 'Gib auch die Hausnummer an, z. B. Lindenstraße 12.']);
      if (!/^\d{5}$/.test(a.zip.trim())) e.push(['coZip', 'Die PLZ hat 5 Ziffern, z. B. 04109.']);
      if (!a.city.trim()) e.push(['coCity', 'Gib den Ort ein.']);
    } else {
      const s = savedAddr();
      if (!s || !String(s.street || '').trim() || !/^\d{5}$/.test(String(s.zip || '').trim()) || !String(s.city || '').trim()) {
        e.push(['coAddrNew', 'Diese gespeicherte Adresse ist unvollständig. Wähle „Neue Adresse“ und gib sie neu ein.']);
      }
    }
  }
  if (n === 3) {
    if (st.pay === 'card') {
      const d = digits(val('coCardNo'));
      const b = brandOf(d);
      if (!d) e.push(['coCardNo', 'Gib die Kartennummer ein.']);
      else if (b && d.length < cardLen(b)) e.push(['coCardNo', `Die Kartennummer ist unvollständig. ${b} hat ${cardLen(b)} Ziffern.`]);
      else if (!b && d.length < 12) e.push(['coCardNo', 'Die Kartennummer ist unvollständig. Prüf die Ziffern.']);
      else if (!luhn(d)) e.push(['coCardNo', 'Die Kartennummer stimmt nicht. Prüf die Ziffern.']);
      else if (!TEST_CARDS.some(c => c.no === d)) e.push(['coCardNo', 'Im Testmodus funktionieren nur Testkarten. Nimm eine Nummer aus der Liste oben.']);
      const ep = expProblem(val('coCardExp'));
      if (ep) e.push(['coCardExp', ep]);
      const need = b === AMEX ? 4 : 3;
      if (!new RegExp(`^\\d{${need}}$`).test(val('coCardCvc'))) e.push(['coCardCvc', `Die Prüfnummer hat ${need} Ziffern. Du findest sie auf der Kartenrückseite.`]);
      if (val('coCardName').length < 2) e.push(['coCardName', 'Gib den Namen ein, der auf der Karte steht.']);
    } else if (st.pay === 'sepa') {
      const iban = ibanClean(val('coIban'));
      if (!iban) e.push(['coIban', 'Gib deine IBAN ein.']);
      else if ((iban.startsWith('DE') && iban.length !== 22) || iban.length < 15) e.push(['coIban', 'Die IBAN ist unvollständig. Eine deutsche IBAN hat 22 Stellen.']);
      else if (!ibanOk(iban)) e.push(['coIban', 'Die IBAN stimmt nicht. Prüf die Ziffern.']);
      else if (iban !== TEST_IBAN) e.push(['coIban', 'Im Testmodus funktioniert nur die Test-IBAN. Nimm die IBAN aus der Liste oben.']);
      if (val('coIbanName').length < 2) e.push(['coIbanName', 'Gib den Namen des Kontoinhabers ein.']);
      if (!$('#coMandate').checked) e.push(['coMandate', 'Bestätige das SEPA-Lastschriftmandat.']);
    } else if (st.pay === 'invoice' && totals().total > INVOICE_MAX) {
      e.push(['coPayInv', `Rechnung geht nur bis ${eur(INVOICE_MAX)} Bestellwert. Wähle eine andere Zahlungsart.`]);
    }
  }
  if (n === 4 && !st.agb) e.push(['coAgb', 'Bestätige, dass du die AGB und die Widerrufsbelehrung gelesen hast.']);
  return e;
}
function setErr(id, msg) {
  const el = $('#' + id), p = $('#' + id + 'Err');
  if (p) { p.textContent = msg || ''; p.hidden = !msg; }
  if (el) { if (msg) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid'); }
}
function shake(el) {
  if (reduced() || !el) return;
  el.classList.remove('co-shake'); void el.offsetWidth; el.classList.add('co-shake');
  el.addEventListener('animationend', () => el.classList.remove('co-shake'), { once: true });
}
// Fehler anzeigen und das erste ungültige Feld fokussieren
function showErrors(list) {
  $$('#coForm .co-err').forEach(p => { p.hidden = true; p.textContent = ''; });
  $$('#coForm [aria-invalid="true"]').forEach(x => x.removeAttribute('aria-invalid'));
  list.forEach(([id, msg]) => setErr(id, msg));
  if (!list.length) return;
  const el = $('#' + list[0][0]);
  if (el) {
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    shake(el.closest('.opt, .co-checkrow') || el);
  }
}
const secretsOk = () => (st.pay === 'card' ? !!digits($('#coCardNo').value) && !!st.payInfo
  : st.pay === 'sepa' ? !!ibanClean($('#coIban').value) && !!st.payInfo : true);
function capturePayInfo() {
  if (st.pay === 'card') { const d = digits($('#coCardNo').value); st.payInfo = { brand: brandOf(d), last4: d.slice(-4) }; }
  else if (st.pay === 'sepa') st.payInfo = { brand: null, last4: ibanClean($('#coIban').value).slice(-4) };
  else st.payInfo = null;
}
// Kartennummer, Prüfnummer und IBAN aus den Feldern löschen; all: auch die übrigen Zahlungsfelder
function clearPayment(all) {
  ['coCardNo', 'coCardCvc', 'coIban'].concat(all ? ['coCardExp', 'coCardName', 'coIbanName'] : []).forEach(id => {
    const el = $('#' + id);
    if (el) { el.value = ''; el.removeAttribute('aria-invalid'); }
  });
  if (all && $('#coMandate')) $('#coMandate').checked = false;
  if ($('#coBrand')) $('#coBrand').textContent = '';
  st.payInfo = null;
}

/* ---------- Bausteine ---------- */
function keepFocus(fn) {
  const id = document.activeElement && document.activeElement.id;
  fn();
  if (id && (!document.activeElement || document.activeElement.id !== id)) {
    const el = document.getElementById(id);
    if (el) el.focus({ preventScroll: true });
  }
}
function announce(text) {
  const live = $('#coLive');
  if (!live) return;
  live.textContent = '';
  setTimeout(() => { live.textContent = text; }, 30);
}
const field = (id, label, f, attrs, value) => `<div class="field"><label for="${id}">${label}</label><input class="inp" id="${id}" data-f="${f}" value="${esc(value)}" aria-describedby="${id}Err" ${attrs}><p class="hint err co-err" id="${id}Err" hidden></p></div>`;
const thumb = p => `<span class="co-thumb" style="--tint:${safeTint(p.tint)}">${F.shop.ui.art(p)}</span>`;
const lineHTML = (p, q, price) => `<li class="co-line">${thumb(p)}<span class="co-lname"><span>${esc(p.name)}</span><small>${q} × ${eur(price)}</small></span><b>${eur(price * q)}</b></li>`;
function sumHTML(t, code) {
  return `<dl class="sum">
    <div><dt>Zwischensumme</dt><dd>${eur(t.sub)}</dd></div>
    ${t.discount ? `<div class="co-disc"><dt>Gutschein ${esc(code || '')}</dt><dd>−${eur(t.discount)}</dd></div>` : ''}
    <div><dt>Versand${t.exp ? ' (Express)' : ''}</dt><dd>${t.ship ? eur(t.ship) : 'kostenlos'}</dd></div>
    <div class="tot"><dt>Gesamt <small>inkl. MwSt.</small></dt><dd>${eur(t.total)}</dd></div>
  </dl>`;
}
function payText(method, info) {
  const i = info || {};
  if (method === 'card') return `${esc(i.brand || 'Karte')} •••• ${esc(i.last4 || '')}`;
  if (method === 'sepa') return `Lastschrift (SEPA) •••• ${esc(i.last4 || '')}`;
  if (method === 'paypal') return 'PayPal (Testkonto)';
  return 'Rechnung';
}
const copyBtn = (value, shown, fill) => `<button class="co-copy" type="button" data-co-copy="${esc(value)}"${fill ? ` data-co-fill="${fill}"` : ''} aria-label="${esc(shown)} kopieren">${ic('copy')}<span>Kopieren</span></button>`;
const testRow = (shown, note, value, fill) => `<li><div><code>${esc(shown)}</code><small>${esc(note)}</small></div>${copyBtn(value, shown, fill)}</li>`;
function testData(m) {
  if (m === 'card') {
    return `<ul class="co-tests">${TEST_CARDS.map(c => testRow(fmtCard(c.no), `${c.brand} · ${c.note}`, c.no, 'coCardNo')).join('')}</ul>
      <p class="hint">Gültig bis: ein Datum in der Zukunft, z. B. 12/30. Prüfnummer: drei beliebige Ziffern, z. B. 123.</p>`;
  }
  if (m === 'sepa') return `<ul class="co-tests">${testRow(fmtIban(TEST_IBAN), 'Test-IBAN · Lastschrift klappt', TEST_IBAN, 'coIban')}</ul><p class="hint">Kontoinhaber: ein beliebiger Name.</p>`;
  if (m === 'paypal') return '<p class="hint">Keine Testdaten nötig. Nach dem Bestellen gibst du die Zahlung im Testkonto frei oder brichst ab.</p>';
  return `<p class="hint">Keine Testdaten nötig. Rechnung geht bis ${eur(INVOICE_MAX)} Bestellwert.</p>`;
}

/* ---------- Darstellung ---------- */
function render() {
  const empty = !st.order && !lines().length;
  $('#coForm').hidden = !!st.order || empty;
  $('#coDone').hidden = !st.order;
  $('#coEmpty').hidden = !empty;
  $('#coFoot').hidden = !!st.order || empty;
  $('#coProgW').hidden = empty;
  renderProg();
  if (st.order) { renderDone(); return; }
  if (empty) { renderEmpty(); snapshot(); return; }
  checkCoupon();
  for (let i = 1; i <= 4; i++) $('#coStep' + i).hidden = i !== st.step;
  [renderAddr, renderShip, renderPay, renderReview][st.step - 1]();
  renderNotice();
  renderSum();
  renderFoot();
  snapshot();
}
// Nur Summen und abhängige Teile auffrischen (Warenkorb, Einstellungen, Produkte geändert)
function refresh() {
  const d = dlg();
  if (!d || !d.open || st.busy || st.order) return;
  // Der Kern kürzt den Warenkorb still, wenn der Bestand sinkt: hier sagen, was passiert ist
  const drops = cartDrops();
  if (drops.length) st.notice = stockNotice(drops, false);
  if (!lines().length) { render(); return; }
  checkCoupon();
  if (st.step === 2) keepFocus(renderShip);
  if (st.step === 3) renderPay();
  if (st.step === 4) keepFocus(renderReview);
  renderNotice(); renderSum(); renderFoot();
  snapshot();
}
const snapshot = () => { st.snap = lines().map(({ p, q }) => ({ id: p.id, name: p.name, q })); };
function cartDrops() {
  const now = new Map(lines().map(({ p, q }) => [p.id, q]));
  return st.snap.filter(x => (now.get(x.id) || 0) < x.q).map(x => ({ id: x.id, name: x.name, max: now.get(x.id) || 0 }));
}
function stockNotice(changes, placing) {
  const items = changes.map(c => (c.max
    ? `<li>„${esc(short(c.name))}“: nur noch ${c.max} verfügbar. Wir haben die Menge angepasst.</li>`
    : `<li>„${esc(short(c.name))}“ ist ausverkauft und wurde entfernt.</li>`)).join('');
  return `<p><b>Der Bestand hat sich gerade geändert.</b></p><ul>${items}</ul><p>${placing
    ? 'Prüf die Bestellung und bestell dann noch einmal. Es wurde nichts berechnet.'
    : 'Prüf die Summe, bevor du weitermachst.'}</p>`;
}
function renderNotice() {
  $('#coNoticeBox').innerHTML = st.notice ? `<div class="co-alert" id="coNotice" role="alert" tabindex="-1">${ic('alert')}<div>${st.notice}</div></div>` : '';
}
function renderProg() {
  const cur = st.order ? 5 : st.step;
  $('#coProgW').style.setProperty('--p', Math.min(1, (cur - 1) / 3));
  $$('#coProg li').forEach((li, i) => {
    const n = i + 1;
    const state = n < cur ? 'done' : n === cur ? 'cur' : 'todo';
    const b = li.querySelector('button');
    li.dataset.state = state;
    b.disabled = state === 'cur' || n > st.maxStep || !!st.order || st.busy;
    if (state === 'cur') b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    b.setAttribute('aria-label', `Schritt ${n}: ${STEPS[i]}${state === 'done' ? ', erledigt' : ''}`);
    b.querySelector('.co-dot').innerHTML = state === 'done' ? ic('check') : String(n);
  });
}
function renderAddr() {
  const u = me();
  const a = st.addr;
  const au = auth();
  const list = savedList();
  const fresh = a.choice === 'new' || !list.length;
  const loginBox = u
    ? `<p class="co-who">${ic('user')}<span>Angemeldet als <b>${esc(u.name || u.email)}</b></span></p>`
    : au && typeof au.requireLogin === 'function'
      ? `<div class="co-login"><div><p><b>Schon ein Konto?</b></p><p class="hint">Melde dich an, dann sind Name und Adresse schon ausgefüllt. Oder bestell einfach als Gast.</p></div><button class="btn ghost" type="button" data-co="login">${ic('user')}Anmelden</button></div>`
      : '';
  $('#coStep1').innerHTML = `
    <h3 class="co-h" id="coH1" tabindex="-1">${HEADS[0]}</h3>
    ${loginBox}
    <fieldset>
      <legend>Kontakt</legend>
      <div class="co-pair">
        ${field('coName', 'Vor- und Nachname', 'name', 'autocomplete="name" autocapitalize="words" placeholder="z. B. Lena Hoffmann"', a.name)}
        ${field('coEmail', 'E-Mail-Adresse', 'email', 'type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="name@beispiel.de"', a.email)}
      </div>
    </fieldset>
    <fieldset>
      <legend>Lieferadresse</legend>
      ${list.length ? `<div class="opts">
        ${list.map((x, i) => `<label class="opt" for="coAddr${i}"><input type="radio" name="coAddr" id="coAddr${i}" value="${esc(x.id)}"${a.choice === x.id ? ' checked' : ''}><span>${esc(x.name || a.name || 'Gespeicherte Adresse')}<small>${esc(x.street)}, ${esc(x.zip)} ${esc(x.city)}</small></span></label>`).join('')}
        <label class="opt" for="coAddrNew"><input type="radio" name="coAddr" id="coAddrNew" value="new"${fresh ? ' checked' : ''} aria-describedby="coAddrNewErr"><span>Neue Adresse<small>An eine andere Adresse liefern</small></span>${ic('plus')}</label>
      </div>
      <p class="hint err co-err" id="coAddrNewErr" hidden></p>` : ''}
      ${fresh ? `<div class="co-newaddr${list.length ? ' co-drop' : ''}">
        ${field('coStreet', 'Straße und Hausnummer', 'street', 'autocomplete="street-address" placeholder="z. B. Lindenstraße 12"', a.street)}
        <div class="two">
          ${field('coZip', 'PLZ', 'zip', 'inputmode="numeric" autocomplete="postal-code" placeholder="04109"', a.zip)}
          ${field('coCity', 'Ort', 'city', 'autocomplete="address-level2" placeholder="Leipzig"', a.city)}
        </div>
        ${u ? `<label class="co-checkrow" for="coSaveAddr"><input type="checkbox" id="coSaveAddr"${a.save ? ' checked' : ''}><span>Adresse in meinem Konto speichern</span></label>` : ''}
      </div>` : ''}
    </fieldset>`;
}
function renderShip() {
  const s = F.shop.settings();
  const t = totals();
  const free = t.sub >= s.freeShipping;
  const c = st.coupon;
  $('#coStep2').innerHTML = `
    <h3 class="co-h" id="coH2" tabindex="-1">${HEADS[1]}</h3>
    <fieldset>
      <legend>Versandart</legend>
      <div class="opts">
        <label class="opt" for="coShipStd"><input type="radio" name="coShip" id="coShipStd" value="std"${st.ship === 'std' ? ' checked' : ''}><span>Standard<small>Lieferung ${esc(F.util.stdRange())}</small></span><b>${free ? 'kostenlos' : eur(s.shipping)}</b></label>
        <label class="opt" for="coShipExp"><input type="radio" name="coShip" id="coShipExp" value="exp"${st.ship === 'exp' ? ' checked' : ''}><span>Express<small>Lieferung ${esc(F.util.fastDate())}</small></span><b>+ ${eur(s.express)}</b></label>
      </div>
      ${free ? `<p class="hint">${ic('check')} Standardversand ist ab ${eur(s.freeShipping)} kostenlos.</p>` : `<p class="hint">Noch ${eur(s.freeShipping - t.sub)} bis zum kostenlosen Standardversand.</p>`}
    </fieldset>
    <fieldset>
      <legend>Gutschein</legend>
      ${st.couponMsg ? `<div class="co-alert" role="status">${ic('info')}<p>${esc(st.couponMsg)}</p></div>` : ''}
      ${c ? `<div class="co-ok co-drop">${ic('tag')}<p><b>${esc(c.code)}</b> eingelöst: ${couponLabel(c)}, du sparst ${eur(t.discount)}.</p><button class="linkbtn co-tap" type="button" data-co="uncoupon">Entfernen</button></div>` : ''}
      <div class="field">
        <label for="coCoupon">${c ? 'Anderen Gutschein einlösen' : 'Gutscheincode'}</label>
        <div class="co-coupon">
          <input class="inp" id="coCoupon" value="${esc(st.couponInput)}" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="z. B. HERBST10" aria-describedby="coCouponErr">
          <button class="btn ghost" type="button" data-co="coupon">Einlösen</button>
        </div>
        <p class="hint err co-err" id="coCouponErr" hidden></p>
      </div>
    </fieldset>`;
}
function renderPay(animate) {
  const t = totals();
  const invOk = t.total <= INVOICE_MAX;
  const boxes = { card: 'coBoxCard', paypal: 'coBoxPaypal', sepa: 'coBoxSepa', invoice: 'coBoxInvoice' };
  $$('#coStep3 input[name="coPay"]').forEach(r => { r.checked = r.value === st.pay; });
  Object.entries(boxes).forEach(([k, id]) => {
    const el = $('#' + id);
    const on = k === st.pay;
    el.hidden = !on;
    if (on && animate && !reduced()) { el.classList.remove('co-drop'); void el.offsetWidth; el.classList.add('co-drop'); }
  });
  const inv = $('#coPayInv');
  inv.disabled = !invOk && st.pay !== 'invoice';
  inv.closest('.opt').classList.toggle('co-off', !invOk);
  $('#coInvNote').textContent = invOk
    ? `Zahlbar in ${INVOICE_DAYS} Tagen, bis ${eur(INVOICE_MAX)} Bestellwert`
    : `Nur bis ${eur(INVOICE_MAX)} Bestellwert. Deine Bestellung: ${eur(t.total)}`;
  // Rechnung gewählt, aber der Betrag liegt inzwischen über der Grenze: gleich sagen, nicht erst beim Weiter
  if (st.pay === 'invoice' && !invOk) setErr('coPayInv', `Rechnung geht nur bis ${eur(INVOICE_MAX)} Bestellwert. Wähle eine andere Zahlungsart.`);
  else setErr('coPayInv', '');
  $('#coTestData').innerHTML = testData(st.pay);
  const err = $('#coPayErr');
  err.innerHTML = st.payErr ? `${ic('alert')}<p>${esc(st.payErr)}</p>` : '';
  err.hidden = !st.payErr;
}
function renderReview() {
  const ad = addressNow();
  const t = totals();
  const L = lines();
  const n = L.reduce((x, l) => x + l.q, 0);
  const payHint = {
    card: 'Testkarte. Die Zahlung wird beim Bestellen geprüft.',
    paypal: 'Du gibst die Zahlung gleich im Testkonto frei.',
    sepa: 'Abbuchung von deinem Konto (Test).',
    invoice: `Zahlbar innerhalb von ${INVOICE_DAYS} Tagen nach der Bestellung.`
  }[st.pay];
  $('#coStep4').innerHTML = `
    <h3 class="co-h" id="coH4" tabindex="-1">${HEADS[3]}</h3>
    <div class="co-rev">
      <section class="co-card" aria-labelledby="coRevA">
        <h4 id="coRevA">Lieferadresse</h4>
        <p>${esc(ad.address.name)}<br>${esc(ad.address.street)}<br>${esc(ad.address.zip)} ${esc(ad.address.city)}</p>
        <p class="hint">${esc(ad.email)}</p>
        <button class="linkbtn co-tap" type="button" data-co="goto" data-step="1" aria-label="Lieferadresse ändern">Ändern</button>
      </section>
      <section class="co-card" aria-labelledby="coRevS">
        <h4 id="coRevS">Versand</h4>
        <p>${st.ship === 'exp' ? 'Express' : 'Standard'} · ${t.ship ? eur(t.ship) : 'kostenlos'}</p>
        <p class="hint">Lieferung ${esc(st.ship === 'exp' ? F.util.fastDate() : F.util.stdRange())}</p>
        <button class="linkbtn co-tap" type="button" data-co="goto" data-step="2" aria-label="Versand ändern">Ändern</button>
      </section>
      <section class="co-card" aria-labelledby="coRevP">
        <h4 id="coRevP">Zahlung</h4>
        <p>${payText(st.pay, st.payInfo)}</p>
        <p class="hint">${payHint}</p>
        <button class="linkbtn co-tap" type="button" data-co="goto" data-step="3" aria-label="Zahlung ändern">Ändern</button>
      </section>
    </div>
    <section aria-labelledby="coRevI">
      <h4 class="co-sub" id="coRevI">${n} Artikel</h4>
      <ul class="co-lines">${L.map(({ p, q }) => lineHTML(p, q, p.price)).join('')}</ul>
    </section>`;
}
function renderSum() {
  const t = Object.assign(totals(), { exp: st.ship === 'exp' });
  const code = st.coupon && st.coupon.code;
  const sum = $('#coSum');
  if (st.step === 4) {
    sum.innerHTML = `<h3>Summe</h3>${sumHTML(t, code)}
      <label class="co-checkrow" for="coAgb"><input type="checkbox" id="coAgb"${st.agb ? ' checked' : ''} aria-describedby="coAgbErr"><span>Ich habe die AGB und die Widerrufsbelehrung gelesen.</span></label>
      <p class="hint err co-err" id="coAgbErr" hidden></p>
      <details class="co-det co-legal"><summary>AGB und Widerruf in Kürze</summary>
        <p>Du kaufst direkt beim jeweiligen Verkäufer, Fundus vermittelt. Du kannst innerhalb von 14 Tagen nach Erhalt ohne Angabe von Gründen widerrufen. Rücksendungen sind 30 Tage kostenlos.</p>
      </details>
      <p class="demo-note">Testmodus: Es wird nichts berechnet und nichts verschickt.</p>`;
    return;
  }
  const L = lines();
  const n = L.reduce((x, l) => x + l.q, 0);
  const open = st.itemsOpen == null ? matchMedia('(min-width: 781px)').matches : st.itemsOpen;
  sum.innerHTML = `<h3>Deine Bestellung</h3>
    <details class="co-det co-items-d"${open ? ' open' : ''}><summary>${n} Artikel</summary>
      <ul class="co-lines">${L.map(({ p, q }) => lineHTML(p, q, p.price)).join('')}</ul>
    </details>
    ${sumHTML(t, code)}
    <p class="demo-note">Testmodus: Es wird nichts berechnet.</p>`;
}
function renderFoot() {
  const t = totals();
  const tot = $('#coFootTotal');
  tot.textContent = eur(t.total);
  if (st.lastTotal != null && st.lastTotal !== t.total && !reduced()) { tot.classList.remove('co-bump'); void tot.offsetWidth; tot.classList.add('co-bump'); }
  st.lastTotal = t.total;
  const last = st.step === 4;
  // Auf schmalen Bildschirmen reicht „Weiter“, der letzte Knopf nennt immer „Zahlungspflichtig bestellen“
  $('#coNext').innerHTML = last ? `${ic('lock')}<span>${NEXT[3]}</span>` : `<span class="co-lg">${NEXT[st.step - 1]}</span><span class="co-sm">Weiter</span>${ic('arrowRight')}`;
  if (last) $('#coNext').removeAttribute('aria-label'); else $('#coNext').setAttribute('aria-label', NEXT[st.step - 1]);
  const back = $('#coBack');
  back.innerHTML = `${ic('arrowLeft')}<span>${st.step === 1 ? 'Warenkorb' : 'Zurück'}</span>`;
  back.setAttribute('aria-label', st.step === 1 ? 'Zurück zum Warenkorb' : `Zurück zu ${STEPS[st.step - 2]}`);
  $('#coFoot').classList.toggle('co-last', last);
}
function renderEmpty() {
  $('#coEmpty').innerHTML = `<div class="co-empty">
    ${ic('cart')}
    <h3 class="co-h" id="coH0" tabindex="-1">Dein Warenkorb ist leer</h3>
    ${st.notice ? `<div class="co-alert" role="alert">${ic('alert')}<div>${st.notice}</div></div>` : ''}
    <p>Leg zuerst etwas in den Warenkorb. Dann geht es hier weiter.</p>
    <button class="btn" type="button" data-co="shop">Weiter einkaufen</button>
  </div>`;
}
function renderDone(quiet) {
  const o = st.order;
  const first = String(o.name || '').trim().split(/\s+/)[0];
  const inv = o.payment.method === 'invoice';
  const due = F.util.dateFmt.format(new Date(new Date(o.createdAt || Date.now()).getTime() + INVOICE_DAYS * 864e5));
  const when = o.shipMethod === 'exp' ? F.util.fastDate() : F.util.stdRange();
  const n = o.items.reduce((x, i) => x + i.qty, 0);
  const a = auth();
  const t = { sub: o.subtotal, discount: o.discount, ship: o.shipping, total: o.total, exp: o.shipMethod === 'exp' };
  $('#coDone').innerHTML = `<div class="co-done${quiet ? ' co-quiet' : ''}">
    <div class="co-tickw" aria-hidden="true"><svg class="co-tick" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29"/><path d="M20 33.5l8 8 16-17"/></svg></div>
    <h2 id="coDoneTitle" tabindex="-1">Danke${first ? ', ' + esc(first) : ''}!</h2>
    <p class="co-lead">${inv ? 'Deine Bestellung ist eingegangen. Sobald deine Überweisung da ist, geht sie auf den Weg.' : 'Deine Bestellung ist bezahlt und eingegangen.'}</p>
    <dl class="co-facts">
      <div><dt>Bestellnummer</dt><dd class="co-sel">${esc(o.id)}</dd></div>
      <div><dt>Lieferung voraussichtlich</dt><dd>${esc(when)}</dd></div>
      <div><dt>Zahlung</dt><dd>${payText(o.payment.method, o.payment)} ${F.shop.statusPill(o.status)}</dd></div>
      <div><dt>Gesamt</dt><dd>${eur(o.total)}</dd></div>
    </dl>
    ${inv ? `<section class="co-transfer" aria-labelledby="coTrH">
      <h3 id="coTrH">So bezahlst du die Rechnung</h3>
      <dl class="co-kv">
        <div><dt>Empfänger</dt><dd>${PAYEE}</dd></div>
        <div><dt>IBAN</dt><dd><span class="co-sel co-mono">${fmtIban(TEST_IBAN)}</span>${copyBtn(TEST_IBAN, 'IBAN', '')}</dd></div>
        <div><dt>Verwendungszweck</dt><dd><span class="co-sel co-mono">${esc(o.id)}</span>${copyBtn(o.id, 'Verwendungszweck', '')}</dd></div>
        <div><dt>Betrag</dt><dd>${eur(o.total)}</dd></div>
        <div><dt>Fällig bis</dt><dd>${esc(due)}</dd></div>
      </dl>
      <p class="hint">Testmodus: Bitte überweise nichts. Die Bankverbindung ist ein Beispiel.</p>
    </section>` : ''}
    <details class="co-det co-done-items"><summary>${n} Artikel · ${eur(o.total)}</summary>
      <ul class="co-lines">${o.items.map(i => lineHTML(i, i.qty, i.price)).join('')}</ul>
      ${sumHTML(t, o.coupon)}
    </details>
    <p class="demo-note">Testmodus: Es wurde kein Geld bewegt und nichts verschickt.</p>
    <div class="co-done-btns">
      ${o.userId && a && typeof a.openAccount === 'function' ? `<button class="btn" type="button" data-co="orders">${ic('box')}Bestellung ansehen</button>` : ''}
      <button class="btn${o.userId ? ' ghost' : ''}" type="button" data-co="shop">Weiter einkaufen</button>
    </div>
    ${!o.userId && a && typeof a.requireLogin === 'function' ? `<div class="co-guest">
      ${ic('user')}
      <div><p><b>Bestellungen immer im Blick</b></p><p class="hint">Mit einem Konto siehst du den Status jederzeit und bestellst beim nächsten Mal schneller.</p></div>
      <button class="btn ghost" type="button" data-co="register">Konto anlegen</button>
    </div>` : ''}
  </div>`;
}

/* ---------- Navigation ---------- */
function goStep(n) {
  st.dir = n > st.step ? 1 : n < st.step ? -1 : 0;
  st.step = n;
  st.maxStep = Math.max(st.maxStep, n);
  st.notice = '';
  render();
  const panel = $('#coStep' + n);
  if (panel && st.dir && !reduced()) {
    panel.classList.remove('co-in-r', 'co-in-l'); void panel.offsetWidth;
    panel.classList.add(st.dir > 0 ? 'co-in-r' : 'co-in-l');
  }
  $('#coBody').scrollTop = 0;
  const h = $('#coH' + n);
  if (h) h.focus({ preventScroll: true });
}
function next() {
  if (st.busy) return;
  if (st.step === 2) {
    const code = ($('#coCoupon') || {}).value || '';
    if (code.trim() && !applyCoupon(code)) return;
  }
  const errs = stepErrors(st.step);
  showErrors(errs);
  if (errs.length) return;
  if (st.step === 3) { capturePayInfo(); st.payErr = ''; }
  if (st.step === 4) { place(); return; }
  goStep(st.step + 1);
}
// Über die Schrittanzeige springen: zurück immer, vorwärts bis zum weitesten Schritt, wenn alles dazwischen stimmt
function jump(n) {
  if (st.busy || n === st.step) return;
  if (n < st.step) { goStep(n); return; }
  for (let i = st.step; i < n; i++) {
    if (i === 2 && st.step === 2) {
      const code = ($('#coCoupon') || {}).value || '';
      if (code.trim() && !applyCoupon(code)) return;
    }
    const errs = stepErrors(i);
    if (errs.length) { if (i !== st.step) goStep(i); showErrors(errs); return; }
    if (i === 3) { capturePayInfo(); st.payErr = ''; }
  }
  goStep(n);
}
function back() {
  if (st.busy) return;
  if (st.step > 1) { goStep(st.step - 1); return; }
  dlg().close();
  F.shop.openCart();
}
async function login() {
  const a = auth();
  if (!a || typeof a.requireLogin !== 'function') return;
  let u = null;
  try { u = await a.requireLogin('Melde dich an, um schneller zu bestellen'); } catch (e) { u = null; }
  const d = dlg();
  if (!d.open) F.util.openDlg(d);
  onSession();
  if (st.order) return;
  render();
  if (u) {
    toast(`Angemeldet als ${esc(u.name || u.email)}.`, null, { type: 'ok' });
    const h = $('#coH' + st.step);
    if (h) h.focus({ preventScroll: true });
  }
}
// Gast nach der Bestellung: Konto anlegen und die Bestellung bei gleicher E-Mail-Adresse übernehmen
async function register() {
  const a = auth();
  if (!a || typeof a.requireLogin !== 'function') return;
  let u = null;
  try { u = await a.requireLogin('Leg ein Konto an, um deine Bestellungen jederzeit zu sehen'); } catch (e) { u = null; }
  const d = dlg();
  if (!d.open) F.util.openDlg(d);
  const o = st.order;
  if (!u || !o) return;
  if (!o.userId && String(u.email || '').toLowerCase() === String(o.email || '').toLowerCase()) {
    try {
      st.order = await F.db.orders.save(Object.assign({}, o, { userId: u.id }));
      toast('Die Bestellung liegt jetzt in deinem Konto.', null, { type: 'ok' });
    } catch (e) {
      toast(esc(e && e.message ? e.message : 'Die Bestellung ließ sich nicht dem Konto zuordnen.'), null, { type: 'err', duration: 8000 });
    }
  } else if (!o.userId) {
    toast('Du bist angemeldet. Diese Bestellung lief über eine andere E-Mail-Adresse und erscheint deshalb nicht in deinem Konto.', null, { duration: 7000 });
  }
  renderDone(true);
  const b = $('#coDone [data-co="orders"]') || $('#coDoneTitle');
  if (b) b.focus({ preventScroll: true });
}

/* ---------- Kopieren ---------- */
async function copyText(text, host) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch (e) { /* weiter mit dem Ersatzweg */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.className = 'sr';
    (host || document.body).appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) { return false; }
}
async function copy(btn) {
  const value = btn.dataset.coCopy;
  const ok = await copyText(value, btn.closest('dialog'));
  btn.focus({ preventScroll: true });
  if (ok) {
    const before = btn.innerHTML;
    btn.classList.add('co-copied');
    btn.innerHTML = `${ic('check')}<span>Kopiert</span>`;
    announce('Kopiert.');
    setTimeout(() => { btn.classList.remove('co-copied'); btn.innerHTML = before; }, 1600);
    return;
  }
  // Ohne Zwischenablage (z. B. in der App): Testdaten direkt ins Feld setzen
  const target = btn.dataset.coFill && $('#' + btn.dataset.coFill);
  if (target) {
    target.value = value;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.focus();
    toast('Kopieren geht hier nicht. Die Testdaten stehen jetzt im Feld.');
  } else {
    toast('Kopieren geht hier nicht. Markiere den Text und kopiere ihn von Hand.');
  }
}

/* ---------- Bestellen ---------- */
function setBusy(on) {
  st.busy = on;
  const b = $('#coBusy');
  if (on) {
    $$('li', b).forEach(li => { li.dataset.state = ''; });
    $('#coBusyText').textContent = 'Bestellung wird vorbereitet';
  }
  b.hidden = !on;
  ['coForm', 'coFoot'].forEach(id => { $('#' + id).inert = on; });
  ['coNext', 'coBack'].forEach(id => { $('#' + id).disabled = on; });
  $('#dlgCheckout .co-head .x').disabled = on;
  renderProg();
  if (on) $('#coBusyIn').focus({ preventScroll: true });
}
async function busyStep(key, text, ms) {
  $$('#coBusy li').forEach(li => { if (li.dataset.state === 'cur') li.dataset.state = 'done'; });
  const li = $(`#coBusy li[data-b="${key}"]`);
  if (li) li.dataset.state = 'cur';
  $('#coBusyText').textContent = text;
  await wait(ms || 650);
}
// Bestand frisch aus der Datenhaltung prüfen und den Warenkorb anpassen
async function checkStock() {
  const fresh = await F.db.products.all();
  const map = new Map(fresh.map(p => [p.id, p]));
  const changes = [];
  lines().forEach(({ p, q }) => {
    const f = map.get(p.id);
    const max = f && f.active !== false ? F.shop.stockOf(f) : 0;
    if (q > max) changes.push({ id: p.id, name: (f || p).name, max });
  });
  changes.forEach(c => F.shop.cart.set(c.id, c.max));
  return changes;
}
// Testzahlung: Ergebnis hängt nur an den Testdaten. Die volle Nummer verlässt diese Funktion nie.
async function authorize() {
  const t = totals();
  const txn = 'test_' + rand();
  if (st.pay === 'card') {
    const d = digits($('#coCardNo').value);
    const tc = TEST_CARDS.find(c => c.no === d);
    if (!tc) return { ok: false, clear: true, field: 'coCardNo', msg: 'Im Testmodus funktionieren nur Testkarten. Nimm eine Nummer aus der Liste.' };
    const info = { brand: tc.brand, last4: d.slice(-4) };
    if (tc.result === 'declined') return { ok: false, clear: true, field: 'coCardNo', msg: 'Karte abgelehnt. Deine Bank hat die Zahlung nicht freigegeben. Nimm eine andere Karte oder Zahlungsart.' };
    if (tc.result === 'funds') return { ok: false, clear: true, field: 'coCardNo', msg: 'Karte abgelehnt: Das Konto ist nicht gedeckt. Nimm eine andere Karte oder Zahlungsart.' };
    if (tc.result === '3ds') {
      $('#coBusyText').textContent = 'Warte auf die Bestätigung deiner Bank';
      if (!await sheet('3ds', t.total, info)) {
        return { ok: false, clear: true, field: 'coCardNo', msg: 'Du hast die Bestätigung bei deiner Bank abgebrochen. Es wurde nichts bestellt. Gib die Karte noch einmal ein oder wähle eine andere Zahlungsart.' };
      }
    }
    return { ok: true, payment: { method: 'card', brand: info.brand, last4: info.last4, status: 'paid', txn } };
  }
  if (st.pay === 'paypal') {
    $('#coBusyText').textContent = 'Warte auf die Freigabe im PayPal-Testkonto';
    if (!await sheet('paypal', t.total)) return { ok: false, field: 'coPayPal', msg: 'Du hast die Zahlung mit PayPal abgebrochen. Es wurde nichts bestellt. Versuch es noch einmal oder wähle eine andere Zahlungsart.' };
    return { ok: true, payment: { method: 'paypal', brand: null, last4: null, status: 'paid', txn } };
  }
  if (st.pay === 'sepa') {
    const iban = ibanClean($('#coIban').value);
    if (iban !== TEST_IBAN) return { ok: false, clear: true, field: 'coIban', msg: 'Im Testmodus funktioniert nur die Test-IBAN.' };
    return { ok: true, payment: { method: 'sepa', brand: null, last4: iban.slice(-4), status: 'paid', txn } };
  }
  return { ok: true, payment: { method: 'invoice', brand: null, last4: null, status: 'pending', txn } };
}
// Bestätigung der Bank (3-D Secure) oder Freigabe im PayPal-Testkonto: Promise<boolean>
function sheet(kind, total, info) {
  return new Promise(resolve => {
    const d = $('#dlgCoAuth');
    let settled = false;
    const finish = v => {
      if (settled) return;
      settled = true;
      d.removeEventListener('close', onClose);
      d.removeEventListener('click', onClick);
      if (d.open) d.close();
      resolve(v);
    };
    const onClose = () => finish(false);
    const onClick = e => { const b = e.target.closest('[data-co-auth]'); if (b) finish(b.dataset.coAuth === 'ok'); };
    const now = F.util.dateTimeFmt.format(new Date());
    if (kind === '3ds') {
      $('#coAuthTitle').textContent = 'Bestätigung deiner Bank';
      $('#coAuthBody').innerHTML = `
        <div class="co-bank">${ic('shield')}<div><b>Testbank</b><span>Sichere Bestätigung (3-D Secure)</span></div></div>
        <p>Bestätige die Zahlung an <b>${PAYEE}</b>.</p>
        <dl class="co-kv">
          <div><dt>Betrag</dt><dd>${eur(total)}</dd></div>
          <div><dt>Karte</dt><dd>${esc(info.brand)} •••• ${esc(info.last4)}</dd></div>
          <div><dt>Zeitpunkt</dt><dd>${esc(now)}</dd></div>
        </dl>
        <p class="demo-note">Testmodus: Sonst fragt hier deine Bank, zum Beispiel in ihrer App. Es wird nichts abgebucht.</p>`;
      $('#coAuthOk').innerHTML = `${ic('lock')}Zahlung bestätigen`;
    } else {
      $('#coAuthTitle').textContent = 'PayPal (Testkonto)';
      $('#coAuthBody').innerHTML = `
        <div class="co-bank">${ic('user')}<div><b>Testkonto</b><span>Ohne Anmeldung, nur zum Ausprobieren</span></div></div>
        <p>Gib die Zahlung an <b>${PAYEE}</b> frei.</p>
        <dl class="co-kv">
          <div><dt>Betrag</dt><dd>${eur(total)}</dd></div>
          <div><dt>Empfänger</dt><dd>${PAYEE}</dd></div>
        </dl>
        <p class="demo-note">Testmodus: Es gibt keine Anmeldung und es wird nichts abgebucht.</p>`;
      $('#coAuthOk').innerHTML = `${ic('check')}Zahlung freigeben`;
    }
    d.addEventListener('close', onClose);
    d.addEventListener('click', onClick);
    F.util.openDlg(d);
    $('#coAuthOk').focus();
  });
}
function itemOf(p, q) {
  const it = { productId: p.id, name: p.name, price: p.price, qty: q, sellerId: p.sellerId || null, pic: p.pic, c: p.c, d: p.d, tint: p.tint };
  // Fotos nur übernehmen, wenn sie klein sind: Bestellungen teilen sich den Speicher mit allem anderen
  const img = F.util.safeImg(p.img);
  if (img && (img.startsWith('https:') || img.length < 60000)) it.img = img;
  return it;
}
async function saveOrder(payment) {
  const L = lines();
  const t = totals();
  const ad = addressNow();
  const u = me();
  let id = F.db.newOrderId();
  for (let i = 0; i < 8 && await F.db.orders.get(id); i++) id = F.db.newOrderId();
  const now = new Date();
  const pending = payment.method === 'invoice';
  const status = pending ? 'pending_payment' : 'paid';
  const label = (F.shop.PAYMENT || {})[payment.method] || payment.method;
  const due = F.util.dateFmt.format(new Date(now.getTime() + INVOICE_DAYS * 864e5));
  return F.db.orders.save({
    id,
    userId: u ? u.id : null,
    email: ad.email,
    name: ad.name,
    address: ad.address,
    items: L.map(({ p, q }) => itemOf(p, q)),
    subtotal: t.sub,
    discount: t.discount,
    shipping: t.ship,
    total: t.total,
    coupon: st.coupon && t.discount > 0 ? st.coupon.code : null,
    shipMethod: st.ship === 'exp' ? 'exp' : 'std',
    payment,
    status,
    history: [{ status, at: now.toISOString(), note: pending ? `Bestellt auf Rechnung, zahlbar bis ${due}` : `Zahlung eingegangen (${label}, Testmodus)` }],
    eta: isoDay(F.util.plusWorkdays(st.ship === 'exp' ? 1 : 5))
  });
}
async function takeStock(order) {
  for (const it of order.items) {
    try {
      const p = await F.db.products.get(it.productId);
      if (!p) continue;
      p.stock = Math.max(0, F.shop.stockOf(p) - it.qty);
      await F.db.products.save(p);
    } catch (e) { /* Die Bestellung steht. Den Bestand kann die Verwaltung korrigieren. */ }
  }
}
// Ablauf nach „Zahlungspflichtig bestellen“; liefert ein Ergebnis, das place() anzeigt
async function run() {
  await busyStep('stock', 'Bestand wird geprüft');
  let changes = await checkStock();
  if (changes.length) return { kind: 'stock', changes };
  await busyStep('pay', 'Zahlung wird geprüft');
  const res = await authorize();
  if (!res.ok) return Object.assign({ kind: 'pay' }, res);
  await busyStep('save', 'Bestellung wird gespeichert', 450);
  changes = await checkStock();
  if (changes.length) return { kind: 'stock', changes };
  const order = await saveOrder(res.payment);
  // Ab hier steht die Bestellung: Fehler danach dürfen sie nicht mehr als gescheitert melden
  try {
    clearPayment(true);
    await takeStock(order);
    F.shop.cart.clear();
    await saveAddress(order.address);
    F.emit('order:placed', { order });
  } catch (e) { /* Nebenarbeiten, die Bestellung bleibt gültig */ }
  $$('#coBusy li').forEach(li => { li.dataset.state = 'done'; });
  $('#coBusyText').textContent = 'Fertig';
  await wait(300);
  return { kind: 'done', order };
}
async function place() {
  if (st.busy) return;
  // Zahlungsdaten erneut prüfen: Die Felder werden beim Schließen geleert
  const payErrs = stepErrors(3);
  if (payErrs.length) { goStep(3); showErrors(payErrs); return; }
  const agb = stepErrors(4);
  if (agb.length) { showErrors(agb); return; }
  if (!lines().length) { render(); return; }
  st.notice = '';
  setBusy(true);
  let out;
  try { out = await run(); } catch (err) { out = { kind: 'error', err }; }
  setBusy(false);
  if (out.kind === 'done') {
    st.order = out.order;
    render();
    $('#coBody').scrollTop = 0;
    $('#coDoneTitle').focus({ preventScroll: true });
    if (!reduced() && F.fx && typeof F.fx.confetti === 'function') { try { F.fx.confetti(); } catch (e) { /* nur Effekt */ } }
  } else if (out.kind === 'stock') {
    st.notice = stockNotice(out.changes, true);
    render();
    const n = $('#coNotice') || $('#coH0');
    if (n) n.focus({ preventScroll: true });
  } else if (out.kind === 'pay') {
    if (out.clear) clearPayment(false);
    st.payErr = out.msg;
    st.payInfo = null;
    goStep(3);
    const f = $('#' + out.field);
    if (f) { f.focus({ preventScroll: true }); shake(f.closest('.opt') || f); }
  } else {
    const msg = out.err && out.err.message ? out.err.message : 'Die Bestellung konnte nicht gespeichert werden.';
    toast(`${esc(msg)} Es wurde nichts berechnet.`, null, { type: 'err', duration: 9000 });
    const nx = $('#coNext');
    if (nx) nx.focus({ preventScroll: true });
  }
}
// Nach einer abgeschlossenen Bestellung neu beginnen (Adresse bleibt für das nächste Mal)
function reset() {
  Object.assign(st, { order: null, step: 1, maxStep: 1, dir: 0, ship: 'std', coupon: null, couponInput: '', couponMsg: '', agb: false, notice: '', payErr: '', lastTotal: null });
  clearPayment(true);
}

/* ---------- Öffnen ---------- */
function open() {
  const d = dlg();
  if (!d) { toast('Die Kasse wird gerade geladen. Versuch es gleich noch einmal.'); return; }
  if (st.busy) { if (!d.open) F.util.openDlg(d); return; }
  if (st.order) reset();
  onSession();
  if (st.step > 1 && stepErrors(1).length) st.step = 1;
  if (st.step === 4 && !secretsOk()) st.step = 3;
  st.dir = 0;
  st.lastTotal = null;
  render();
  F.util.openDlg(d);
  const h = $('#coH' + st.step) || $('#coH0') || $('#coTitle');
  if (h) h.focus({ preventScroll: true });
}

/* ---------- Aufbau ---------- */
function payPanel() {
  const opt = (id, value, title, sub, icon, subId) => `<label class="opt" for="${id}"><input type="radio" name="coPay" id="${id}" value="${value}"${subId ? ` aria-describedby="${subId} ${id}Err"` : ''}><span>${title}<small${subId ? ` id="${subId}"` : ''}>${sub}</small></span>${ic(icon)}</label>`;
  const fld = (id, label, attrs, extra) => `<div class="field"><label for="${id}">${label}</label>${extra ? '<div class="co-inwrap">' : ''}<input class="inp" id="${id}" aria-describedby="${id}Err" ${attrs}>${extra ? extra + '</div>' : ''}<p class="hint err co-err" id="${id}Err" hidden></p></div>`;
  // Reihenfolge: Zahlungsarten oben, darunter Testdaten und Felder. So springt beim Wechsel nichts über dem Finger weg.
  return `
    <h3 class="co-h" id="coH3" tabindex="-1">${HEADS[2]}</h3>
    <div class="co-alert" id="coPayErr" role="alert" hidden></div>
    <fieldset>
      <legend class="sr">Zahlungsart</legend>
      <div class="co-methods">
        ${opt('coPayCard', 'card', 'Kreditkarte', 'Visa, Mastercard, Amex', 'card')}
        ${opt('coPayPal', 'paypal', 'PayPal (Testkonto)', 'Freigabe nach dem Bestellen', 'user')}
        ${opt('coPaySepa', 'sepa', 'Lastschrift (SEPA)', 'Abbuchung von deinem Konto', 'bank')}
        ${opt('coPayInv', 'invoice', 'Rechnung', '', 'mail', 'coInvNote')}
      </div>
      <p class="hint err co-err" id="coPayInvErr" hidden></p>
    </fieldset>
    <div class="co-test" role="note" aria-labelledby="coTestH">
      <p class="co-test-h" id="coTestH">${ic('info')}<b>Testmodus</b></p>
      <p>Es fließt kein Geld und nichts wird abgebucht. Es funktionieren nur diese Testdaten:</p>
      <div id="coTestData"></div>
    </div>
    <div class="co-paybox" id="coBoxCard" hidden>
      ${fld('coCardNo', 'Kartennummer', 'inputmode="numeric" autocomplete="off" maxlength="23" spellcheck="false" placeholder="1234 1234 1234 1234"', '<span class="co-brand" id="coBrand" aria-live="polite"></span>')}
      <div class="co-pair co-pair-s">
        ${fld('coCardExp', 'Gültig bis', 'inputmode="numeric" autocomplete="off" maxlength="5" placeholder="MM/JJ"')}
        ${fld('coCardCvc', 'Prüfnummer (CVC)', 'inputmode="numeric" autocomplete="off" maxlength="4" placeholder="123"')}
      </div>
      ${fld('coCardName', 'Name auf der Karte', 'autocomplete="off" autocapitalize="words" spellcheck="false"')}
      <p class="hint co-safe">${ic('lock')}Wir speichern nur die Kartenmarke und die letzten 4 Ziffern.</p>
    </div>
    <div class="co-paybox" id="coBoxPaypal" hidden>
      <p>Nach „Zahlungspflichtig bestellen“ öffnet sich das PayPal-Testkonto. Dort gibst du die Zahlung frei oder brichst ab. Eine Anmeldung brauchst du nicht.</p>
    </div>
    <div class="co-paybox" id="coBoxSepa" hidden>
      ${fld('coIban', 'IBAN', 'autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="42" placeholder="DE00 0000 0000 0000 0000 00"')}
      ${fld('coIbanName', 'Kontoinhaber', 'autocomplete="name" autocapitalize="words"')}
      <label class="co-checkrow" for="coMandate"><input type="checkbox" id="coMandate" aria-describedby="coMandateErr"><span>Ich erteile das SEPA-Lastschriftmandat: ${PAYEE} darf den Betrag von meinem Konto abbuchen. Ich kann die Lastschrift innerhalb von 8 Wochen zurückholen.</span></label>
      <p class="hint err co-err" id="coMandateErr" hidden></p>
      <p class="hint co-safe">${ic('lock')}Wir speichern nur die letzten 4 Ziffern der IBAN.</p>
    </div>
    <div class="co-paybox" id="coBoxInvoice" hidden>
      <p>Nach der Bestellung siehst du die Bankverbindung. Zahlbar innerhalb von ${INVOICE_DAYS} Tagen.</p>
    </div>`;
}
function build() {
  const d = document.createElement('dialog');
  d.id = 'dlgCheckout';
  d.setAttribute('aria-labelledby', 'coTitle');
  d.innerHTML = `
    <div class="co-head">
      <div class="co-title"><h2 id="coTitle" tabindex="-1">Kasse</h2><span class="co-mode">${ic('shield')}Testmodus</span></div>
      <button class="x" type="button" data-close aria-label="Kasse schließen">${ic('close')}</button>
      <nav class="co-progw" id="coProgW" aria-label="Schritte der Kasse">
        <span class="co-track" aria-hidden="true"><span class="co-fill"></span></span>
        <ol class="co-prog" id="coProg">${STEPS.map((s, i) => `<li><button type="button" data-co="goto" data-step="${i + 1}"><span class="co-dot">${i + 1}</span><span class="co-stepl">${s}</span></button></li>`).join('')}</ol>
      </nav>
    </div>
    <div class="dlg co-body" id="coBody">
      <form id="coForm" novalidate>
        <div id="coNoticeBox"></div>
        <div class="co">
          <div class="co-main">
            <section class="co-panel" id="coStep1" aria-labelledby="coH1"></section>
            <section class="co-panel" id="coStep2" aria-labelledby="coH2" hidden></section>
            <section class="co-panel" id="coStep3" aria-labelledby="coH3" hidden>${payPanel()}</section>
            <section class="co-panel" id="coStep4" aria-labelledby="coH4" hidden></section>
          </div>
          <aside class="co-sum" id="coSum" aria-label="Bestellübersicht"></aside>
        </div>
      </form>
      <div id="coDone" hidden></div>
      <div id="coEmpty" hidden></div>
    </div>
    <div class="co-foot" id="coFoot">
      <button class="btn ghost co-back" type="button" id="coBack" data-co="back"></button>
      <p class="co-ftot"><small>Gesamt</small><b id="coFootTotal"></b></p>
      <button class="btn co-next" type="submit" form="coForm" id="coNext"></button>
    </div>
    <div class="co-busy" id="coBusy" hidden>
      <div class="co-busy-in" id="coBusyIn" tabindex="-1">
        <span class="co-spin" aria-hidden="true"></span>
        <p class="co-busy-t" id="coBusyText" role="status" aria-live="polite">Bestellung wird vorbereitet</p>
        <ol class="co-bsteps">
          <li data-b="stock"><span class="co-bdot">${ic('check')}</span>Bestand prüfen</li>
          <li data-b="pay"><span class="co-bdot">${ic('check')}</span>Zahlung prüfen</li>
          <li data-b="save"><span class="co-bdot">${ic('check')}</span>Bestellung speichern</li>
        </ol>
        <p class="hint">Testmodus: Es fließt kein Geld.</p>
      </div>
    </div>
    <p class="sr" id="coLive" aria-live="polite"></p>`;
  document.body.appendChild(d);

  const s = document.createElement('dialog');
  s.id = 'dlgCoAuth';
  s.className = 'narrow co-auth';
  s.setAttribute('aria-labelledby', 'coAuthTitle');
  s.innerHTML = `<div class="dlg">
    <p class="co-mode">${ic('shield')}Testmodus</p>
    <h2 id="coAuthTitle"></h2>
    <div class="co-auth-body" id="coAuthBody"></div>
    <div class="co-auth-btns">
      <button class="btn" type="button" id="coAuthOk" data-co-auth="ok"></button>
      <button class="btn ghost" type="button" id="coAuthCancel" data-co-auth="cancel">Abbrechen</button>
    </div>
  </div>`;
  document.body.appendChild(s);
}
function wire() {
  const d = dlg();
  const form = $('#coForm');
  // Während der Zahlung darf ein Klick auf den Hintergrund oder Esc die Kasse nicht schließen
  d.addEventListener('click', e => { if (st.busy && e.target === d) e.stopImmediatePropagation(); }, true);
  d.addEventListener('cancel', e => { if (st.busy) e.preventDefault(); });
  d.addEventListener('close', () => {
    if (st.busy) { try { d.showModal(); } catch (e) { /* schon offen */ } return; }
    clearPayment(false);
    st.notice = '';
    if (st.order) reset();
    else if (st.step === 4 && (st.pay === 'card' || st.pay === 'sepa')) st.step = 3;
  });
  F.util.wireDialog(d);
  F.util.wireDialog($('#dlgCoAuth'));

  d.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.coCopy) { copy(b); return; }
    const act = b.dataset.co;
    if (!act) return;
    if (act === 'goto') jump(+b.dataset.step);
    else if (act === 'back') back();
    else if (act === 'coupon') applyCoupon(($('#coCoupon') || {}).value);
    else if (act === 'uncoupon') {
      st.coupon = null; st.couponMsg = '';
      renderShip(); renderSum(); renderFoot();
      $('#coCoupon').focus();
      announce('Gutschein entfernt.');
    }
    else if (act === 'login') login();
    else if (act === 'register') register();
    else if (act === 'orders') { d.close(); if (auth() && typeof F.auth.openAccount === 'function') F.auth.openAccount('orders'); }
    else if (act === 'shop') d.close();
  });
  form.addEventListener('submit', e => { e.preventDefault(); next(); });
  form.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'coZip') reformat(t, v => digits(v).slice(0, 5), v => v);
    if (t.dataset.f) st.addr[t.dataset.f] = t.value;
    if (t.id === 'coCoupon') st.couponInput = t.value;
    if (t.id === 'coCardNo') {
      reformat(t, digits, cardFormat);
      const b = brandOf(digits(t.value));
      $('#coBrand').textContent = b === AMEX ? 'Amex' : b;
      $('#coCardCvc').maxLength = b === AMEX ? 4 : 3;
    }
    if (t.id === 'coCardExp') reformat(t, v => digits(v).slice(0, 4), fmtExp);
    if (t.id === 'coCardCvc') reformat(t, v => digits(v).slice(0, 4), v => v);
    if (t.id === 'coIban') reformat(t, ibanClean, fmtIban);
    if (t.getAttribute('aria-invalid')) setErr(t.id, '');
  });
  form.addEventListener('change', e => {
    const t = e.target;
    if (t.name === 'coAddr') { st.addr.choice = t.value; keepFocus(renderAddr); }
    else if (t.id === 'coSaveAddr') st.addr.save = t.checked;
    else if (t.name === 'coShip') { st.ship = t.value; renderSum(); renderFoot(); }
    else if (t.name === 'coPay') { st.pay = t.value; st.payInfo = null; st.payErr = ''; renderPay(true); }
    else if (t.id === 'coAgb') { st.agb = t.checked; if (t.checked) setErr('coAgb', ''); }
    else if (t.id === 'coMandate' && t.checked) setErr('coMandate', '');
  });
  form.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'coCoupon') { e.preventDefault(); applyCoupon(e.target.value); }
  });
  $('#coSum').addEventListener('toggle', e => { if (e.target.classList.contains('co-items-d')) st.itemsOpen = e.target.open; }, true);

  F.on('cart:change', refresh);
  F.on('settings:change', () => setTimeout(refresh, 0));
  F.on('products:change', () => setTimeout(refresh, 60));
  F.on('session', () => {
    onSession();
    if (d.open && !st.busy && !st.order && st.step === 1) keepFocus(renderAddr);
  });
}

async function init() {
  if (dlg()) return;
  const css = document.createElement('style');
  css.id = 'checkout-style';
  css.textContent = CSS;
  document.head.appendChild(css);
  build();
  wire();
  onSession();
}

/* ---------- Styles ---------- */
const CSS = `
#dlgCheckout{width:min(1060px,calc(100% - 24px));height:min(900px,calc(100% - 24px))}
#dlgCheckout .opt input,#dlgCheckout .co-checkrow input{accent-color:var(--link)}
#dlgCheckout .inp[aria-invalid="true"]{border-color:var(--sale)}
.co-head{position:relative;flex:none;padding:12px 20px 2px;border-bottom:1px solid var(--line);background:var(--surface)}
.co-head .x{top:10px;right:12px}
.co-title{display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;min-height:48px;padding-right:56px}
.co-title h2{margin:0;font:800 clamp(22px,3vw,28px)/1.1 var(--f-display);letter-spacing:-.02em}
.co-title h2:focus,.co-h:focus,.co-done h2:focus,.co-alert:focus,.co-busy-in:focus{outline:none}
.co-mode{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;background:color-mix(in oklab,var(--accent) 30%,var(--surface));color:var(--ink);font:700 12px/1.2 var(--f-body);letter-spacing:.06em;text-transform:uppercase;justify-self:start}
.co-mode .ic{width:15px;height:15px}
.co-progw{position:relative;margin-top:4px}
.co-track{position:absolute;left:12.5%;right:12.5%;top:26px;height:4px;margin-top:-2px;border-radius:2px;background:var(--line);overflow:hidden}
.co-fill{display:block;height:100%;width:calc(var(--p,0) * 100%);border-radius:2px;background:var(--link);transition:width .55s cubic-bezier(.2,.8,.2,1)}
.co-prog{position:relative;list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}
.co-prog button{display:flex;flex-direction:column;align-items:center;gap:4px;width:100%;min-height:64px;padding:10px 2px 6px;border:0;border-radius:12px;background:none;color:var(--ink-soft);font:600 13px/1.2 var(--f-body)}
.co-prog button:disabled{cursor:default;opacity:1}
.co-prog button:not(:disabled):hover .co-stepl{text-decoration:underline;text-underline-offset:3px}
.co-dot{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--surface);box-shadow:inset 0 0 0 2px var(--line);font:800 14px/1 var(--f-display);transition:background-color .3s,box-shadow .3s,color .3s}
.co-dot .ic{width:18px;height:18px;stroke-width:2.6}
.co-prog [data-state="cur"] button{color:var(--ink);font-weight:700}
.co-prog [data-state="cur"] .co-dot{box-shadow:inset 0 0 0 2.5px var(--link);color:var(--link);animation:co-pop .45s cubic-bezier(.2,.9,.3,1.4)}
.co-prog [data-state="done"] button{color:var(--ink)}
.co-prog [data-state="todo"] button:not(:disabled) .co-dot{box-shadow:inset 0 0 0 2px var(--link);color:var(--link)}
.co-prog [data-state="done"] .co-dot{background:var(--link);box-shadow:none;color:var(--surface)}
.co-body{padding:22px 22px 28px;overflow-x:hidden}
.co-panel{display:grid;gap:20px;min-width:0}
.co-h{margin:0;font:800 clamp(20px,2.6vw,24px)/1.15 var(--f-display);letter-spacing:-.015em}
.co-in-r{animation:co-in-r .34s cubic-bezier(.2,.8,.2,1)}
.co-in-l{animation:co-in-l .34s cubic-bezier(.2,.8,.2,1)}
.co-drop{animation:co-drop .28s ease-out}
.co-shake{animation:co-shake .36s ease-in-out}
.co-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.co-newaddr{display:grid;gap:12px}
.co-login{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 16px;padding:14px 16px;border-radius:14px;background:var(--surface-2)}
.co-login > div{flex:1 1 240px;display:grid;gap:2px}
.co-login .btn{background:var(--surface)}
.co-who{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:12px;background:var(--surface-2);font-size:15px}
.co-who .ic{color:var(--link)}
.co-checkrow{display:flex;align-items:flex-start;gap:12px;min-height:44px;padding:10px 0;cursor:pointer;font-size:15px;line-height:1.4}
.co-checkrow input{flex:none;width:22px;height:22px;margin:0}
.co-tap{min-height:44px;padding:0 2px;justify-self:start}
.co-alert{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-radius:12px;background:color-mix(in oklab,var(--sale) 12%,var(--surface));color:var(--ink);box-shadow:inset 0 0 0 1.5px color-mix(in oklab,var(--sale) 45%,transparent);font-size:15px;animation:co-drop .28s ease-out}
.co-alert > .ic{flex:none;color:var(--sale);margin-top:1px}
.co-alert ul{margin:6px 0;padding-left:20px}
.co-alert > div{display:grid;gap:4px}
#coNotice{margin-bottom:18px}
.co-ok{display:flex;align-items:center;flex-wrap:wrap;gap:4px 10px;padding:8px 12px;border-radius:12px;background:color-mix(in oklab,var(--good) 13%,var(--surface));font-size:15px}
.co-ok > .ic{color:var(--good)}
.co-ok p{flex:1 1 200px}
.co-coupon{display:flex;gap:10px}
.co-coupon .inp{flex:1;min-width:0;text-transform:uppercase}
.co-coupon .inp::placeholder{text-transform:none}
.co-test{display:grid;gap:10px;padding:14px 16px;border-radius:14px;background:color-mix(in oklab,var(--accent) 16%,var(--surface));box-shadow:inset 0 0 0 1.5px color-mix(in oklab,var(--accent) 55%,transparent)}
.co-test-h{display:flex;align-items:center;gap:8px}
.co-test-h .ic{color:var(--ink)}
.co-tests{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.co-tests li{display:flex;align-items:center;gap:8px;padding:4px 4px 4px 12px;border-radius:10px;background:var(--surface)}
.co-tests li > div{flex:1;min-width:0;display:grid}
.co-tests code,.co-mono{font:600 15px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.01em}
.co-tests code{user-select:all;overflow-wrap:anywhere}
.co-tests small{font-size:13px;color:var(--ink-soft)}
.co-copy{flex:none;display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 12px;border:0;border-radius:999px;background:transparent;color:var(--link);font-weight:700;font-size:14px}
.co-copy:hover{background:var(--surface-2)}
.co-copy .ic{width:18px;height:18px}
.co-copy.co-copied{color:var(--good)}
.co-methods{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.co-methods .opt{min-height:64px}
.co-methods .opt > .ic{color:var(--ink-soft)}
.co-methods .opt:has(input:checked) > .ic{color:var(--link)}
.co-paybox{display:grid;gap:14px}
.co-paybox > p:not(.hint){font-size:15px}
.co-inwrap{position:relative}
.co-inwrap .inp{padding-right:112px}
.co-brand{position:absolute;right:10px;top:50%;transform:translateY(-50%);padding:4px 8px;border-radius:6px;background:var(--surface-2);color:var(--ink);font:700 12px/1.2 var(--f-body);pointer-events:none;animation:co-drop .25s ease-out}
.co-brand:empty{display:none}
.co-safe{display:flex;align-items:center;gap:6px}
.co-safe .ic{width:16px;height:16px}
.opt.co-off{opacity:.6;cursor:not-allowed}
.co-sum .demo-note{margin:0}
.co-det summary{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;cursor:pointer;font-weight:700;list-style:none}
.co-det summary::-webkit-details-marker{display:none}
.co-det summary::after{content:"";flex:none;width:9px;height:9px;margin-right:4px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:translateY(-2px) rotate(45deg);transition:transform .2s}
.co-det[open] summary::after{transform:translateY(2px) rotate(225deg)}
.co-det[open] > :not(summary){animation:co-drop .25s ease-out}
.co-legal{font-size:14px}
.co-legal p{color:var(--ink-soft);padding-bottom:6px}
.co-lines{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.co-det .co-lines{padding:4px 0 10px}
.co-line{display:grid;grid-template-columns:48px minmax(0,1fr) auto;gap:12px;align-items:center;font-size:14px}
.co-thumb{display:block;width:48px;aspect-ratio:1;border-radius:10px;overflow:hidden;background:var(--tint);background:color-mix(in oklab,var(--tint) var(--tint-mix),var(--surface))}
.co-thumb svg{display:block;width:100%;height:100%}
.co-lname{display:grid;min-width:0;line-height:1.3}
.co-lname > span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-weight:600}
.co-lname small{color:var(--ink-soft);font-size:13px;font-variant-numeric:tabular-nums}
.co-line b{font-variant-numeric:tabular-nums;white-space:nowrap}
.co-disc dt,.co-disc dd{color:var(--good)}
.co-rev{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));gap:12px}
.co-card{display:grid;align-content:start;gap:4px;padding:14px 16px 6px;border-radius:14px;border:1.5px solid var(--line);font-size:15px;min-width:0;overflow-wrap:anywhere}
.co-card h4,.co-sub{margin:0 0 4px;font:700 12px/1.2 var(--f-body);letter-spacing:.1em;text-transform:uppercase;color:var(--ink-soft)}
.co-sub{margin-bottom:10px}
.co-foot{position:relative;flex:none;display:flex;align-items:center;gap:12px;padding:12px 22px calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--line);background:var(--surface)}
.co-ftot{margin-left:auto;display:grid;text-align:right;line-height:1.15;font-variant-numeric:tabular-nums}
.co-ftot small{font-size:12px;color:var(--ink-soft)}
.co-ftot b{display:block;font:800 21px/1.1 var(--f-display);transform-origin:right center}
.co-bump{animation:co-bump .4s ease-out}
.co-next{min-width:210px}
.co-next span{text-align:center}
.co-sm{display:none}
.co-busy{position:absolute;inset:0;z-index:6;display:grid;place-items:center;padding:24px;background:color-mix(in oklab,var(--surface) 92%,transparent);animation:co-fade .2s ease-out}
.co-busy-in{display:grid;justify-items:center;gap:16px;text-align:center;max-width:340px}
.co-busy-t{font:800 20px/1.2 var(--f-display)}
.co-spin{width:58px;height:58px;border-radius:50%;border:5px solid var(--line);border-top-color:var(--link);animation:co-spin .8s linear infinite}
.co-bsteps{list-style:none;margin:0;padding:0;display:grid;gap:10px;text-align:left}
.co-bsteps li{display:flex;align-items:center;gap:10px;color:var(--ink-soft);transition:color .2s}
.co-bdot{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;box-shadow:inset 0 0 0 2px var(--line);color:transparent;transition:background-color .25s,box-shadow .25s,color .25s}
.co-bdot .ic{width:14px;height:14px;stroke-width:3}
.co-bsteps li[data-state="cur"]{color:var(--ink);font-weight:700}
.co-bsteps li[data-state="cur"] .co-bdot{box-shadow:inset 0 0 0 2px var(--link);animation:co-blink 1s ease-in-out infinite}
.co-bsteps li[data-state="done"]{color:var(--ink)}
.co-bsteps li[data-state="done"] .co-bdot{background:var(--good);box-shadow:none;color:var(--surface);animation:co-pop .35s ease-out}
.co-empty{display:grid;justify-items:start;gap:12px;max-width:520px;padding:24px 0}
.co-empty > .ic{width:48px;height:48px;color:var(--ink-soft)}
.co-empty > p{color:var(--ink-soft)}
.co-done{display:grid;justify-items:center;gap:16px;max-width:640px;margin:0 auto;padding:6px 0 12px;text-align:center}
.co-done h2{margin:0;padding:0;font:800 clamp(28px,4vw,38px)/1.08 var(--f-display);letter-spacing:-.025em}
.co-lead{max-width:46ch;color:var(--ink-soft);font-size:17px}
.co-tickw{position:relative;width:92px;height:92px}
.co-tickw::after{content:"";position:absolute;inset:0;border-radius:50%;box-shadow:0 0 0 3px var(--good);opacity:0;animation:co-ripple .9s .5s ease-out}
.co-tick{display:block;width:100%;height:100%;animation:co-pop .55s cubic-bezier(.2,.9,.3,1.3) both}
.co-tick circle{fill:var(--good);stroke:var(--good);stroke-width:3;stroke-dasharray:183;animation:co-ring .55s ease-out both,co-fillin .3s .45s ease-out both}
.co-tick path{fill:none;stroke:var(--surface);stroke-width:5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:38;animation:co-draw .4s .62s ease-out both}
.co-quiet .co-tick,.co-quiet .co-tick circle,.co-quiet .co-tick path,.co-quiet .co-tickw::after{animation:none}
.co-facts{width:100%;margin:4px 0 0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;text-align:left}
.co-facts > div{padding:12px 14px;border-radius:12px;background:var(--surface-2);min-width:0}
.co-facts dt{font-size:13px;color:var(--ink-soft)}
.co-facts dd{margin:2px 0 0;display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;font-weight:700;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.co-sel{user-select:all}
.co-transfer{width:100%;display:grid;gap:8px;padding:16px;border-radius:14px;border:1.5px solid var(--line);text-align:left}
.co-transfer h3{margin:0;font:800 18px/1.2 var(--f-display)}
.co-kv{margin:0;display:grid}
.co-kv > div{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:2px 12px;min-height:46px;padding:4px 0;border-bottom:1px solid var(--line)}
.co-kv > div:last-child{border-bottom:0}
.co-kv dt{color:var(--ink-soft);font-size:14px}
.co-kv dd{margin:0 0 0 auto;display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:0 4px;font-weight:700;font-variant-numeric:tabular-nums;text-align:right;overflow-wrap:anywhere}
.co-done-items{width:100%;text-align:left;padding:2px 16px;border-radius:14px;border:1.5px solid var(--line)}
.co-done-items .sum{padding-bottom:12px}
.co-done .demo-note{width:100%}
.co-done-btns{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;width:100%}
.co-done-btns .btn{flex:0 1 240px}
.co-guest{width:100%;display:flex;flex-wrap:wrap;align-items:center;gap:12px 14px;padding:14px 16px;border-radius:14px;background:var(--surface-2);text-align:left}
.co-guest > .ic{color:var(--link);width:28px;height:28px}
.co-guest > div{flex:1 1 220px;display:grid;gap:2px}
.co-guest .btn{background:var(--surface)}
.co-auth .dlg{display:grid;gap:14px}
.co-auth .dlg h2{margin:0;padding:0}
.co-auth-body{display:grid;gap:14px}
.co-bank{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;background:var(--surface-2)}
.co-bank > .ic{width:42px;height:42px;padding:9px;border-radius:12px;background:var(--surface);color:var(--link)}
.co-bank b{display:block}
.co-bank span{font-size:13px;color:var(--ink-soft)}
.co-auth-btns{display:flex;flex-wrap:wrap;gap:10px;margin-top:4px}
.co-auth-btns .btn{flex:1 1 180px}
@keyframes co-in-r{from{opacity:0;transform:translateX(28px)}}
@keyframes co-in-l{from{opacity:0;transform:translateX(-28px)}}
@keyframes co-drop{from{opacity:0;transform:translateY(-6px)}}
@keyframes co-fade{from{opacity:0}}
@keyframes co-pop{0%{transform:scale(.55);opacity:0}70%{transform:scale(1.08);opacity:1}100%{transform:none}}
@keyframes co-bump{40%{transform:scale(1.12)}}
@keyframes co-shake{20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(3px)}}
@keyframes co-spin{to{transform:rotate(360deg)}}
@keyframes co-blink{50%{box-shadow:inset 0 0 0 6px color-mix(in oklab,var(--link) 35%,transparent)}}
@keyframes co-ring{from{stroke-dashoffset:183}}
@keyframes co-fillin{from{fill:transparent}}
@keyframes co-draw{from{stroke-dashoffset:38}}
@keyframes co-ripple{from{opacity:.6;transform:scale(1)}to{opacity:0;transform:scale(1.6)}}
@media (max-width:560px){
  #dlgCheckout{width:100%;height:100%;max-height:100%;border-radius:0}
  .co-head{padding:calc(8px + env(safe-area-inset-top,0px)) 16px 0}
  .co-head .x{top:calc(6px + env(safe-area-inset-top,0px))}
  .co-body{padding:18px 16px 24px}
  .co-foot{padding-inline:16px;gap:10px}
  .co-back{width:46px;padding:0;flex:none}
  .co-back span{display:none}
  .co-next{min-width:0}
  .co-last .co-ftot{display:none}
  .co-last .co-next{flex:1;line-height:1.2;padding-block:8px}
  .co-pair{grid-template-columns:1fr}
  .co-pair-s{grid-template-columns:repeat(2,minmax(0,1fr))}
  .co-methods{grid-template-columns:1fr}
  .co-facts > div{padding:10px 12px}
  .co-test{padding:12px}
  .co-copy{width:44px;padding:0;justify-content:center}
  .co-copy span{display:none}
  .co-prog button{font-size:12px}
  .co-auth-btns{flex-direction:column-reverse}
  .co-auth-btns .btn{flex:none;width:100%}
}
@media (max-width:420px){
  .co-lg{display:none}
  .co-sm{display:inline}
}
@media (max-width:380px){
  .co-facts{grid-template-columns:1fr}
}
@media (max-height:560px){
  .co-prog button{min-height:48px;padding-top:6px}
  .co-stepl{display:none}
  .co-track{top:22px}
}
`;

// Notlösung: app.js startet die Module derzeit, bevor die defer-Skripte der Module geladen sind.
// Hat bis dahin niemand init() aufgerufen, startet die Kasse selbst. init() ist gegen doppelten Aufruf geschützt.
function selfStart() {
  setTimeout(() => {
    if (dlg() || !F.util || !F.shop || !F.db) return;
    Promise.resolve(F.db.ready).then(() => (dlg() ? null : init())).catch(err => console.error('Modul checkout:', err));
  }, 0);
}

F.checkout = { init, open };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', selfStart, { once: true });
else selfStart();
})();
