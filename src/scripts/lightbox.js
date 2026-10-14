/*
  Kleine Verbesserung für die Lightbox (src/styles/bilder.css). Sie funktioniert auch ohne dieses Skript.

  1. Weiterblättern: Ein Popover, das von einem Knopf in einem offenen Popover geöffnet wird, gilt als
     "verschachtelt", das vorige bliebe offen. Darum schließen wir das aktuelle Bild und öffnen das nächste.
  2. Pfeiltasten links/rechts blättern.
*/
document.addEventListener('click', (e) => {
  const knopf = e.target instanceof Element ? e.target.closest('.lightbox__nav') : null;
  const ziel = knopf && document.getElementById(knopf.getAttribute('popovertarget'));
  if (!ziel) return;
  e.preventDefault();
  knopf.closest('.lightbox').hidePopover();
  ziel.showPopover();
});

document.addEventListener('keydown', (e) => {
  const richtung = { ArrowLeft: 'zurueck', ArrowRight: 'weiter' }[e.key];
  if (richtung) document.querySelector(`.lightbox:popover-open .lightbox__nav--${richtung}`)?.click();
});
