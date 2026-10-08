# Fundus Android-App

Eine schlanke Android-App, die den Shop von
`https://pepegrabowski52-beep.github.io/DataBase/` im Vollbild zeigt.

- Zurück-Taste schließt zuerst offene Fenster (Warenkorb, Details), dann geht sie zurück.
- Nach dem ersten Start funktioniert der Shop offline (Service Worker der Seite). Ist beim allerersten
  Start kein Internet da, öffnet sich die mitgelieferte Kopie der Seite.
- Helles und dunkles Design folgen der Systemeinstellung (ab Android 10).
- Mindestens Android 7, Ziel-SDK 34.

## Bauen

```sh
./build.sh
```

Das Skript lädt aapt2, dx und apksig von Maven Central, baut `../docs/fundus.apk` und signiert sie.
Android Studio oder ein Android-SDK sind nicht nötig, nur Java 17+, Python 3 und curl.

Der Signaturschlüssel liegt nicht im Repository (`*.p12` steht in `.gitignore`). Ohne Schlüssel erzeugt
das Skript einen neuen. Eine schon installierte App lässt sich nur mit demselben Schlüssel aktualisieren,
sonst muss sie vorher deinstalliert werden.

`stubs/` enthält nur die Signaturen der benutzten Android-Klassen, damit `javac` ohne SDK kompiliert.
Zur Laufzeit stellt das Gerät die echten Klassen bereit.
