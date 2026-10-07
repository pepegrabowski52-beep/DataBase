# Geometry Dash Web

Ein möglichst originalgetreuer Nachbau von **Geometry Dash** als Webseite – reines HTML5 / Canvas / JavaScript,
ohne Build-Schritt, ohne Abhängigkeiten. Einfach `index.html` öffnen und spielen.

> Fan-Projekt, nicht mit RobTop Games verbunden. Alle Grafiken und die gesamte Musik werden zur Laufzeit
> prozedural erzeugt – es sind keine Original-Assets enthalten.

## Starten

* **Direkt:** `index.html` im Browser öffnen (Doppelklick genügt).
* **Lokaler Server (empfohlen):**
  ```bash
  npx http-server -p 8080 .     # oder: python3 -m http.server 8080
  ```
  dann <http://localhost:8080> öffnen.
* **Online stellen:** Der Ordner ist eine statische Seite – z. B. per *GitHub Pages*
  (Settings → Pages → Branch auswählen) veröffentlichen.

## Steuerung

| Taste / Eingabe | Aktion |
| --- | --- |
| Leertaste, ↑, W, Enter, Mausklick, Tippen | Springen / Fliegen / Schwerkraft wechseln (gedrückt halten = weiter springen) |
| Esc oder P | Pause |
| R | Level neu starten |
| Z / X | Checkpoint setzen / entfernen (Übungsmodus) |
| ← / → | Level auswählen |
| Controller | A/X/Y oder Steuerkreuz ↑ = Springen, Start = Pause, B = Zurück |

## Features

**Gameplay (Physik mit den Original-Konstanten von Geometry Dash)**
* 8 Spielmodi: Cube, Ship, Ball, UFO, Wave, Robot, Spider, Swing – jeweils auch als Mini-Version
* Geschwindigkeitsportale 0.5x / 1x / 2x / 3x / 4x, Schwerkraft-Portale, Mini-/Normal-Portale
* **Dual-Modus** (zwei gespiegelte Spieler mit einer Taste) und **Spiegel-Portale** (Bildschirm dreht sich um)
* Orbs (gelb, pink, rot, blau, grün, schwarz) und Pads (gelb, pink, rot, blau) inkl. Klick-Puffer wie im Original
* Spikes, kleine Spikes, Bodenspikes, Sägeblätter, Blöcke, Halbblöcke, **Schrägen** (45° und 22,5°) zum Hochlaufen, Abspringen und Gleiten (Wave)
* 3 geheime Münzen pro Level, Sterne für abgeschlossene Level
* Trigger: Farbe, Bewegen (Gruppen), Transparenz, Ein/Aus, Puls, Kamerawackeln
* Übungsmodus mit manuellen und automatischen Checkpoints und eigener Musik
* Fortschritt (Normal-/Übungsmodus), Versuche, Sprünge und Statistiken werden im Browser gespeichert

**15 Level** von *Easy* bis *Demon*:

| # | Level | Schwierigkeit | Schwerpunkt |
| --- | --- | --- | --- |
| 1 | Neon Steps | Easy ★1 | Cube, Ship |
| 2 | Back Beat | Easy ★2 | Pads |
| 3 | Polar Pulse | Normal ★3 | Orbs |
| 4 | Dry Circuit | Normal ★4 | Schwerkraft (Kopfüber-Passagen) |
| 5 | Slope Rush | Normal ★4 | Schrägen (45° und 22,5°) für Cube, Ship, Ball und Wave |
| 6 | Base Line | Hard ★5 | 2x-Geschwindigkeit, Mini-Cube |
| 7 | Rolling Thunder | Hard ★6 | Ball |
| 8 | Twin Peaks | Hard ★6 | Dual-Modus (Cube, Ship, UFO, Wave) |
| 9 | Hover Drive | Harder ★7 | UFO |
| 10 | Time Bender | Harder ★8 | Wave |
| 11 | Looking Glass | Harder ★8 | Spiegel-Portale, Robot, Spider, Swing |
| 12 | Cycle Core | Insane ★9 | Robot, Spider |
| 13 | Hyper Drive | Insane ★10 | Swing, 3x |
| 14 | Velocity | Insane ★10 | alle Geschwindigkeiten von 0,5x bis 4x |
| 15 | Demon Gate | Demon ★12 | alles zusammen |

Jedes Level wurde automatisch mit einem Solver geprüft: es ist schaffbar, alle drei Münzen sind in einem
Durchlauf einsammelbar, kein Klick erfordert ein Zeitfenster unter 3 Frames (bei 60 FPS) und kein Portal
lässt sich umgehen (z. B. indem man über einen Abschnitt hinwegfliegt).

**Drumherum**
* Hauptmenü, Levelauswahl mit Fortschrittsbalken, Pausemenü, „Level Complete“-Bildschirm
* Icon-Kit: 24 Cubes plus eigene Designs für alle anderen Modi, 54 Farben, Glow – neue Icons werden mit Sternen freigeschaltet
* Prozedurale Musik (Web Audio Synthesizer): jedes Level hat einen eigenen Song, dazu Menü- und Übungsmusik
* Funktioniert mit Maus, Tastatur, Touch und Gamepad (Querformat auf dem Handy empfohlen)
* Installierbar als App (PWA) und offline spielbar, sobald die Seite einmal über HTTP(S) geladen wurde
* Optionen: Musik/SFX-Lautstärke, Prozentanzeige, Fortschrittsbalken, Auto-Checkpoints, FPS, Hitboxen, *Low Detail Mode*
* Verschiedene Hintergründe und Böden je Level (auch im Editor wählbar)

**Level-Editor** (Menü → *Create*)
* Bauen / Bearbeiten / Löschen wie im Original, alle Objekte, Trigger und Startpositionen
* Auswahlrahmen, Verschieben per Ziehen oder Pfeiltasten, Drehen (Q/E), Spiegeln, Kopieren/Einfügen, Duplizieren
* Rückgängig / Wiederholen (Strg+Z / Strg+Y), Zoom (Mausrad mit Strg, +/–), Kamera (Rechtsklick-Ziehen, Leertaste+Ziehen, A/D, Pinch auf Touch)
* Level-Einstellungen: Name, Song, Startmodus, Startgeschwindigkeit, alle 8 Farbkanäle
* Testspielen (Enter) inkl. Anzeige der gespielten Route; ein komplett geschafftes Level gilt als *verifiziert*
* Level als Code teilen und importieren oder als `.gdlevel.json` herunterladen

## Projektstruktur

```
index.html          Seite und UI-Gerüst
css/style.css       Menüs im Geometry-Dash-Stil
js/util.js          Hilfsfunktionen (Farben, RNG, Speicher)
js/objects.js       Objektkatalog mit Hitboxen
js/levelfmt.js      ASCII-Levelformat und Generatoren
js/levels.js        die 15 eingebauten Level
js/engine.js        deterministische Physik (240 Hz), Kollisionen, Trigger
js/game.js          Spielsitzung: Kamera, Tod/Neustart, Übungsmodus, Effekte
js/render.js        Canvas-Renderer, Partikel, HUD
js/icons.js         Spieler-Icons, Farbpalette, Schwierigkeitsgesichter
js/audio.js         Synthesizer, Sequencer, Songs, Soundeffekte
js/editor.js        Level-Editor
js/ui.js, main.js   Menüs, Dialoge, Eingabe, Hauptschleife
tools/solve.js      Solver zur Level-Prüfung (Node.js)
```

### Level-Prüfung

```bash
node tools/solve.js                 # alle Level
node tools/solve.js polar -v        # ein Level, alle Klick-Zeitfenster anzeigen
node tools/solve.js --file mein.gdlevel.json
node tools/solve.js --seg "..o.... ....... ^^^^^^.."   # ein einzelnes Muster testen (Zeilen durch Leerzeichen getrennt)
```

Der Solver simuliert das Spiel mit exakt derselben Engine wie der Browser und durchsucht alle
Eingabefolgen (60 Entscheidungen pro Sekunde). Er meldet, ob das Level schaffbar ist, ob alle Münzen
erreichbar sind, ob die Lösung ein Portal auslässt und wie groß das Zeitfenster jedes Klicks ist.

### Levelformat

Level werden als ASCII-Abschnitte geschrieben (unterste Zeile = Boden), z. B.:

```js
`
..o....o.....
.............
^^^^^^^^^^...
`
```

`#` Block, `/` `&` Schrägen, `(-` `-)` flache Schrägen, `^` Spike, `o` gelber Orb, `O` gelbes Pad, `S` Ship-Portal, `Y` Dual-Portal, `Z` Spiegel-Portal,
`$` Münze … – die vollständige Zeichenliste steht oben in `js/levelfmt.js`. Generatoren wie `GD.gates`
(Ship/UFO/Swing-Tore), `GD.waveRun` / `GD.slopeWave` (Wave-Kanäle aus Blöcken bzw. Schrägen) und `GD.sym` (spiegelt eine Hälfte für Dual-Passagen)
erzeugen längere Abschnitte.
