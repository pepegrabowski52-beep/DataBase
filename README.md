# Fundus Marktplatz

Ein Online-Shop im Stil von Amazon und Etsy: Alltagsprodukte und Handgemachtes in einem Warenkorb.
Alles steckt in einer einzigen Datei (`index.html`), es gibt nichts zu installieren oder zu bauen.

## Was die Seite kann

- Suche, Kategorien, Filter (Handgemacht, Morgen da, Angebote) und Sortierung
- Produktdetails, Merkzettel, Warenkorb mit Versandkosten-Anzeige und Kasse (Demo, es wird nichts bestellt)
- Eigene Artikel einstellen wie bei Etsy („Artikel einstellen“)
- **App herunterladen:**
  - **Android:** echte App als Datei `fundus.apk` (unter 100 KB) zum Herunterladen und Installieren.
  - **Alle Geräte:** Die Seite ist außerdem eine installierbare Web-App (PWA). Über „App laden“ landet Fundus
    mit eigenem Symbol auf dem Startbildschirm von iPad, iPhone, Android oder Computer und läuft auch offline.

Warenkorb, Merkzettel und eigene Artikel werden im Browser des Geräts gespeichert.

## Online stellen (nötig für die App)

Die App lässt sich nur installieren, wenn der Shop unter einer eigenen `https`-Adresse läuft.
In der Claude-Vorschau oder als lokal geöffnete Datei geht das nicht.

Mit GitHub Pages (kostenlos):

1. Auf github.com das Repository öffnen und **Settings** antippen.
2. Links **Pages** wählen.
3. Bei **Branch** den Branch mit dem Shop und den Ordner **/docs** wählen, dann **Save**.
4. Nach ein bis zwei Minuten ist der Shop online unter
   `https://pepegrabowski52-beep.github.io/DataBase/`.

Dort installiert „App laden“ die App auf Android und am Computer mit einem Tipp.
Auf iPad und iPhone erlaubt Apple keinen Ein-Tipp-Download. Dort zeigt die Seite die drei Schritte
über **Teilen → Zum Home-Bildschirm**.

## Dateien

| Datei | Zweck |
| --- | --- |
| `index.html` | Der komplette Shop (Aussehen, Produkte, Logik) |
| `manifest.webmanifest` | Name, Farben und Symbole der App |
| `sw.js` | Service Worker für den Offline-Modus |
| `fundus.apk` | Android-App (gebaut aus dem Ordner `android/`) |
| `icons/` | App-Symbole |
