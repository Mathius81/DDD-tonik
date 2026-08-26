/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import type { FollowupListItem } from './followup';

export type AppNotificationKind =
  | 'overdue' // scadență depășită, necontactat
  | 'due_today' // ajunge la termen azi
  | 'due_soon' // ajunge la termen în următoarele zile
  | 'scheduled_today' // programare pentru azi — de efectuat
  | 'failed_messages'; // mesaje/remindere eșuate

export interface AppNotification {
  kind: AppNotificationKind;
  followup: FollowupListItem | null;
  /** Pentru failed_messages: numărul de mesaje eșuate. */
  count?: number;
}

export interface NotificationsData {
  items: AppNotification[];
  /** Totalul afișat pe badge-ul clopoțelului. */
  badge: number;
}
