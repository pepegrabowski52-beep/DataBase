#!/usr/bin/env bash
# Baut die Android-App (docs/fundus.apk) ohne Android Studio oder SDK.
# Benötigt: Java 17+, Python 3, curl. Werkzeuge kommen von Maven Central.
#
# Signaturschlüssel: FUNDUS_KEYSTORE (Standard: android/fundus-release.p12) und
# FUNDUS_KEY_PASS. Fehlt der Schlüssel, wird ein neuer erzeugt. Für Updates einer
# installierten App muss immer derselbe Schlüssel verwendet werden.
set -euo pipefail

cd "$(dirname "$0")"
VERSION_CODE="${VERSION_CODE:-1}"
VERSION_NAME="${VERSION_NAME:-1.0}"
KEYSTORE="${FUNDUS_KEYSTORE:-$PWD/fundus-release.p12}"
KEY_PASS="${FUNDUS_KEY_PASS:-fundus-release}"
TOOLS=.tools
OUT=build
MAVEN=https://repo1.maven.org/maven2

fetch() { # gruppe artefakt version
  local path="${1//.//}/$2/$3/$2-$3.jar"
  [ -f "$TOOLS/$2.jar" ] || curl -fsSL --retry 4 -o "$TOOLS/$2.jar" "$MAVEN/$path"
}

mkdir -p "$TOOLS"
fetch org.apktool apktool-lib 3.0.3
fetch com.jakewharton.android.repackaged dalvik-dx 16.0.1
fetch com.android.tools.build apksig 2.3.0
if [ ! -x "$TOOLS/aapt2" ]; then
  unzip -o -q -j "$TOOLS/apktool-lib.jar" prebuilt/linux/aapt2 prebuilt/android-framework.jar -d "$TOOLS"
  chmod +x "$TOOLS/aapt2"
fi

rm -rf "$OUT" && mkdir -p "$OUT"/{stubs,classes,assets}

echo "1/5 Ressourcen"
cp ../docs/index.html "$OUT/assets/index.html"
"$TOOLS/aapt2" compile --dir res -o "$OUT/res.zip"
"$TOOLS/aapt2" link -o "$OUT/base.apk" -I "$TOOLS/android-framework.jar" \
  --manifest AndroidManifest.xml -A "$OUT/assets" \
  --min-sdk-version 24 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  "$OUT/res.zip"

echo "2/5 Java"
javac -nowarn --release 8 -d "$OUT/stubs" $(find stubs -name '*.java')
javac -nowarn --release 8 -cp "$OUT/stubs" -d "$OUT/classes" $(find src -name '*.java')

echo "3/5 Dex"
java -cp "$TOOLS/dalvik-dx.jar" com.android.dx.command.Main --dex --min-sdk-version=24 \
  --output="$OUT/classes.dex" "$OUT/classes"

echo "4/5 Packen"
python3 tools/package_apk.py "$OUT/base.apk" "$OUT/classes.dex" "$OUT/unsigned.apk"

echo "5/5 Signieren"
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -storetype PKCS12 -storepass "$KEY_PASS" \
    -alias fundus -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Fundus Marktplatz" 2>/dev/null
fi
javac -nowarn -cp "$TOOLS/apksig.jar" -d "$OUT" tools/Sign.java
# apksig 2.3.0 nutzt interne JDK-Klassen für die v1-Signatur
JDK_OPEN="--add-exports=java.base/sun.security.x509=ALL-UNNAMED --add-exports=java.base/sun.security.pkcs=ALL-UNNAMED --add-exports=java.base/sun.security.util=ALL-UNNAMED"
java $JDK_OPEN -cp "$TOOLS/apksig.jar:$OUT" Sign "$KEYSTORE" "$KEY_PASS" "$OUT/unsigned.apk" ../docs/fundus.apk
python3 tools/package_apk.py --check ../docs/fundus.apk

ls -l ../docs/fundus.apk
