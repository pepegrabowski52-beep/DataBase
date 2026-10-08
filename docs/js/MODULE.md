# Fundus – Module und Schnittstellen

Der Shop ist eine statische Seite (GitHub Pages) ohne Server. Alle Daten liegen über `js/db.js`
im Browser des Geräts. Die Schnittstelle ist asynchron, damit später ein echter Server dieselbe
Rolle übernehmen kann.

Die Skripte laden in dieser Reihenfolge (alle mit `defer`):

| Datei | Inhalt | Stellt bereit |
| --- | --- | --- |
| `js/art.js` | Icons, Produkt-Illustrationen | `Fundus.icons`, `Fundus.ic(name)`, `Fundus.art` |
| `js/db.js` | Datenhaltung, Startdaten | `Fundus.db` |
| `js/app.js` | Kern: Ereignisse, Katalog, Warenkorb, Produktansicht, Installation, Updates | `Fundus.on/emit`, `Fundus.util`, `Fundus.shop` |
| `js/fx.js` | Animationen | `Fundus.fx` |
| `js/auth.js` | Registrieren, Anmelden, Konto | `Fundus.auth` |
| `js/checkout.js` | Kasse und Zahlung (Testmodus) | `Fundus.checkout` |
| `js/admin.js` | Verwaltung für Admins und Verkäufer | `Fundus.admin` |

Beim Start ruft `app.js` nach `Fundus.db.ready` nacheinander `fx.init()`, `auth.init()`,
`checkout.init()` und `admin.init()` auf (jeweils `await`), rendert dann den Shop und sendet `ready`.
Ein Modul hängt sich so an:

```js
(() => {
  'use strict';
  const F = window.Fundus = window.Fundus || {};
  F.auth = { init, current, /* ... */ };
  async function init() { /* Dialoge anlegen, Styles einfügen, Ereignisse abonnieren */ }
})();
```

Im Modul-Scope dürfen nur Konstanten und Funktionen stehen. `F.util`, `F.shop` und `F.db`
existieren beim Laden schon (app.js lädt vorher), Daten aber erst ab `init()`.

## Fundus.util

`$`, `$$`, `esc(text)` (HTML-Escaping, für **alle** Nutzerdaten Pflicht), `eur` (Intl.NumberFormat),
`dec1`, `int`, `dayFmt`, `dateFmt`, `dateTimeFmt`, `reduced()` (bevorzugt reduzierte Bewegung),
`uid(prefix)`, `round2(n)`, `ic(name)`, `toast(html, {label, run}?, {type:'ok'|'err', duration}?)`,
`openDlg(dialog)`, `closeAll()`, `wireDialog(dialog)` (Klick auf den Hintergrund schließt),
`plusWorkdays(n, from?)`, `fastDate()`, `stdRange()`, `safeImg(url)` (nur `data:image/…;base64` oder `https:`),
`store.get/set` (localStorage mit try/catch),
`env = { inApp, appVersion, isStandalone(), platform(), notInstallableHere }`.

`env.inApp` ist wahr in der Android-App (WebView, Version 1.0). Dort funktionieren
`<input type="file">` und Downloads **nicht**. Datei-Uploads dort ausblenden und eine Alternative anbieten.

Der Toast erscheint automatisch über dem obersten offenen Dialog.

## Fundus.shop

```
CATS                      { elektronik: 'Elektronik', ... }
STATUS                    { paid: {label, tone}, ... } Bestellstatus
                          pending_payment, paid, processing, shipped, delivered, cancelled, refunded
statusPill(status)        HTML-Pille für einen Status
PAYMENT                   { card: 'Kreditkarte', paypal: 'PayPal', sepa: 'Lastschrift', invoice: 'Rechnung' }
products()                Kopie aller Produkte (auch inaktive)
byId(id), stockOf(p)
settings()                aktuelle Einstellungen (synchron, siehe db.settings)
cart.lines()              [{ p, q }]
cart.count(), cart.add(id, n, sourceEl), cart.set(id, qty), cart.clear()
cart.totals({ express, coupon })  -> { sub, discount, ship, total, count }
openCart(), openProduct(id), openCheckout(), render(), refresh(), resetFilters(), toShop()
ui.card(p, { preview: true }), ui.rating(p), ui.priceHTML(p), ui.stockHTML(p), ui.delivery(p), ui.stars(r), ui.pct(p), ui.art(p)
```

`ui.art(p)` liefert ein Foto (`p.img`) oder die Illustration (`p.pic`, `p.c`, `p.d`).

## Fundus.db (asynchron)

```
ready                                  Promise
products.all() / get(id) / save(p) / remove(id)
users.all() / get(id) / byEmail(email) / save(u) / remove(id)
orders.all() / get(id) / byUser(userId) / save(o) / remove(id)
settings.get() / save(s)
session.get() / set(userId | null)
exportAll() / importAll(data) / reset() / removeDemo()
newOrderId()                           'FD-2026-12345'
volatile                               true, wenn nichts gespeichert werden kann
CATS
```

`save()` vergibt `id`, `createdAt`, `updatedAt` und gibt den gespeicherten Datensatz zurück.
Ist der Speicher voll, wirft `save()` einen Fehler mit deutscher Meldung: abfangen und per Toast zeigen.

### Datensätze

```
Produkt  { id, name, seller, sellerId|null, city, cat, price, old?, stock, rating, reviews,
           handmade, express, badge?, pic, c, d, tint, img?, desc, facts: [[k, v]], active,
           createdAt, updatedAt }
Nutzer   { id, email (klein), name, role: 'admin'|'seller'|'customer', shopName?, city?,
           pw: { hash, salt, iter }, addresses: [{ id, name, street, zip, city }],
           blocked?, createdAt, updatedAt }
Bestellung { id: 'FD-…', userId|null, email, name, address: { name, street, zip, city },
           items: [{ productId, name, price, qty, sellerId?, pic, c, d, tint, img? }],
           subtotal, discount, shipping, total, coupon?, shipMethod: 'std'|'exp',
           payment: { method: 'card'|'paypal'|'sepa'|'invoice', brand?, last4?, status: 'paid'|'pending'|'refunded'|'failed', txn },
           status, history: [{ status, at, note? }], eta?, demo?, createdAt, updatedAt }
Einstellungen { shopName, freeShipping, shipping, express, commission,
           coupons: [{ code, type: 'percent'|'fixed', value, minTotal, active, note }] }
```

`demo: true` markiert die Beispielbestellungen, `db.removeDemo()` entfernt sie.

## Ereignisse (`Fundus.on(type, fn)`)

| Ereignis | Daten | Auslöser |
| --- | --- | --- |
| `ready` | – | Kern fertig gestartet |
| `grid:render` | `{ grid, count }` | Produktliste neu gezeichnet |
| `cart:add` | `{ id, qty, el }` | Artikel in den Warenkorb (`el` = Bild oder Knopf, für Animationen) |
| `cart:change` | `{ count }` | Warenkorb geändert |
| `fav:toggle` | `{ id, on, el }` | Merkzettel |
| `dialog:open` | `{ dlg }` | Dialog über `openDlg` geöffnet |
| `session` | `{ user }` | An- oder Abmeldung (auth.js sendet) |
| `order:placed` | `{ order }` | Bestellung abgeschlossen (checkout.js sendet) |
| `products:change`, `users:change`, `orders:change`, `settings:change` | `{ id?, record?, removed? }` | db |

## Fundus.auth (auth.js)

```
init()                         Sitzung wiederherstellen, dann emit('session', { user })
current()                      angemeldeter Nutzer ohne Passwortdaten oder null (synchron)
isAdmin()
requireLogin(reason?)          Promise<user|null>: öffnet Anmelden/Registrieren, null bei Abbruch
openAccount(tab?)              'overview' | 'orders' | 'addresses' | 'settings'; abgemeldet: Anmelden
logout()
update(patch)                  eigene Daten ändern (Name, Adressen, Rolle 'seller' + shopName)
```

Wer sich auf einem Gerät als Erster registriert, wird Admin.

## Fundus.checkout (checkout.js)

`init()`, `open()`. Erzeugt die Bestellung, zieht den Bestand ab, leert den Warenkorb und sendet `order:placed`.

## Fundus.admin (admin.js)

`init()`, `open(section, id?)`. Mögliche Werte für `section`: `dashboard`, `products`, `new-product`, `edit-product` (mit `id`),
`orders`, `customers`, `settings`. Admins sehen alles. Verkäufer sehen nur eigene Artikel und Bestellungen
mit eigenen Artikeln. Kunden können über `new-product` Verkäufer werden.

## Fundus.fx (fx.js)

`init()`, `flyToCart(el)`, `bump(el)`, `burst(el)`, `confetti()`, `countUp(el, to, format?)`, `stagger(container, selector)`.
Bei `reduced()` sind alle Funktionen sofort fertig, ohne Bewegung.

## Gestaltung

- Farben nur über die Tokens in `index.html` (`--bg`, `--surface`, `--surface-2`, `--ink`, `--ink-soft`, `--line`,
  `--brand`, `--brand-ink`, `--link`, `--accent`, `--accent-ink`, `--sale`, `--sale-ink`, `--good`, `--star`, `--shadow`).
  Hell und dunkel funktionieren dann automatisch.
- Schriften: `var(--f-display)` für Überschriften und Preise, `var(--f-body)` für Text.
- Vorhandene Klassen nutzen: `.btn` (`.dark`, `.ghost`, `.line`, `.wide`, `.small`, `.danger`), `.linkbtn`, `.field`, `.inp`,
  `.two`, `.opts`/`.opt`, `.hint`, `.hint.err`, `.lbl`, `.sum`, `.demo-note`, `.pill`, `.stepper`, `.tabs`, `.x`,
  `.picks`/`.pick`, `.swatches`/`.swatch`, `.eyebrow`, Dialoge (`dialog`, `dialog.narrow`, `dialog.drawer`, `.dlg`).
- Eigene Styles fügt jedes Modul in `init()` als `<style id="<modul>-style">` ein. Klassen mit Modul-Präfix
  (`.au-`, `.co-`, `.ad-`, `.fx-`), damit nichts kollidiert.
- Tablet zuerst, aber ab 360 px Breite nutzbar. Tippflächen mindestens 44 px.
- Texte auf Deutsch, in der Du-Form, kurz und klar.
