#!/usr/bin/env python3
"""
Bilder-Sortierer für den Neuaufbau der Weltreise.

Läuft lokal auf deinem Rechner. Nichts davon verlässt den Rechner, die Gesichtserkennung
passiert offline. Alle Arbeitsdaten liegen in _raw/bilder/ (steht in .gitignore).

Ablauf:
  1. python scripts/bilder/sortiere_bilder.py download
        lädt alle Originalbilder laut _raw/medien.json (erzeugt von "npm run import")
  2. python scripts/bilder/sortiere_bilder.py stichprobe
        prüft an 30 zufälligen Bildern, ob die Fotos noch GPS-Daten enthalten
  3. Referenzfotos ablegen:  _raw/referenz/thomas/*.jpg  und  _raw/referenz/lisa/*.jpg
        je 3-5 Fotos mit gut sichtbarem Gesicht, verschiedene Situationen
  4. python scripts/bilder/sortiere_bilder.py analysiere
        liest GPS aus und sortiert nach: keine_person, nur_thomas, lisa, fremde, unklar
  5. python scripts/bilder/sortiere_bilder.py kontaktbogen
        erzeugt _raw/bilder/kontaktbogen.html: im Browser öffnen, durchklicken,
        am Ende "Entscheidungen speichern" (lädt entscheidungen.json herunter)
  6. python scripts/bilder/sortiere_bilder.py uebernehmen pfad/zu/entscheidungen.json
        kopiert alle behaltenen Originale nach _raw/bilder/behalten/ und schreibt behalten.json

Abhängigkeiten:
  pip install pillow                                      (download, stichprobe, kontaktbogen)
  pip install insightface onnxruntime opencv-python-headless numpy   (nur für "analysiere")
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import random
import shutil
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "_raw"
BILDER = RAW / "bilder"
ORIGINALE = BILDER / "original"
THUMBS = BILDER / "thumbs"
ANALYSE = BILDER / "analyse.json"
REFERENZ = RAW / "referenz"
ENDUNGEN = {".jpg", ".jpeg", ".png", ".webp", ".heic"}

# Schwellen für die Gesichtserkennung (Kosinus-Ähnlichkeit, InsightFace buffalo_l)
SCHWELLE_TREFFER = 0.40
SCHWELLE_UNSICHER = 0.28
MIN_GESICHT = 0.04  # Gesichtsbreite relativ zur Bildbreite; kleinere gelten als Passanten im Hintergrund


# ---------------------------------------------------------------------------
# Hilfen
# ---------------------------------------------------------------------------

def bild_dateien() -> list[Path]:
    return sorted(p for p in ORIGINALE.rglob("*") if p.suffix.lower() in ENDUNGEN)


def rel(p: Path) -> str:
    return p.relative_to(ORIGINALE).as_posix()


def exif_lesen(pfad: Path) -> dict:
    """GPS (Dezimalgrad) und Aufnahmezeit aus den EXIF-Daten, falls vorhanden."""
    from PIL import Image

    ergebnis: dict = {"lat": None, "lng": None, "aufgenommen": None, "kamera": None}
    try:
        with Image.open(pfad) as im:
            exif = im.getexif()
            ergebnis["kamera"] = exif.get(0x0110)
            ergebnis["aufgenommen"] = exif.get_ifd(0x8769).get(0x9003) or exif.get(0x0132)
            gps = exif.get_ifd(0x8825)
            if gps and 2 in gps and 4 in gps:
                def dezimal(wert, ref):
                    grad, minuten, sekunden = (float(x) for x in wert)
                    d = grad + minuten / 60 + sekunden / 3600
                    return -d if ref in ("S", "W") else d

                ergebnis["lat"] = round(dezimal(gps[2], gps.get(1, "N")), 6)
                ergebnis["lng"] = round(dezimal(gps[4], gps.get(3, "E")), 6)
    except Exception as e:  # defekte Datei, unbekanntes Format
        ergebnis["fehler"] = str(e)
    return ergebnis


# ---------------------------------------------------------------------------
# 1. download
# ---------------------------------------------------------------------------

def cmd_download(args: argparse.Namespace) -> None:
    medien_datei = RAW / "medien.json"
    if not medien_datei.exists():
        sys.exit("_raw/medien.json fehlt. Zuerst 'npm run import' ausführen.")
    medien = json.loads(medien_datei.read_text(encoding="utf-8"))
    ORIGINALE.mkdir(parents=True, exist_ok=True)
    fehler: list[str] = []

    def hole(m: dict) -> None:
        ziel = ORIGINALE / m["datei"]
        if ziel.exists() and ziel.stat().st_size > 0:
            return
        ziel.parent.mkdir(parents=True, exist_ok=True)
        for versuch in range(3):
            try:
                req = urllib.request.Request(m["url"], headers={"User-Agent": "hochitom-travel-import/1.0"})
                with urllib.request.urlopen(req, timeout=60) as r, open(ziel, "wb") as f:
                    shutil.copyfileobj(r, f)
                return
            except Exception as e:
                time.sleep(1.5 * (versuch + 1))
                letzte = str(e)
        fehler.append(f"{m['url']}: {letzte}")

    print(f"{len(medien)} Bilder laden nach {ORIGINALE} ...")
    with ThreadPoolExecutor(max_workers=args.parallel) as pool:
        for i, _ in enumerate(pool.map(hole, medien), 1):
            if i % 25 == 0 or i == len(medien):
                print(f"  {i}/{len(medien)}")
    if fehler:
        (BILDER / "download-fehler.txt").write_text("\n".join(fehler), encoding="utf-8")
        print(f"{len(fehler)} Fehler, siehe _raw/bilder/download-fehler.txt")
    print("Fertig.")


# ---------------------------------------------------------------------------
# 2. stichprobe
# ---------------------------------------------------------------------------

def cmd_stichprobe(args: argparse.Namespace) -> None:
    dateien = bild_dateien()
    if not dateien:
        sys.exit("Keine Bilder in _raw/bilder/original/. Zuerst 'download' ausführen.")
    random.seed(1)
    probe = random.sample(dateien, min(args.n, len(dateien)))
    mit_gps = 0
    print(f"{'Datei':60} {'GPS':>22}  Aufgenommen")
    for p in probe:
        e = exif_lesen(p)
        hat = e["lat"] is not None
        mit_gps += hat
        gps = f"{e['lat']:.4f}, {e['lng']:.4f}" if hat else "-"
        print(f"{rel(p)[:60]:60} {gps:>22}  {e['aufgenommen'] or '-'}")
    anteil = 100 * mit_gps / len(probe)
    print(f"\n{mit_gps} von {len(probe)} Bildern haben GPS-Daten ({anteil:.0f} %).")
    if anteil < 50:
        print(
            "Wenig GPS in den Blog-Bildern. Fallbacks: location-Feld der Artikel, Geocoding aus Titel/Tags,\n"
            "oder die Originalfotos vom Rechner/Handy verwenden (die haben GPS)."
        )


# ---------------------------------------------------------------------------
# 4. analysiere
# ---------------------------------------------------------------------------

def lade_gesichts_app():
    try:
        import cv2  # noqa: F401
        import numpy  # noqa: F401
        from insightface.app import FaceAnalysis
    except ImportError:
        sys.exit(
            "Für die Gesichtserkennung fehlen Pakete:\n"
            "  pip install insightface onnxruntime opencv-python-headless numpy\n"
            "Nur GPS auslesen, ohne Gesichter:  analysiere --ohne-gesichter"
        )
    app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=-1, det_size=(640, 640))
    return app


def referenzen(app, name: str) -> list:
    import cv2

    ordner = REFERENZ / name
    embeddings = []
    for p in sorted(ordner.glob("*")) if ordner.exists() else []:
        if p.suffix.lower() not in ENDUNGEN:
            continue
        bild = cv2.imread(str(p))
        faces = app.get(bild) if bild is not None else []
        if not faces:
            print(f"  Referenz {name}/{p.name}: kein Gesicht gefunden, übersprungen")
            continue
        groesstes = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
        embeddings.append(groesstes.normed_embedding)
    print(f"  Referenz {name}: {len(embeddings)} Gesichter")
    return embeddings


def aehnlichkeit(emb, refs) -> float:
    import numpy as np

    return float(max((np.dot(emb, r) for r in refs), default=0.0))


def klassifiziere(zuordnungen: list[str], groessen: list[float]) -> str:
    """zuordnungen je Gesicht: thomas | lisa | unsicher | fremd."""
    if not zuordnungen:
        return "keine_person"
    if "lisa" in zuordnungen:
        return "lisa"
    gross = [z for z, g in zip(zuordnungen, groessen) if g >= MIN_GESICHT]
    if "unsicher" in zuordnungen:
        return "unklar"
    if not gross:
        return "keine_person"  # nur winzige Gesichter im Hintergrund
    if all(z == "thomas" for z in gross):
        return "nur_thomas"
    if any(z == "fremd" for z in gross) and not any(z == "thomas" for z in gross):
        return "fremde"
    return "unklar"


def cmd_analysiere(args: argparse.Namespace) -> None:
    import json as _json

    dateien = bild_dateien()
    if not dateien:
        sys.exit("Keine Bilder in _raw/bilder/original/. Zuerst 'download' ausführen.")
    BILDER.mkdir(parents=True, exist_ok=True)
    bisher: dict = _json.loads(ANALYSE.read_text(encoding="utf-8")) if ANALYSE.exists() else {}

    app = None
    ref_t: list = []
    ref_l: list = []
    if not args.ohne_gesichter:
        print("Lade Gesichtserkennung (beim ersten Start wird das Modell geladen, ca. 300 MB) ...")
        app = lade_gesichts_app()
        ref_t = referenzen(app, "thomas")
        ref_l = referenzen(app, "lisa")
        if not ref_l:
            sys.exit("Keine Referenzfotos von Lisa gefunden (_raw/referenz/lisa/). Ohne die kann nicht aussortiert werden.")
        if not ref_t:
            print("  Achtung: keine Referenzfotos von dir, 'nur_thomas' wird nicht erkannt (alles Gesichtige wird 'unklar').")

    import cv2

    for i, p in enumerate(dateien, 1):
        key = rel(p)
        if key in bisher and not args.neu:
            continue
        eintrag = exif_lesen(p)
        eintrag["klasse"] = "unbekannt"
        eintrag["gesichter"] = []
        if app is not None:
            bild = cv2.imread(str(p))
            faces = app.get(bild) if bild is not None else []
            breite = bild.shape[1] if bild is not None else 1
            zuordnungen, groessen = [], []
            for f in faces:
                s_t = aehnlichkeit(f.normed_embedding, ref_t)
                s_l = aehnlichkeit(f.normed_embedding, ref_l)
                if s_l >= SCHWELLE_TREFFER and s_l > s_t:
                    z = "lisa"
                elif s_t >= SCHWELLE_TREFFER and s_t > s_l:
                    z = "thomas"
                elif max(s_t, s_l) >= SCHWELLE_UNSICHER:
                    z = "unsicher"
                else:
                    z = "fremd"
                g = float((f.bbox[2] - f.bbox[0]) / breite)
                zuordnungen.append(z)
                groessen.append(g)
                eintrag["gesichter"].append(
                    {"zuordnung": z, "breite": round(g, 3), "thomas": round(s_t, 2), "lisa": round(s_l, 2)}
                )
            eintrag["klasse"] = klassifiziere(zuordnungen, groessen)
        bisher[key] = eintrag
        if i % 20 == 0 or i == len(dateien):
            ANALYSE.write_text(_json.dumps(bisher, indent=1, ensure_ascii=False), encoding="utf-8")
            print(f"  {i}/{len(dateien)}")
    ANALYSE.write_text(_json.dumps(bisher, indent=1, ensure_ascii=False), encoding="utf-8")

    zaehler: dict[str, int] = {}
    for e in bisher.values():
        zaehler[e["klasse"]] = zaehler.get(e["klasse"], 0) + 1
    mit_gps = sum(1 for e in bisher.values() if e.get("lat") is not None)
    print("\nErgebnis:")
    for k, n in sorted(zaehler.items()):
        print(f"  {k:14} {n}")
    print(f"  mit GPS        {mit_gps} von {len(bisher)}")
    print("Weiter mit: kontaktbogen")


# ---------------------------------------------------------------------------
# 5. kontaktbogen
# ---------------------------------------------------------------------------

STANDARD = {"keine_person": "behalten", "nur_thomas": "behalten", "lisa": "verwerfen", "fremde": "offen", "unklar": "offen", "unbekannt": "offen"}
TITEL = {
    "keine_person": "Keine Person erkannt (Rückenansichten werden nicht erkannt, bitte überfliegen)",
    "nur_thomas": "Nur du",
    "lisa": "Lisa erkannt",
    "fremde": "Fremde Personen",
    "unklar": "Unklar (bitte entscheiden)",
    "unbekannt": "Nicht analysiert",
}
REIHENFOLGE = ["unklar", "fremde", "lisa", "nur_thomas", "keine_person", "unbekannt"]


def thumb_fuer(p: Path) -> Path:
    from PIL import Image, ImageOps

    ziel = THUMBS / (hashlib.md5(rel(p).encode()).hexdigest() + ".jpg")
    if not ziel.exists():
        THUMBS.mkdir(parents=True, exist_ok=True)
        with Image.open(p) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            im.thumbnail((360, 360))
            im.save(ziel, "JPEG", quality=78)
    return ziel


def cmd_kontaktbogen(args: argparse.Namespace) -> None:
    if not ANALYSE.exists():
        sys.exit("analyse.json fehlt. Zuerst 'analysiere' ausführen.")
    daten = json.loads(ANALYSE.read_text(encoding="utf-8"))
    gruppen: dict[str, list[tuple[str, dict]]] = {}
    for key, e in sorted(daten.items()):
        gruppen.setdefault(e["klasse"], []).append((key, e))

    kacheln_html: list[str] = []
    for klasse in REIHENFOLGE:
        liste = gruppen.get(klasse, [])
        if not liste:
            continue
        kacheln = []
        for key, e in liste:
            t = thumb_fuer(ORIGINALE / key)
            gps = "📍" if e.get("lat") is not None else ""
            kacheln.append(
                f'<figure class="k" data-key="{html.escape(key)}" data-standard="{STANDARD[klasse]}">'
                f'<img src="thumbs/{t.name}" loading="lazy" alt="">'
                f'<figcaption><span>{html.escape(Path(key).name)}</span> {gps}'
                f' <a href="original/{html.escape(key)}" target="_blank" title="Original öffnen">🔍</a></figcaption></figure>'
            )
        kacheln_html.append(
            f'<section data-klasse="{klasse}"><h2>{html.escape(TITEL[klasse])} <small>({len(liste)})</small></h2>'
            f'<p class="aktionen"><button data-alle="behalten">alle behalten</button>'
            f'<button data-alle="verwerfen">alle verwerfen</button></p>'
            f'<div class="raster">{"".join(kacheln)}</div></section>'
        )

    seite = f"""<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>Kontaktbogen</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body {{ font-family: system-ui, sans-serif; margin: 0; background: #151c1f; color: #eee; }}
  header {{ position: sticky; top: 0; z-index: 5; background: #0e1315; padding: .6rem 1rem; display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; border-bottom: 1px solid #333; }}
  main {{ padding: 0 1rem 4rem; }}
  h2 {{ margin: 2rem 0 .3rem; }} small {{ color: #9ab; font-weight: 400; }}
  .raster {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: .6rem; }}
  .k {{ margin: 0; border: 4px solid #555; border-radius: 6px; overflow: hidden; background: #000; cursor: pointer; }}
  .k img {{ width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }}
  .k figcaption {{ font-size: .7rem; padding: .25rem .4rem; display: flex; justify-content: space-between; gap: .3rem; }}
  .k figcaption span {{ overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
  .k figcaption a {{ color: #fff; text-decoration: none; }}
  .k[data-status=behalten] {{ border-color: #3fb26b; }}
  .k[data-status=verwerfen] {{ border-color: #d9534f; opacity: .35; }}
  .k[data-status=offen] {{ border-color: #e6a23c; }}
  button {{ background: #2b3a40; color: #fff; border: 1px solid #456; border-radius: 4px; padding: .35rem .7rem; cursor: pointer; }}
  button.primaer {{ background: #b8472a; border-color: #b8472a; }}
  .aktionen {{ margin: .3rem 0 .8rem; display: flex; gap: .5rem; }}
  .zaehler span {{ margin-right: 1rem; }}
</style></head><body>
<header>
  <strong>Kontaktbogen</strong>
  <span class="zaehler"><span id="z-b">0 behalten</span><span id="z-v">0 verworfen</span><span id="z-o">0 offen</span></span>
  <span>Klick auf ein Bild wechselt: behalten → verwerfen → offen</span>
  <button class="primaer" id="speichern">Entscheidungen speichern</button>
</header>
<main>{"".join(kacheln_html)}</main>
<script>
  const SCHLUESSEL = 'kontaktbogen-entscheidungen';
  let gespeichert = {{}};
  try {{ gespeichert = JSON.parse(localStorage.getItem(SCHLUESSEL) || '{{}}'); }} catch (e) {{}}
  const kacheln = [...document.querySelectorAll('.k')];
  for (const k of kacheln) k.dataset.status = gespeichert[k.dataset.key] || k.dataset.standard;
  const REIHE = ['behalten', 'verwerfen', 'offen'];
  function sichern() {{
    const alle = Object.fromEntries(kacheln.map(k => [k.dataset.key, k.dataset.status]));
    try {{ localStorage.setItem(SCHLUESSEL, JSON.stringify(alle)); }} catch (e) {{}}
    for (const [id, st] of [['z-b','behalten'],['z-v','verwerfen'],['z-o','offen']])
      document.getElementById(id).textContent = kacheln.filter(k => k.dataset.status === st).length + ' ' + (st === 'verwerfen' ? 'verworfen' : st);
    return alle;
  }}
  document.addEventListener('click', e => {{
    if (e.target.closest('a')) return;
    const k = e.target.closest('.k');
    if (k) {{ k.dataset.status = REIHE[(REIHE.indexOf(k.dataset.status) + 1) % 3]; sichern(); return; }}
    const b = e.target.closest('button[data-alle]');
    if (b) {{ b.closest('section').querySelectorAll('.k').forEach(x => x.dataset.status = b.dataset.alle); sichern(); }}
  }});
  document.getElementById('speichern').onclick = () => {{
    const alle = sichern();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(alle, null, 1)], {{ type: 'application/json' }}));
    a.download = 'entscheidungen.json'; a.click();
  }};
  sichern();
</script></body></html>"""
    ziel = BILDER / "kontaktbogen.html"
    ziel.write_text(seite, encoding="utf-8")
    print(f"Fertig: {ziel}\nIm Browser öffnen, durchklicken, 'Entscheidungen speichern' drücken.")


# ---------------------------------------------------------------------------
# 6. uebernehmen
# ---------------------------------------------------------------------------

def cmd_uebernehmen(args: argparse.Namespace) -> None:
    entscheidungen = json.loads(Path(args.datei).read_text(encoding="utf-8"))
    analyse = json.loads(ANALYSE.read_text(encoding="utf-8")) if ANALYSE.exists() else {}
    ziel = BILDER / "behalten"
    ziel.mkdir(parents=True, exist_ok=True)
    behalten, offen = [], 0
    for key, status in entscheidungen.items():
        if status == "offen":
            offen += 1
        if status != "behalten":
            continue
        quelle = ORIGINALE / key
        if not quelle.exists():
            continue
        (ziel / key).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(quelle, ziel / key)
        e = analyse.get(key, {})
        behalten.append({"datei": key, "lat": e.get("lat"), "lng": e.get("lng"), "aufgenommen": e.get("aufgenommen")})
    (BILDER / "behalten.json").write_text(json.dumps(behalten, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"{len(behalten)} Bilder behalten (kopiert nach {ziel}).")
    if offen:
        print(f"Achtung: {offen} Bilder sind noch 'offen' und wurden NICHT übernommen.")


# ---------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("download", help="Originalbilder laden")
    d.add_argument("--parallel", type=int, default=6)
    d.set_defaults(fn=cmd_download)

    s = sub.add_parser("stichprobe", help="GPS-Stichprobe")
    s.add_argument("-n", type=int, default=30)
    s.set_defaults(fn=cmd_stichprobe)

    a = sub.add_parser("analysiere", help="GPS auslesen und Gesichter einordnen")
    a.add_argument("--ohne-gesichter", action="store_true", help="nur EXIF/GPS, keine Gesichtserkennung")
    a.add_argument("--neu", action="store_true", help="bereits analysierte Bilder erneut prüfen")
    a.set_defaults(fn=cmd_analysiere)

    k = sub.add_parser("kontaktbogen", help="HTML-Kontaktbogen erzeugen")
    k.set_defaults(fn=cmd_kontaktbogen)

    u = sub.add_parser("uebernehmen", help="Entscheidungen anwenden")
    u.add_argument("datei", help="entscheidungen.json aus dem Kontaktbogen")
    u.set_defaults(fn=cmd_uebernehmen)

    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
