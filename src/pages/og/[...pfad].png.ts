import type { APIRoute } from 'astro';
import { ladeBaum, laender, nachfahren, von, type Knoten } from '../../lib/reisen';
import { ogBild } from '../../lib/og';

// Vorschaubilder für Link-Vorschauen: /og/standard.png und /og/<pfad>.png je Seite.
export async function getStaticPaths() {
  const baum = await ladeBaum();
  return [
    { params: { pfad: 'standard' }, props: { knoten: null } },
    ...baum.map((knoten) => ({ params: { pfad: knoten.pfad }, props: { knoten } })),
  ];
}

const lage = (k: Knoten): [number, number] | undefined => {
  const p = k.eintrag.data.position;
  return p ? [p.lat, p.lng] : undefined;
};

const antwort = (png: Buffer) => new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });

export const GET: APIRoute = async ({ props }) => {
  const knoten = props.knoten as Knoten | null;
  if (!knoten) {
    return antwort(await ogBild({ titel: 'hochitom.travel', zusammenfassung: 'Reiseberichte, Fotos und Karten von Thomas Hochörtler.' }));
  }

  const d = knoten.eintrag.data;
  const eigeneRoute = d.route.map((p): [number, number] => [p.lat, p.lng]);
  const einzeln: [number, number][] = [];
  if (!eigeneRoute.length) {
    for (const k of nachfahren(knoten)) {
      const r = k.eintrag.data.route;
      if (r.length) einzeln.push(...r.map((p): [number, number] => [p.lat, p.lng]));
      else {
        const l = lage(k);
        if (l) einzeln.push(l);
      }
    }
    const eigen = lage(knoten);
    if (eigen) einzeln.push(eigen);
  }

  const beginn = von(knoten);
  return antwort(
    await ogBild({
      titel: d.titel,
      zusammenfassung: d.zusammenfassung,
      land: laender(knoten)[0],
      jahr: beginn ? String(beginn.getUTCFullYear()) : undefined,
      route: eigeneRoute,
      einzeln,
    }),
  );
};
