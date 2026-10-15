/**
 * Lädt interaktive 3D-Modelle erst auf Klick nach. Ohne Klick wird kein Modell-Code geladen.
 * Markup und Syntax: src/lib/bilder-html.mjs (:::modell name). Die Modelle liegen in src/scripts/modelle/,
 * jede Datei <name>.js ist ein Modell (Aufbau siehe modelle/kern.js), Texte stehen in modelle/meta.mjs.
 */
const modelle = import.meta.glob('./modelle/*.js');

document.addEventListener('click', async (e) => {
  const knopf = e.target instanceof Element ? e.target.closest('.modell__start') : null;
  if (!knopf) return;
  const figur = knopf.closest('[data-modell]');
  const laden = figur && modelle[`./modelle/${figur.dataset.modell}.js`];
  if (!laden) return;
  knopf.disabled = true;
  knopf.textContent = 'Lädt …';
  try {
    const [{ starten }, { default: modell }] = await Promise.all([import('./modelle/kern.js'), laden()]);
    starten(figur.querySelector('.modell__buehne'), modell);
  } catch (fehler) {
    console.error(fehler);
    knopf.disabled = false;
    knopf.textContent = 'Modell konnte nicht geladen werden, erneut versuchen';
  }
});
