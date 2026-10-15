/**
 * Lädt interaktive 3D-Modelle erst bei Bedarf nach. Vorher wird kein Modell-Code und keine Datenquelle geladen.
 * - Figuren mit `data-sichtbar` (Berg-Skizzen) starten von selbst, sobald sie in die Nähe des sichtbaren
 *   Bereichs kommen. Mit aktivem Datensparmodus des Browsers bleibt es beim Klick.
 * - Alle anderen starten auf Klick auf `.modell__start`. Der Knopf bleibt auch bei den Berg-Skizzen als
 *   Rückfall (Datensparmodus, erneuter Versuch nach einem Fehler).
 * Markup und Syntax: src/lib/bilder-html.mjs (:::modell name, :::berg …) und src/components/Berg.astro.
 * Die Modelle liegen in src/scripts/modelle/, jede Datei <name>.js ist ein Modell (Aufbau siehe modelle/kern.js).
 * Exportiert ein Modell eine Funktion, bekommt sie die data-Attribute der Figur und liefert das Modell (async).
 */
const modelle = import.meta.glob('./modelle/*.js');

async function starteFigur(figur) {
  const laden = modelle[`./modelle/${figur.dataset.modell}.js`];
  const knopf = figur.querySelector('.modell__start');
  if (!laden || figur.dataset.status === 'laedt' || figur.dataset.status === 'fertig') return;
  figur.dataset.status = 'laedt';
  const text = knopf?.dataset.text || knopf?.textContent || '';
  if (knopf) {
    knopf.dataset.text = text;
    knopf.disabled = true;
    knopf.textContent = 'Lädt …';
  }
  try {
    const [{ starten }, { default: modell }] = await Promise.all([import('./modelle/kern.js'), laden()]);
    const daten = typeof modell === 'function' ? await modell({ ...figur.dataset }) : modell;
    starten(figur.querySelector('.modell__buehne'), daten);
    figur.dataset.status = 'fertig';
  } catch (fehler) {
    console.error(fehler);
    figur.dataset.status = 'fehler';
    if (knopf) {
      knopf.disabled = false;
      knopf.textContent = `${text}, erneut versuchen`;
    }
    const vorschau = figur.querySelector('.modell__vorschau');
    if (vorschau) vorschau.textContent = 'Die Daten konnten gerade nicht geladen werden. Vielleicht fehlt das Netz?';
  }
}

document.addEventListener('click', (e) => {
  const knopf = e.target instanceof Element ? e.target.closest('.modell__start') : null;
  const figur = knopf?.closest('[data-modell]');
  if (figur) starteFigur(figur);
});

const sichtbare = document.querySelectorAll('[data-modell][data-sichtbar]');
const sparen = navigator.connection?.saveData === true;
if (sichtbare.length && !sparen && 'IntersectionObserver' in window) {
  const beobachter = new IntersectionObserver(
    (eintraege) => {
      for (const e of eintraege) {
        if (!e.isIntersecting) continue;
        beobachter.unobserve(e.target);
        starteFigur(e.target);
      }
    },
    { rootMargin: '200px 0px' }, // etwas vorher anfangen, damit die Skizze beim Hinscrollen schon steht
  );
  sichtbare.forEach((f) => beobachter.observe(f));
}
