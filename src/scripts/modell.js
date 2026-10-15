/**
 * Lädt interaktive 3D-Modelle erst auf Klick nach. Ohne Klick wird kein Modell-Code und keine Datenquelle geladen.
 * Markup und Syntax: src/lib/bilder-html.mjs (:::modell name, :::berg …) und src/components/Berg.astro.
 * Die Modelle liegen in src/scripts/modelle/, jede Datei <name>.js ist ein Modell (Aufbau siehe modelle/kern.js).
 * Exportiert ein Modell eine Funktion, bekommt sie die data-Attribute der Figur und liefert das Modell (async).
 */
const modelle = import.meta.glob('./modelle/*.js');

document.addEventListener('click', async (e) => {
  const knopf = e.target instanceof Element ? e.target.closest('.modell__start') : null;
  if (!knopf) return;
  const figur = knopf.closest('[data-modell]');
  const laden = figur && modelle[`./modelle/${figur.dataset.modell}.js`];
  if (!laden) return;
  const text = knopf.textContent;
  knopf.disabled = true;
  knopf.textContent = 'Lädt …';
  try {
    const [{ starten }, { default: modell }] = await Promise.all([import('./modelle/kern.js'), laden()]);
    const daten = typeof modell === 'function' ? await modell({ ...figur.dataset }) : modell;
    starten(figur.querySelector('.modell__buehne'), daten);
  } catch (fehler) {
    console.error(fehler);
    knopf.disabled = false;
    knopf.textContent = `${text.replace(/,.*$/, '')}, erneut versuchen`;
    const vorschau = figur.querySelector('.modell__vorschau');
    if (vorschau) vorschau.textContent = 'Die Daten konnten gerade nicht geladen werden. Vielleicht fehlt das Netz?';
  }
});
