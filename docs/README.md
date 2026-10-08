# Fundus Marktplatz

Ein Online-Shop im Stil von Amazon und Etsy: Alltagsprodukte und Handgemachtes in einem Warenkorb.
Alles steckt in einer einzigen Datei (`index.html`), es gibt nichts zu installieren oder zu bauen.

## Was die Seite kann

- Suche, Kategorien, Filter (Handgemacht, Morgen da, Angebote) und Sortierung
- Produktdetails, Merkzettel, Warenkorb mit Versandkosten-Anzeige und Kasse (Demo, es wird nichts bestellt)
- Eigene Artikel einstellen wie bei Etsy („Artikel einstellen“)
- **App herunterladen:** Die Seite ist eine installierbare Web-App (PWA). Über „App laden“ landet Fundus
  mit eigenem Symbol auf dem Startbildschirm von iPad, iPhone, Android oder Computer und läuft auch offline.

Warenkorb, Merkzettel und eigene Artikel werden im Browser des Geräts gespeichert.

## Online stellen (optional)

Damit die App-Installation mit Offline-Modus funktioniert, muss die Seite über `https` erreichbar sein.
Am einfachsten mit GitHub Pages: im Repository unter **Settings → Pages** als Quelle den Branch und den
Ordner `/docs` wählen und speichern. Nach etwa einer Minute ist der Shop unter der angezeigten Adresse online.

## Dateien

| Datei | Zweck |
| --- | --- |
| `index.html` | Der komplette Shop (Aussehen, Produkte, Logik) |
| `manifest.webmanifest` | Name, Farben und Symbole der App |
| `sw.js` | Service Worker für den Offline-Modus |
| `icons/` | App-Symbole |
