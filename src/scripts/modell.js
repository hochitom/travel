/**
 * Lädt interaktive 3D-Modelle erst auf Klick nach. Ohne Klick wird kein Modell-Code geladen.
 * Markup und Syntax: src/lib/bilder-html.mjs (:::modell name), Modelle liegen in src/scripts/modelle/.
 */
const lader = {
  reinebringen: () => import('./modelle/reinebringen.js'),
};

document.addEventListener('click', async (e) => {
  const knopf = e.target instanceof Element ? e.target.closest('.modell__start') : null;
  if (!knopf) return;
  const figur = knopf.closest('[data-modell]');
  const laden = figur && lader[figur.dataset.modell];
  if (!laden) return;
  knopf.disabled = true;
  knopf.textContent = 'Lädt …';
  try {
    const modul = await laden();
    modul.starten(figur.querySelector('.modell__buehne'));
  } catch (fehler) {
    console.error(fehler);
    knopf.disabled = false;
    knopf.textContent = 'Modell konnte nicht geladen werden, erneut versuchen';
  }
});
