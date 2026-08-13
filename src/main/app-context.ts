import type { BrowserWindow } from 'electron';
import { Db } from './db/database';
import { AssociationRepository } from './db/repos/associations.repo';
import { ContactRepository } from './db/repos/contacts.repo';
import { ServiceRepository } from './db/repos/services.repo';
import { InterventionRepository } from './db/repos/interventions.repo';
import { FollowupRepository } from './db/repos/followups.repo';
import { ReminderRepository } from './db/repos/reminders.repo';
import { MessageRepository } from './db/repos/messages.repo';
import { SettingsRepository } from './db/repos/settings.repo';
import type { AppPaths } from './paths';
import type { Logger } from './logger';
import { todayIso } from '../shared/dates';

/** Dependențele partajate de toate modulele din main. */
export class AppContext {
  readonly associations: AssociationRepository;
  readonly contacts: ContactRepository;
  readonly services: ServiceRepository;
  readonly interventions: InterventionRepository;
  readonly followups: FollowupRepository;
  readonly reminders: ReminderRepository;
  readonly messages: MessageRepository;
  readonly settings: SettingsRepository;

  constructor(
    public db: Db,
    readonly paths: AppPaths,
    readonly logger: Logger,
    readonly getMainWindow: () => BrowserWindow | null,
    readonly now: () => Date = () => new Date(),
  ) {
    this.associations = new AssociationRepository(db);
    this.contacts = new ContactRepository(db);
    this.services = new ServiceRepository(db);
    this.interventions = new InterventionRepository(db);
    this.followups = new FollowupRepository(db);
    this.reminders = new ReminderRepository(db);
    this.messages = new MessageRepository(db);
    this.settings = new SettingsRepository(db);
  }

  todayIso(): string {
    return todayIso(this.now);
  }

  /** 'YYYY-MM-DD HH:mm:ss' în ora locală — formatul folosit la scheduled_at. */
  nowLocalIso(): string {
    const d = this.now();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  notifyDataChanged(): void {
    this.getMainWindow()?.webContents.send('events:dataChanged');
  }
}
