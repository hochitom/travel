#!/usr/bin/env python3
"""
Erzeugt die Vorschaubilder (Open Graph, 1200x630) für hochitom.travel nach public/og/.

Je Seite ein Bild: Reisepass-Stempel, Titel, kleine Routenkarte aus den `route`-Punkten
bzw. `position`-Angaben der Beiträge, Wortmarke. Läuft lokal, nicht im Netlify-Build;
die PNGs liegen im Repo.

Aufruf:
  pip install pyyaml pillow playwright
  python3 scripts/og_bilder.py --schriften /pfad/zu/google-fonts/ofl

Der Schriftordner braucht imfellenglish/, newsreader/ und reeniebeanie/ (Google Fonts, OFL).
"""
import argparse, datetime, html, json, pathlib, re, sys
import yaml
from playwright.sync_api import sync_playwright
from PIL import Image

WURZEL = pathlib.Path(__file__).resolve().parent.parent
INHALT = WURZEL / 'src' / 'content' / 'reisen'
AUS = WURZEL / 'public' / 'og'
B, H = 1200, 630


def lese(datei):
    text = datei.read_text(encoding='utf-8')
    m = re.match(r'^---\n(.*?)\n---', text, re.S)
    return yaml.safe_load(m.group(1)) if m else {}


def lade():
    knoten = {}
    for f in sorted(INHALT.rglob('*.md')):
        rel = f.relative_to(INHALT)
        if any(t.startswith('_') for t in rel.parts):
            continue
        d = lese(f)
        if d.get('entwurf') and False:
            continue
        pfad = '/'.join(rel.parts[:-1]) if rel.name == 'index.md' else '/'.join(rel.parts)[:-3]
        knoten[pfad] = d
    return knoten


def eltern(pfad):
    teile = pfad.split('/')
    return ['/'.join(teile[:i]) for i in range(len(teile) - 1, 0, -1)]


def erbe(knoten, pfad, feld):
    d = knoten[pfad]
    if d.get(feld):
        return d[feld]
    for e in eltern(pfad):
        if e in knoten and knoten[e].get(feld):
            return knoten[e][feld]
    return None


def punkte(knoten, pfad):
    """Routenpunkte der Seite und ihrer Nachfahren, sonst Positionen. Liefert (route, einzeln)."""
    d = knoten[pfad]
    if d.get('route'):
        return [(p['lat'], p['lng']) for p in d['route']], []
    einzeln = []
    for k, dd in knoten.items():
        if k == pfad or not k.startswith(pfad + '/'):
            continue
        if dd.get('route'):
            einzeln += [(p['lat'], p['lng']) for p in dd['route']]
        elif dd.get('position'):
            pos = dd['position']
            einzeln.append((pos['lat'], pos['lng']))
    if d.get('position'):
        pos = d['position']
        einzeln.append((pos['lat'], pos['lng']))
    return [], einzeln


def karte(route, einzeln):
    """SVG-Pfad und Punkte der Mini-Karte (Breite 440, Höhe 330), gleichwinklig mit cos(lat)."""
    alle = route + einzeln
    if not alle:
        return ''
    import math
    mlat = sum(p[0] for p in alle) / len(alle)
    k = math.cos(math.radians(mlat))
    xs = [p[1] * k for p in alle]
    ys = [-p[0] for p in alle]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    bw, bh = max(x1 - x0, 1e-6), max(y1 - y0, 1e-6)
    # Mindestausschnitt, damit ein einzelner Ort nicht riesig wirkt
    bw, bh = max(bw, 0.12), max(bh, 0.09)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    rand = 36
    s = min((440 - 2 * rand) / bw, (330 - 2 * rand) / bh)

    def xy(p):
        return (220 + (p[1] * k - cx) * s, 165 + (-p[0] - cy) * s)

    teile = []
    if len(route) > 1:
        pts = ' '.join('%.1f,%.1f' % xy(p) for p in route)
        teile.append(f'<polyline points="{pts}" fill="none" stroke="var(--a)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 9"/>')
    for p in route + einzeln:
        x, y = xy(p)
        r = 6.5 if route else 5
        teile.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="var(--a)" stroke="var(--p2)" stroke-width="2.5"/>')
    return ''.join(teile)


def datum_text(d, knoten, pfad):
    dat = d.get('datum')
    if isinstance(dat, (datetime.date, datetime.datetime)) and not d.get('route') and pfad.count('/') >= 1 and not (INHALT / pfad / 'index.md').exists():
        return dat.strftime('%d.%m.%Y')
    v = erbe(knoten, pfad, 'von') or dat
    if isinstance(v, (datetime.date, datetime.datetime)):
        return str(v.year)
    return ''


def seite(titel, zusatzzeile, stempel_land, stempel_zusatz, kopf, svg_karte, schriften):
    def font(familie, datei, stil='normal', gewicht='400'):
        return f"@font-face{{font-family:'{familie}';font-style:{stil};font-weight:{gewicht};src:url('file://{datei}')}}"

    fonts = ''.join([
        font('IM Fell English', schriften / 'imfellenglish' / 'IMFeENrm28P.ttf'),
        font('IM Fell English', schriften / 'imfellenglish' / 'IMFeENit28P.ttf', 'italic'),
        font('Newsreader', schriften / 'newsreader' / 'Newsreader[opsz,wght].ttf', 'normal', '200 800'),
        font('Reenie Beanie', schriften / 'reeniebeanie' / 'ReenieBeanie.ttf'),
    ])
    n = len(titel)
    groesse = 76 if n <= 18 else 64 if n <= 30 else 52 if n <= 46 else 44
    stempel = ''
    if stempel_land:
        sl = len(stempel_land)
        sg = 46 if sl <= 8 else 36 if sl <= 12 else 28
        stempel = f'''
<svg class="stempel" viewBox="0 0 300 160" width="300" height="160" filter="url(#rauh)">
 <g fill="none" stroke="var(--a)"><rect x="4" y="4" width="292" height="152" rx="7" stroke-width="3.5"/>
 <rect x="12" y="12" width="276" height="136" rx="3" stroke-width="1.2"/><path d="M24 52H276M24 112H276" stroke-width="1"/></g>
 <text x="150" y="40" text-anchor="middle" font-family="Newsreader" font-size="14" letter-spacing="4" fill="var(--a)">{html.escape(kopf)}</text>
 <text x="150" y="{94 + (46 - sg) // 4}" text-anchor="middle" font-family="IM Fell English" font-size="{sg}" fill="var(--a)">{html.escape(stempel_land)}</text>
 <text x="150" y="136" text-anchor="middle" font-family="Newsreader" font-size="17" letter-spacing="4" fill="var(--a)">{html.escape(stempel_zusatz)}</text>
</svg>'''
    kartenkasten = f'''
<div class="karte"><svg viewBox="0 0 440 330" width="440" height="330">
 <g stroke="var(--l)" stroke-width="1" opacity=".7"><path d="M0 66H440M0 132H440M0 198H440M0 264H440M88 0V330M176 0V330M264 0V330M352 0V330"/></g>
 {svg_karte}
 <g transform="translate(396 40)" opacity=".85"><circle r="22" fill="none" stroke="var(--t)" stroke-width="1"/><path d="M0 -20L4 -4L20 0L4 4L0 20L-4 4L-20 0L-4 -4z" fill="var(--t)"/></g>
</svg></div>''' if svg_karte else ''
    return f'''<!doctype html><meta charset="utf-8"><style>
{fonts}
:root{{--p:#e3e2d0;--p2:#f1f0e3;--t:#1e2a38;--tl:#4a5260;--a:#a32638;--m:#2f5d6b;--l:#b9b8a2}}
*{{box-sizing:border-box;margin:0}}
body{{width:{B}px;height:{H}px;background:var(--p);color:var(--t);font-family:Newsreader,serif;position:relative;overflow:hidden}}
.rahmen{{position:absolute;inset:26px;border:2px solid var(--l)}}
.rahmen::after{{content:'';position:absolute;inset:7px;border:1px solid var(--l)}}
.links{{position:absolute;left:84px;top:84px;width:{600 if svg_karte else 1000}px;bottom:84px;display:flex;flex-direction:column}}
.kopf{{font-size:20px;letter-spacing:.3em;text-transform:uppercase;color:var(--m)}}
h1{{font-family:'IM Fell English',serif;font-weight:400;font-size:{groesse}px;line-height:1.08;margin-top:22px}}
.zeile{{margin-top:20px;font-size:27px;line-height:1.4;color:var(--tl);max-width:{560 if svg_karte else 900}px}}
.marke{{margin-top:auto;display:flex;align-items:center;gap:16px}}
.marke svg{{display:block}}
.name{{font-family:'IM Fell English',serif;font-size:40px;line-height:1}}
.name i{{color:var(--a)}}
.karte{{position:absolute;right:84px;top:84px;width:440px;height:330px;background:var(--p2);border:1px solid var(--l);outline:6px solid var(--p2);outline-offset:-1px;box-shadow:0 0 0 7px var(--l)}}
.stempel{{position:absolute;right:{84 if svg_karte else 90}px;{'bottom:96px' if svg_karte else 'top:90px'};transform:rotate(-5deg);opacity:.92}}
</style>
<svg width="0" height="0" style="position:absolute"><defs><filter id="rauh" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.4"/></filter></defs></svg>
<div class="rahmen"></div>
<div class="links">
 <div class="kopf">Logbuch der Reisen</div>
 <h1>{html.escape(titel)}</h1>
 {f'<p class="zeile">{html.escape(zusatzzeile)}</p>' if zusatzzeile else ''}
 <div class="marke">
  <svg viewBox="0 0 64 64" width="58" height="58"><circle cx="32" cy="32" r="22" fill="none" stroke="var(--a)" stroke-width="3"/><circle cx="32" cy="32" r="17" fill="none" stroke="var(--a)" stroke-width="1.5"/><path d="M32 14l4.5 14.5L51 32l-14.5 3.5L32 50l-4.5-14.5L13 32l14.5-3.5z" fill="var(--t)"/><path d="M32 14l2.6 15L32 32l-2.6-3z" fill="var(--a)"/></svg>
  <span class="name">hochitom<i>.travel</i></span>
 </div>
</div>
{kartenkasten}
{stempel}
'''


def kuerzen(text, n=150):
    if not text or len(text) <= n:
        return text or ''
    return text[:n].rsplit(' ', 1)[0] + ' …'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--schriften', required=True, type=pathlib.Path)
    ap.add_argument('--nur', help='nur Pfade, die mit diesem Text beginnen (zum Testen)')
    a = ap.parse_args()
    schriften = a.schriften.resolve()
    knoten = lade()
    AUS.mkdir(parents=True, exist_ok=True)
    tmp = pathlib.Path('/tmp/og_seite.html')

    auftraege = [('standard', 'hochitom.travel', 'Reiseberichte, Fotos und Karten von Thomas Hochörtler.', '', '', '', [], [])]
    for pfad, d in knoten.items():
        land = (erbe(knoten, pfad, 'laender') or [''])[0]
        route, einzeln = punkte(knoten, pfad)
        zusatz = datum_text(d, knoten, pfad)
        auftraege.append((pfad, d['titel'], kuerzen(d.get('zusammenfassung')), land, zusatz, 'Ankunft', route, einzeln))

    with sync_playwright() as pw:
        br = pw.chromium.launch()
        seitenobj = br.new_page(viewport={'width': B, 'height': H})
        for pfad, titel, zeile, land, zusatz, kopf, route, einzeln in auftraege:
            if a.nur and not pfad.startswith(a.nur):
                continue
            titel_roh = re.sub(r'[\U0001F000-\U0001FFFF☀-➿️‍]', '', titel).strip()
            # Stempel: Land plus Jahr/Datum. Ohne Land kein Stempel.
            tmp.write_text(seite(titel_roh, zeile, land, zusatz or '', kopf, karte(route, einzeln), schriften), encoding='utf-8')
            seitenobj.goto('file://' + str(tmp))
            seitenobj.evaluate('document.fonts.ready')
            seitenobj.wait_for_timeout(150)
            ziel = AUS / (pfad + '.png')
            ziel.parent.mkdir(parents=True, exist_ok=True)
            seitenobj.screenshot(path=str(ziel))
            # Palette verkleinert die Datei auf etwa ein Drittel
            Image.open(ziel).convert('RGB').quantize(colors=48, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(ziel, optimize=True)
        br.close()
    print('fertig:', AUS)


if __name__ == '__main__':
    main()
