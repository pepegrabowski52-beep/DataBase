"""Setzt die APK aus der aapt2-Ausgabe und classes.dex zusammen.

Unkomprimierte Einträge (resources.arsc, PNGs) werden auf 4 Byte ausgerichtet,
wie es Android ab targetSdk 30 verlangt (entspricht zipalign).
"""
import sys
import zipfile

STORE = ('resources.arsc', '.png')
DATE = (2026, 1, 1, 0, 0, 0)


def main(base_apk, dex, out):
    with zipfile.ZipFile(base_apk) as src:
        entries = [(i.filename, src.read(i)) for i in src.infolist() if not i.is_dir()]
    with open(dex, 'rb') as f:
        entries.insert(1, ('classes.dex', f.read()))

    with zipfile.ZipFile(out, 'w') as dst:
        for name, data in entries:
            info = zipfile.ZipInfo(name, DATE)
            info.create_system = 0
            if name.endswith(STORE):
                info.compress_type = zipfile.ZIP_STORED
                # Android-Ausrichtungsfeld 0xD935: Kennung, Länge, Ausrichtung, Füllbytes
                start = dst.fp.tell() + 30 + len(name.encode()) + 6
                pad = (-start) % 4
                info.extra = (0xD935).to_bytes(2, 'little') + (2 + pad).to_bytes(2, 'little') \
                    + (4).to_bytes(2, 'little') + b'\0' * pad
            else:
                info.compress_type = zipfile.ZIP_DEFLATED
            dst.writestr(info, data)


def check_alignment(apk):
    """Gibt alle unkomprimierten Einträge zurück, deren Daten nicht auf 4 Byte liegen."""
    bad = []
    with zipfile.ZipFile(apk) as z, open(apk, 'rb') as f:
        for i in z.infolist():
            if i.compress_type != zipfile.ZIP_STORED or i.is_dir():
                continue
            f.seek(i.header_offset + 26)
            n, m = int.from_bytes(f.read(2), 'little'), int.from_bytes(f.read(2), 'little')
            if (i.header_offset + 30 + n + m) % 4:
                bad.append(i.filename)
    return bad


if __name__ == '__main__':
    if sys.argv[1] == '--check':
        bad = check_alignment(sys.argv[2])
        print('Ausrichtung ok' if not bad else 'Nicht ausgerichtet: ' + ', '.join(bad))
        sys.exit(1 if bad else 0)
    main(*sys.argv[1:4])
