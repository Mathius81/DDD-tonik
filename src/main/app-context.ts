/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
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
import { CarpetClientRepository } from './db/repos/carpet-clients.repo';
import { CarpetOrderRepository } from './db/repos/carpet-orders.repo';
import { CarpetSettingsRepository } from './db/repos/carpet-settings.repo';
import { CarpetMessageRepository } from './db/repos/carpet-messages.repo';
import { TyreClientRepository } from './db/repos/tyre-clients.repo';
import { TyreVehicleRepository } from './db/repos/tyre-vehicles.repo';
import { TyreStorageRepository } from './db/repos/tyre-storage.repo';
import { TyreAppointmentRepository } from './db/repos/tyre-appointments.repo';
import { TyreSwapRepository } from './db/repos/tyre-swaps.repo';
import { TyreMessageLogRepository } from './db/repos/tyre-message-log.repo';
import { TyreSeasonReminderRepository } from './db/repos/tyre-season-reminders.repo';
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
  /** Spațiul de lucru Covoare — date complet separate de DDD. */
  readonly carpetClients: CarpetClientRepository;
  readonly carpetOrders: CarpetOrderRepository;
  readonly carpetSettings: CarpetSettingsRepository;
  readonly carpetMessages: CarpetMessageRepository;
  /** Spațiul de lucru Cauciucuri — date complet separate de DDD/Covoare. */
  readonly tyreClients: TyreClientRepository;
  readonly tyreVehicles: TyreVehicleRepository;
  readonly tyreStorage: TyreStorageRepository;
  readonly tyreAppointments: TyreAppointmentRepository;
  readonly tyreSwaps: TyreSwapRepository;
  readonly tyreMessageLog: TyreMessageLogRepository;
  readonly tyreSeasonReminders: TyreSeasonReminderRepository;

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
    this.carpetClients = new CarpetClientRepository(db);
    this.carpetOrders = new CarpetOrderRepository(db);
    this.carpetSettings = new CarpetSettingsRepository(db);
    this.carpetMessages = new CarpetMessageRepository(db);
    this.tyreClients = new TyreClientRepository(db);
    this.tyreVehicles = new TyreVehicleRepository(db);
    this.tyreStorage = new TyreStorageRepository(db);
    this.tyreAppointments = new TyreAppointmentRepository(db);
    this.tyreSwaps = new TyreSwapRepository(db);
    this.tyreMessageLog = new TyreMessageLogRepository(db);
    this.tyreSeasonReminders = new TyreSeasonReminderRepository(db);
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
