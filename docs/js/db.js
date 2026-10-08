/* Fundus – Datenhaltung.
 *
 * Alle Methoden sind asynchron (Promise), damit später ein echter Server (z. B. Supabase)
 * dieselbe Schnittstelle bedienen kann. Aktuell liegen die Daten im Browser (localStorage)
 * dieses Geräts. Ist kein Speicher verfügbar, laufen sie nur im Arbeitsspeicher (db.volatile).
 *
 * Fundus.db = {
 *   ready: Promise,
 *   products: { all(), get(id), save(p), remove(id) },
 *   users:    { all(), get(id), byEmail(email), save(u), remove(id) },
 *   orders:   { all(), get(id), byUser(userId), save(o), remove(id) },
 *   settings: { get(), save(s) },
 *   session:  { get(), set(userId|null) },
 *   exportAll(), importAll(data), reset(), removeDemo(),
 *   volatile: boolean, CATS, newOrderId()
 * }
 * Änderungen lösen Ereignisse aus: 'products:change', 'users:change', 'orders:change',
 * 'settings:change' mit { id, record, removed }.
 */
(() => {
'use strict';
const F = window.Fundus = window.Fundus || {};

const CATS = { elektronik: 'Elektronik', kueche: 'Küche', wohnen: 'Wohnen', mode: 'Mode & Schmuck', garten: 'Garten', buecher: 'Bücher', spielzeug: 'Spielzeug' };

const SEED_PRODUCTS = [
  { id: 'p1', stock: 14, name: 'Steinzeug-Tasse »Moos«, 350 ml', seller: 'Töpferei Lindner', city: 'Leipzig', cat: 'kueche', price: 24.9, rating: 4.8, reviews: 312, handmade: true, badge: 'Bestseller', pic: 'mug', c: '#5E7F5B', d: '#D9CBB0', tint: '#E5EEDD',
    desc: 'Auf der Drehscheibe gedreht und mit einer moosgrünen Laufglasur überzogen. Jede Tasse ist ein Einzelstück, die Farbverläufe variieren leicht.',
    facts: [['Material', 'Steinzeug, bleifrei glasiert'], ['Inhalt', '350 ml'], ['Pflege', 'spülmaschinenfest'], ['Versand aus', 'Leipzig']] },
  { id: 'p2', stock: 40, name: 'Kabellose Kopfhörer mit Geräuschunterdrückung', seller: 'SoundKontor', city: 'Hamburg', cat: 'elektronik', price: 89.99, old: 129.99, rating: 4.5, reviews: 2841, express: true, pic: 'headphones', c: '#2F3A45', d: '#9FB3C8', tint: '#E2E8EF',
    desc: 'Aktive Geräuschunterdrückung, 40 Stunden Akkulaufzeit und Schnellladen über USB-C: 10 Minuten Laden reichen für 5 Stunden Musik.',
    facts: [['Akkulaufzeit', 'bis 40 h'], ['Anschluss', 'Bluetooth 5.3, USB-C'], ['Gewicht', '254 g'], ['Garantie', '2 Jahre']] },
  { id: 'p3', stock: 22, name: 'Duftkerze »Waldboden« aus Sojawachs', seller: 'Lichtwerk', city: 'Kassel', cat: 'wohnen', price: 18.5, rating: 4.9, reviews: 654, handmade: true, pic: 'candle', c: '#B9783A', d: '#F3E7D3', tint: '#F5E9DA',
    desc: 'Handgegossen aus Sojawachs mit Baumwolldocht. Duftnoten von Zedernholz, Moos und einem Hauch Vetiver. Brenndauer etwa 45 Stunden.',
    facts: [['Wachs', '100 % Sojawachs'], ['Brenndauer', 'ca. 45 h'], ['Gewicht', '220 g'], ['Versand aus', 'Kassel']] },
  { id: 'p4', stock: 6, name: 'Monstera deliciosa, 60 cm, im Keramiktopf', seller: 'Grünzeug Gärtnerei', city: 'Bremen', cat: 'garten', price: 39, rating: 4.6, reviews: 428, pic: 'plant', c: '#D8D2C4', d: '#2F7A4F', tint: '#E3EFE4',
    desc: 'Pflegeleichte Zimmerpflanze mit den typisch geschlitzten Blättern. Kommt gut verpackt in einem hellen Keramiktopf.',
    facts: [['Höhe', 'ca. 60 cm inkl. Topf'], ['Topf', 'Ø 17 cm, Keramik'], ['Standort', 'hell, keine pralle Sonne'], ['Versand', 'im Pflanzenkarton']] },
  { id: 'p5', stock: 18, name: 'Rolltop-Rucksack 25 l, wasserabweisend', seller: 'Nordpack', city: 'Kiel', cat: 'mode', price: 69.95, old: 84.95, rating: 4.7, reviews: 1103, express: true, pic: 'backpack', c: '#C4572F', d: '#8E3B1E', tint: '#F6E3D9',
    desc: 'Robuster Rucksack aus recyceltem Planenstoff mit gepolstertem Laptopfach bis 15 Zoll. Der Rolltop lässt sich auf 30 Liter erweitern.',
    facts: [['Volumen', '25–30 l'], ['Material', 'recyceltes PET, PU-beschichtet'], ['Laptopfach', 'bis 15″'], ['Gewicht', '780 g']] },
  { id: 'p6', stock: 3, name: 'Kette mit Mondstein-Anhänger, 925 Silber', seller: 'Atelier Mira', city: 'Freiburg', cat: 'mode', price: 54, rating: 4.9, reviews: 276, handmade: true, pic: 'necklace', c: '#A7AFB5', d: '#D6E4F2', tint: '#E9ECF4',
    desc: 'Ein in Silber gefasster Regenbogen-Mondstein an einer feinen Ankerkette. Von Hand gefertigt und in einer Geschenkschachtel verpackt.',
    facts: [['Material', '925 Sterlingsilber'], ['Kettenlänge', '45 cm, verstellbar'], ['Stein', 'Mondstein, 10 mm'], ['Versand aus', 'Freiburg']] },
  { id: 'p7', stock: 55, name: 'Die Vermessung der Wolken – Roman, gebunden', seller: 'Buchhandlung am Markt', city: 'Münster', cat: 'buecher', price: 22, rating: 4.4, reviews: 189, express: true, pic: 'book', c: '#2D4D7A', d: '#F1D9A7', tint: '#E1E8F2',
    desc: 'Eine Meteorologin kehrt in ihr Heimatdorf an der Küste zurück und beginnt, die Wolken über dem Watt zu katalogisieren. Ein leiser Roman über Herkunft und Wetter.',
    facts: [['Seiten', '384'], ['Einband', 'Hardcover mit Lesebändchen'], ['Sprache', 'Deutsch'], ['Erschienen', 'September 2026']] },
  { id: 'p8', stock: 4, name: 'Tischleuchte aus Messing mit Leinenschirm', seller: 'Werkhaus Licht', city: 'Dresden', cat: 'wohnen', price: 119, old: 149, rating: 4.6, reviews: 97, pic: 'lamp', c: '#E9DFC9', d: '#B98B3E', tint: '#F1ECE0',
    desc: 'Gebürsteter Messingfuß mit naturfarbenem Leinenschirm. Warmes, blendfreies Licht für Schreibtisch und Nachttisch.',
    facts: [['Höhe', '46 cm'], ['Fassung', 'E27, max. 40 W'], ['Kabel', '1,8 m Textilkabel mit Schalter'], ['Leuchtmittel', 'nicht enthalten']] },
  { id: 'p9', stock: 31, name: 'Laufschuh »Leicht 2.0«, Damen & Herren', seller: 'Laufwerk', city: 'Nürnberg', cat: 'mode', price: 99.9, rating: 4.3, reviews: 1532, express: true, pic: 'sneaker', c: '#3E6FB0', d: '#F0B429', tint: '#E2EAF5',
    desc: 'Leichter Neutralschuh mit gedämpfter Mittelsohle und atmungsaktivem Mesh-Obermaterial. Für Strecken von 5 bis 21 Kilometern.',
    facts: [['Gewicht', '248 g (Gr. 42)'], ['Sprengung', '8 mm'], ['Größen', '36–47'], ['Rückgabe', '30 Tage kostenlos']] },
  { id: 'p10', stock: 27, name: 'Smartwatch mit GPS und Pulsmessung', seller: 'Taktgeber', city: 'München', cat: 'elektronik', price: 149, old: 199, rating: 4.4, reviews: 3920, express: true, pic: 'watch', c: '#4A5D52', d: '#7BD389', tint: '#E3ECE6',
    desc: 'Misst Puls, Schlaf und Schritte, zeichnet Läufe per GPS auf und hält bis zu 12 Tage durch. Wasserdicht bis 50 Meter.',
    facts: [['Akku', 'bis 12 Tage'], ['Display', '1,4″ AMOLED'], ['Wasserdicht', '5 ATM'], ['Kompatibel', 'Android & iOS']] },
  { id: 'p11', stock: 2, name: 'Strickmütze aus Merinowolle, handgestrickt', seller: 'Wollwerk Inge', city: 'Lüneburg', cat: 'mode', price: 32, rating: 5.0, reviews: 143, handmade: true, pic: 'beanie', c: '#C9A227', d: '#F2EDE2', tint: '#F5EED8',
    desc: 'Von Hand gestrickt aus weicher, nicht kratzender Merinowolle, mit breitem Rippbündchen und dickem Bommel.',
    facts: [['Material', '100 % Merinowolle'], ['Größe', 'Einheitsgröße, dehnbar'], ['Pflege', 'Handwäsche, 30 °C'], ['Versand aus', 'Lüneburg']] },
  { id: 'p12', stock: 12, name: 'Teekanne aus Gusseisen, 0,9 l', seller: 'Teehaus Kirschblüte', city: 'Köln', cat: 'kueche', price: 45.9, rating: 4.7, reviews: 508, pic: 'teapot', c: '#34403D', d: '#8C9A93', tint: '#E4E9E7',
    desc: 'Emaillierte Gusseisenkanne mit herausnehmbarem Edelstahlsieb. Hält Tee lange warm, für grünen und schwarzen Tee.',
    facts: [['Inhalt', '0,9 l'], ['Material', 'Gusseisen, innen emailliert'], ['Sieb', 'Edelstahl, herausnehmbar'], ['Herd', 'nicht herdgeeignet']] },
  { id: 'p13', stock: 38, name: 'Bluetooth-Lautsprecher, wasserdicht', seller: 'SoundKontor', city: 'Hamburg', cat: 'elektronik', price: 49.99, old: 59.99, rating: 4.5, reviews: 2210, express: true, pic: 'speaker', c: '#2E6B6A', d: '#1C3F3E', tint: '#DDEDEC',
    desc: 'Kräftiger 360°-Klang, 16 Stunden Akku und Schutzklasse IP67. Zwei Lautsprecher lassen sich zu einem Stereopaar koppeln.',
    facts: [['Akku', 'bis 16 h'], ['Schutzklasse', 'IP67'], ['Leistung', '20 W'], ['Gewicht', '540 g']] },
  { id: 'p14', stock: 5, name: 'Salatschale aus Olivenholz, Ø 28 cm', seller: 'Holzkunst Brandt', city: 'Rosenheim', cat: 'kueche', price: 58, rating: 4.8, reviews: 221, handmade: true, pic: 'bowl', c: '#B48252', d: '#8A5A30', tint: '#F2E6D8',
    desc: 'Aus einem Stück Olivenholz gedrechselt und mit Leinöl behandelt. Jede Schale hat ihre eigene Maserung.',
    facts: [['Durchmesser', '28 cm'], ['Holz', 'Olivenholz'], ['Oberfläche', 'geölt, lebensmittelecht'], ['Pflege', 'von Hand spülen']] },
  { id: 'p15', stock: 9, name: 'Holzeisenbahn, Starter-Set mit 24 Teilen', seller: 'Kleine Werkstatt', city: 'Seiffen', cat: 'spielzeug', price: 34.9, rating: 4.9, reviews: 367, handmade: true, pic: 'train', c: '#C8463D', d: '#3D7DCA', tint: '#F5E1DE',
    desc: 'Lok, Waggon und 22 Schienenteile aus heimischer Buche, mit Wasserfarben lackiert. Passt zu den gängigen Holzbahnsystemen.',
    facts: [['Teile', '24'], ['Material', 'Buche, speichelfest lackiert'], ['Alter', 'ab 3 Jahren'], ['Versand aus', 'Seiffen im Erzgebirge']] },
  { id: 'p16', stock: 24, name: 'E-Reader 7″ mit warmem Licht', seller: 'Lesezeichen Tech', city: 'Berlin', cat: 'elektronik', price: 129, rating: 4.6, reviews: 1876, express: true, pic: 'ereader', c: '#26302C', d: '#EFE6D2', tint: '#E7E5DF',
    desc: 'Blendfreies 7-Zoll-Display mit einstellbarer Lichtfarbe, 32 GB Speicher und wochenlanger Akkulaufzeit. Wasserdicht nach IPX8.',
    facts: [['Display', '7″, 300 ppi'], ['Speicher', '32 GB'], ['Akku', 'bis 6 Wochen'], ['Wasserdicht', 'IPX8']] },
  { id: 'p17', stock: 16, name: 'Gießkanne aus verzinktem Stahl, 5 l', seller: 'Gartenhaus Meyer', city: 'Hannover', cat: 'garten', price: 27.5, rating: 4.5, reviews: 312, pic: 'can', c: '#9AA7A8', d: '#6E7B7C', tint: '#E6ECEA',
    desc: 'Klassische Gießkanne mit abnehmbarer Messingbrause. Feuerverzinkt und dadurch rostfrei für viele Jahre.',
    facts: [['Inhalt', '5 l'], ['Material', 'feuerverzinkter Stahl'], ['Brause', 'Messing, abnehmbar'], ['Gewicht', '1,3 kg']] },
  { id: 'p18', stock: 7, name: 'Leinen-Tischdecke, 140 × 220 cm', seller: 'Webstube Ostsee', city: 'Rostock', cat: 'wohnen', price: 64, rating: 4.7, reviews: 88, handmade: true, pic: 'linen', c: '#7E9AB0', d: '#E8E1D3', tint: '#E5EAF0',
    desc: 'Auf dem Webstuhl gewebt aus reinem, vorgewaschenem Leinen. Weich im Griff und mit jeder Wäsche schöner.',
    facts: [['Maße', '140 × 220 cm'], ['Material', '100 % Leinen'], ['Pflege', 'Maschinenwäsche 40 °C'], ['Versand aus', 'Rostock']] }
];

const DEFAULT_SETTINGS = {
  shopName: 'Fundus',
  freeShipping: 29,
  shipping: 3.99,
  express: 4.99,
  commission: 6.5,
  coupons: [
    { code: 'HERBST10', type: 'percent', value: 10, minTotal: 0, active: true, note: 'Herbstmarkt, 10 % auf alles' },
    { code: 'WILLKOMMEN5', type: 'fixed', value: 5, minTotal: 25, active: true, note: '5 € ab 25 € Bestellwert' }
  ]
};

const PREFIX = 'fundus.v2.';
const NAMES = ['products', 'users', 'orders'];
const state = { products: [], users: [], orders: [], settings: null, session: null };
const db = { volatile: false, CATS };

const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const emit = (type, detail) => { if (typeof F.emit === 'function') F.emit(type, detail); };

function read(name, fallback) {
  try {
    const v = localStorage.getItem(PREFIX + name);
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    db.volatile = true;
    return fallback;
  }
}
function persist(name) {
  if (db.volatile) return;
  try {
    localStorage.setItem(PREFIX + name, JSON.stringify(state[name]));
  } catch (e) {
    if (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)) {
      throw new Error('Der Speicher dieses Geräts ist voll. Entferne Bilder oder ältere Daten und versuche es noch einmal.');
    }
    db.volatile = true; // Speicher gesperrt (z. B. privater Modus): im Arbeitsspeicher weiterarbeiten
  }
}
// Änderung anwenden; schlägt das Speichern fehl, wird sie zurückgenommen
function commit(name, mutate) {
  const before = clone(state[name]);
  mutate();
  try { persist(name); } catch (e) { state[name] = before; throw e; }
}

function collection(name, prefix) {
  return {
    async all() { return clone(state[name]); },
    async get(id) { return clone(state[name].find(r => r.id === id) || null); },
    async save(rec) {
      if (!rec || typeof rec !== 'object') throw new Error('Ungültiger Datensatz.');
      const now = new Date().toISOString();
      const r = clone(rec);
      if (!r.id) r.id = uid(prefix);
      if (!r.createdAt) r.createdAt = now;
      r.updatedAt = now;
      commit(name, () => {
        const i = state[name].findIndex(x => x.id === r.id);
        if (i >= 0) state[name][i] = r; else state[name].unshift(r);
      });
      emit(name + ':change', { id: r.id, record: clone(r) });
      return clone(r);
    },
    async remove(id) {
      commit(name, () => { state[name] = state[name].filter(x => x.id !== id); });
      emit(name + ':change', { id, removed: true });
    }
  };
}

db.products = collection('products', 'p');
db.users = collection('users', 'u');
db.users.byEmail = async email => clone(state.users.find(u => u.email === String(email || '').trim().toLowerCase()) || null);
db.orders = collection('orders', 'o');
db.orders.byUser = async userId => clone(state.orders.filter(o => o.userId === userId));
db.settings = {
  async get() { return clone(state.settings); },
  async save(s) {
    const before = state.settings;
    state.settings = Object.assign({}, DEFAULT_SETTINGS, clone(s));
    try { persist('settings'); } catch (e) { state.settings = before; throw e; }
    emit('settings:change', { record: clone(state.settings) });
    return clone(state.settings);
  }
};
db.session = {
  async get() { return state.session; },
  async set(userId) {
    state.session = userId || null;
    try { persist('session'); } catch (e) { /* Sitzung muss nicht dauerhaft sein */ }
  }
};

db.newOrderId = () => `FD-${new Date().getFullYear()}-${String(Math.floor(10000 + Math.random() * 89999))}`;

/* ---------- Beispielbestellungen für das Dashboard ---------- */
function demoOrders() {
  const people = [
    ['Lena Hoffmann', 'Leipzig', '04109'], ['Jonas Becker', 'Köln', '50667'], ['Mia Schulz', 'Hamburg', '20095'],
    ['Paul Wagner', 'München', '80331'], ['Emma Richter', 'Dresden', '01067'], ['Ben Krüger', 'Bremen', '28195'],
    ['Lina Wolf', 'Freiburg', '79098'], ['Noah Braun', 'Kiel', '24103']
  ];
  const statuses = ['delivered', 'delivered', 'delivered', 'shipped', 'shipped', 'paid', 'paid', 'processing'];
  const methods = [['card', 'Visa', '4242'], ['paypal'], ['invoice'], ['card', 'Mastercard', '4444'], ['sepa']];
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const out = [];
  for (let i = 0; i < 16; i++) {
    const daysAgo = Math.floor(i * 0.9 + rnd() * 1.5);
    const at = new Date(Date.now() - daysAgo * 864e5 - rnd() * 8 * 36e5);
    const [name, city, zip] = people[i % people.length];
    const n = 1 + Math.floor(rnd() * 3);
    const items = [];
    for (let k = 0; k < n; k++) {
      const p = SEED_PRODUCTS[Math.floor(rnd() * SEED_PRODUCTS.length)];
      if (items.some(x => x.productId === p.id)) continue;
      items.push({ productId: p.id, name: p.name, price: p.price, qty: 1 + Math.floor(rnd() * 2), pic: p.pic, c: p.c, d: p.d, tint: p.tint });
    }
    const subtotal = Math.round(items.reduce((a, x) => a + x.price * x.qty, 0) * 100) / 100;
    const shipping = subtotal >= DEFAULT_SETTINGS.freeShipping ? 0 : DEFAULT_SETTINGS.shipping;
    const status = daysAgo > 5 ? 'delivered' : statuses[i % statuses.length];
    const m = methods[i % methods.length];
    const created = at.toISOString();
    const history = [{ status: 'paid', at: created, note: 'Zahlung eingegangen' }];
    if (['processing', 'shipped', 'delivered'].includes(status)) history.push({ status: 'processing', at: new Date(at.getTime() + 36e5 * 3).toISOString() });
    if (['shipped', 'delivered'].includes(status)) history.push({ status: 'shipped', at: new Date(at.getTime() + 864e5).toISOString(), note: 'Sendungsnummer 00340434' + (161094000 + i) });
    if (status === 'delivered') history.push({ status: 'delivered', at: new Date(at.getTime() + 864e5 * 2.5).toISOString() });
    out.push({
      id: `FD-${at.getFullYear()}-${String(20417 + i * 613).padStart(5, '0')}`,
      demo: true, userId: null,
      name, email: name.split(' ')[0].toLowerCase() + '@example.com',
      address: { name, street: 'Musterweg ' + (3 + i), zip, city },
      items, subtotal, shipping, discount: 0, total: Math.round((subtotal + shipping) * 100) / 100,
      shipMethod: 'std',
      payment: { method: m[0], brand: m[1] || null, last4: m[2] || null, status: m[0] === 'invoice' && status === 'paid' ? 'pending' : 'paid', txn: 'test_' + (1000 + i) },
      status, history, createdAt: created, updatedAt: created
    });
  }
  return out;
}

function seed() {
  const now = new Date().toISOString();
  state.products = SEED_PRODUCTS.map((p, i) => Object.assign({ active: true, sellerId: null, createdAt: new Date(Date.now() - (60 - i) * 864e5).toISOString(), updatedAt: now }, clone(p)));
  // Artikel, die mit der ersten Version über „Artikel einstellen“ angelegt wurden, übernehmen
  try {
    const own = JSON.parse(localStorage.getItem('fundus.own') || '[]');
    if (Array.isArray(own)) {
      own.forEach(p => {
        if (!p || !p.id || state.products.some(x => x.id === p.id)) return;
        state.products.unshift(Object.assign({ stock: 10, active: true, sellerId: null }, p, { own: undefined }));
      });
    }
  } catch (e) { /* nichts zu übernehmen */ }
  state.orders = demoOrders();
  state.users = [];
  state.settings = clone(DEFAULT_SETTINGS);
  NAMES.concat('settings').forEach(n => { try { persist(n); } catch (e) { /* weiter im Speicher */ } });
}

db.ready = (async () => {
  const products = read('products', null);
  if (!Array.isArray(products)) {
    seed();
  } else {
    state.products = products;
    state.users = read('users', []);
    state.orders = read('orders', []);
    state.settings = Object.assign({}, DEFAULT_SETTINGS, read('settings', {}));
  }
  state.session = read('session', null);
  if (state.session && !state.users.some(u => u.id === state.session)) state.session = null;
  return db;
})();

db.exportAll = async () => ({
  format: 'fundus-backup', version: 2, exportedAt: new Date().toISOString(),
  products: clone(state.products), users: clone(state.users), orders: clone(state.orders), settings: clone(state.settings)
});
db.importAll = async data => {
  if (!data || data.format !== 'fundus-backup' || !Array.isArray(data.products)) throw new Error('Das ist keine Fundus-Sicherung.');
  const before = clone({ products: state.products, users: state.users, orders: state.orders, settings: state.settings });
  try {
    state.products = clone(data.products);
    state.users = Array.isArray(data.users) ? clone(data.users) : [];
    state.orders = Array.isArray(data.orders) ? clone(data.orders) : [];
    state.settings = Object.assign({}, DEFAULT_SETTINGS, clone(data.settings || {}));
    NAMES.concat('settings').forEach(persist);
  } catch (e) {
    Object.assign(state, before);
    NAMES.concat('settings').forEach(n => { try { persist(n); } catch (x) { /* Zustand bleibt im Speicher */ } });
    throw e;
  }
  if (!state.users.some(u => u.id === state.session)) await db.session.set(null);
  ['products', 'users', 'orders', 'settings'].forEach(n => emit(n + ':change', {}));
};
db.reset = async () => {
  seed();
  await db.session.set(null);
  ['products', 'users', 'orders', 'settings'].forEach(n => emit(n + ':change', {}));
};
db.removeDemo = async () => {
  commit('orders', () => { state.orders = state.orders.filter(o => !o.demo); });
  emit('orders:change', {});
};

F.db = db;
})();
