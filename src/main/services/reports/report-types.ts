/**
 * Conținutul generat pentru un raport zilnic, independent de canalul de trimitere
 * (email/WhatsApp/notificare) — fiecare canal își extrage din el ce are nevoie.
 */
export interface ReportContent {
  /** Titlu scurt, pentru notificarea desktop (ex. „Planul zilei”, „Raport Covoare”). */
  title: string;
  /** Subiectul emailului. */
  subject: string;
  /** Corpul complet, text simplu — inclusiv un mesaj de fallback dacă nu-i nimic de raportat. */
  body: string;
  /** Rezumat pe o linie (ex. „3 lucruri de făcut azi”) — pentru notificare și mesajul WhatsApp scurt. */
  summary: string;
  /** Rută in-app spre care navighează notificarea desktop la click. */
  route: string;
  /** true dacă nu există conținut relevant de raportat — rapoartele noi nu se trimit când e gol. */
  isEmpty: boolean;
}
