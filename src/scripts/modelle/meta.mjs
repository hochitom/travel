/**
 * Angaben zu den 3D-Modellen, die der Artikel braucht (Vorschau vor dem Klick, Bildunterschrift).
 * Läuft beim Bauen der Seite in Node, deshalb ohne Browser-Code. Der Modell-Code selbst liegt daneben
 * (<name>.js) und wird erst nach Klick geladen.
 *
 * Neues Modell: Datei <name>.js anlegen (Aufbau siehe kern.js), hier einen Eintrag mit gleichem Namen ergänzen
 * und im Beitrag eine eigene Zeile `:::modell <name>` schreiben.
 */
export const MODELLE = {
  reinebringen: {
    vorschau: 'Skizze des Stufenwegs auf den Reinebringen: 484 Höhenmeter, 1.978 Stufen, etwa 1,1 km.',
    unterschrift:
      'Skizze, nicht maßstabsgetreu: Berg und Wegverlauf sind frei gezeichnet, die Höhe ist 1,5-fach überhöht. Fest sind nur die Angaben der Infotafel (484 m, 1.978 Stufen, ca. 1,1 km, die letzten 100 m ohne Stufen).',
  },
};
