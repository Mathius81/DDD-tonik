/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  Această aplicație este o creație originală a lui Marius Constantinescu.
 *  Nu este un produs preluat, cumpărat sau adaptat după altcineva: modelul de
 *  date, regulile de business, fluxurile de lucru și interfața au fost gândite
 *  și scrise pentru nevoile reale ale firmei sale.
 *
 *  Cod proprietar — vezi fișierul LICENSE din rădăcina proiectului.
 *  Reutilizarea, copierea sau distribuirea fără acord scris sunt interzise.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Sursa unică de adevăr pentru datele de autor. Sunt folosite în interfață
 * („Despre”, subsolul din sidebar) și în jurnalul de pornire, ca atribuirea să
 * rămână consecventă peste tot și să se schimbe dintr-un singur loc.
 */

export const AUTHOR_NAME = 'Marius Constantinescu';
export const AUTHOR_EMAIL = 'mc.constantinescu1981@gmail.com';
export const COPYRIGHT_YEAR = 2026;
export const APP_NAME = 'Tonik — DDD Manager';

/** „Copyright © 2026 Marius Constantinescu” — pentru afișare în interfață. */
export const COPYRIGHT_LINE = `Copyright © ${COPYRIGHT_YEAR} ${AUTHOR_NAME}`;

/** Rând complet de atribuire, folosit în ecranul „Despre”. */
export const AUTHORSHIP_LINE =
  `${APP_NAME} — creație originală, scrisă de ${AUTHOR_NAME}. ` +
  'Toate drepturile rezervate.';
