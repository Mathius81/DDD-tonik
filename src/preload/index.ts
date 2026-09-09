/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc-contract';

/**
 * Singura punte între renderer și main.
 * Nu expune ipcRenderer, fs, process sau alte API-uri Node.
 */
const invoke = (channel: string) => (payload?: unknown) => ipcRenderer.invoke(channel, payload);

const api = {
  associations: {
    list: invoke(IPC.associations.list),
    get: invoke(IPC.associations.get),
    create: invoke(IPC.associations.create),
    update: invoke(IPC.associations.update),
    setActive: invoke(IPC.associations.setActive),
  },
  contacts: {
    listByAssociation: invoke(IPC.contacts.listByAssociation),
    create: invoke(IPC.contacts.create),
    update: invoke(IPC.contacts.update),
    delete: invoke(IPC.contacts.delete),
  },
  administrators: {
    list: invoke(IPC.administrators.list),
    getByPhones: invoke(IPC.administrators.getByPhones),
    preview: invoke(IPC.administrators.preview),
    whatsapp: {
      send: invoke(IPC.administrators.whatsapp.send),
    },
  },
  services: {
    list: invoke(IPC.services.list),
    create: invoke(IPC.services.create),
    update: invoke(IPC.services.update),
  },
  interventions: {
    list: invoke(IPC.interventions.list),
    create: invoke(IPC.interventions.create),
    previewDueDate: invoke(IPC.interventions.previewDueDate),
  },
  followups: {
    list: invoke(IPC.followups.list),
    markContacted: invoke(IPC.followups.markContacted),
    schedule: invoke(IPC.followups.schedule),
    cancel: invoke(IPC.followups.cancel),
  },
  reminders: {
    list: invoke(IPC.reminders.list),
    counts: invoke(IPC.reminders.counts),
    retry: invoke(IPC.reminders.retry),
    cancel: invoke(IPC.reminders.cancel),
  },
  messages: {
    templates: {
      list: invoke(IPC.messages.templates.list),
      create: invoke(IPC.messages.templates.create),
      update: invoke(IPC.messages.templates.update),
    },
    send: invoke(IPC.messages.send),
    preview: invoke(IPC.messages.preview),
    markSent: invoke(IPC.messages.markSent),
    resend: invoke(IPC.messages.resend),
    log: invoke(IPC.messages.log),
    counts: invoke(IPC.messages.counts),
  },
  dashboard: {
    get: invoke(IPC.dashboard.get),
    calendarMonth: invoke(IPC.dashboard.calendarMonth),
    notifications: invoke(IPC.dashboard.notifications),
  },
  settings: {
    get: invoke(IPC.settings.get),
    update: invoke(IPC.settings.update),
    setSecret: invoke(IPC.settings.setSecret),
    testSmtp: invoke(IPC.settings.testSmtp),
    testWhatsapp: invoke(IPC.settings.testWhatsapp),
    sendDigestNow: invoke(IPC.settings.sendDigestNow),
    chooseBackupFolder: invoke(IPC.settings.chooseBackupFolder),
    whatsappTemplateMap: {
      list: invoke(IPC.settings.whatsappTemplateMap.list),
      upsert: invoke(IPC.settings.whatsappTemplateMap.upsert),
      delete: invoke(IPC.settings.whatsappTemplateMap.delete),
    },
  },
  license: {
    check: invoke(IPC.license.check),
    activate: invoke(IPC.license.activate),
  },
  about: {
    get: invoke(IPC.about.get),
    diagnostics: invoke(IPC.about.diagnostics),
    stats: invoke(IPC.about.stats),
    resetReportGuard: invoke(IPC.about.resetReportGuard),
    openLogsFolder: invoke(IPC.about.openLogsFolder),
    openBackupsFolder: invoke(IPC.about.openBackupsFolder),
    secretMenuStatus: invoke(IPC.about.secretMenuStatus),
    secretMenuSetPassword: invoke(IPC.about.secretMenuSetPassword),
    secretMenuVerifyPassword: invoke(IPC.about.secretMenuVerifyPassword),
    secretMenuChangePassword: invoke(IPC.about.secretMenuChangePassword),
    thirdPartyLicenses: {
      list: invoke(IPC.about.thirdPartyLicenses.list),
      getText: invoke(IPC.about.thirdPartyLicenses.getText),
      openFile: invoke(IPC.about.thirdPartyLicenses.openFile),
    },
  },
  carpets: {
    clients: {
      list: invoke(IPC.carpets.clients.list),
      get: invoke(IPC.carpets.clients.get),
      create: invoke(IPC.carpets.clients.create),
      update: invoke(IPC.carpets.clients.update),
    },
    orders: {
      list: invoke(IPC.carpets.orders.list),
      get: invoke(IPC.carpets.orders.get),
      create: invoke(IPC.carpets.orders.create),
      update: invoke(IPC.carpets.orders.update),
      setStatus: invoke(IPC.carpets.orders.setStatus),
    },
    dashboard: {
      get: invoke(IPC.carpets.dashboard.get),
      todos: invoke(IPC.carpets.dashboard.todos),
    },
    calendar: {
      month: invoke(IPC.carpets.calendar.month),
    },
    settings: {
      get: invoke(IPC.carpets.settings.get),
      update: invoke(IPC.carpets.settings.update),
    },
    reminders: {
      get: invoke(IPC.carpets.reminders.get),
    },
    messages: {
      list: invoke(IPC.carpets.messages.list),
    },
    whatsapp: {
      send: invoke(IPC.carpets.whatsapp.send),
    },
  },
  tyres: {
    clients: {
      list: invoke(IPC.tyres.clients.list),
      get: invoke(IPC.tyres.clients.get),
      create: invoke(IPC.tyres.clients.create),
      update: invoke(IPC.tyres.clients.update),
    },
    vehicles: {
      list: invoke(IPC.tyres.vehicles.list),
      get: invoke(IPC.tyres.vehicles.get),
      create: invoke(IPC.tyres.vehicles.create),
      update: invoke(IPC.tyres.vehicles.update),
    },
    storage: {
      list: invoke(IPC.tyres.storage.list),
      get: invoke(IPC.tyres.storage.get),
      create: invoke(IPC.tyres.storage.create),
      update: invoke(IPC.tyres.storage.update),
      pickup: invoke(IPC.tyres.storage.pickup),
      returnToStorage: invoke(IPC.tyres.storage.returnToStorage),
    },
    dashboard: {
      get: invoke(IPC.tyres.dashboard.get),
      todos: invoke(IPC.tyres.dashboard.todos),
    },
    whatsapp: {
      send: invoke(IPC.tyres.whatsapp.send),
    },
    appointments: {
      list: invoke(IPC.tyres.appointments.list),
      get: invoke(IPC.tyres.appointments.get),
      create: invoke(IPC.tyres.appointments.create),
      update: invoke(IPC.tyres.appointments.update),
      setStatus: invoke(IPC.tyres.appointments.setStatus),
    },
    swaps: {
      list: invoke(IPC.tyres.swaps.list),
      get: invoke(IPC.tyres.swaps.get),
      create: invoke(IPC.tyres.swaps.create),
    },
    messages: {
      list: invoke(IPC.tyres.messages.list),
    },
    seasonReminders: {
      getSettings: invoke(IPC.tyres.seasonReminders.getSettings),
      saveSettings: invoke(IPC.tyres.seasonReminders.saveSettings),
      status: invoke(IPC.tyres.seasonReminders.status),
    },
  },
  backup: {
    create: invoke(IPC.backup.create),
    list: invoke(IPC.backup.list),
    restore: invoke(IPC.backup.restore),
  },
  events: {
    onNavigate: (cb: (route: string) => void): (() => void) => {
      const listener = (_e: unknown, route: string) => cb(route);
      ipcRenderer.on(IPC.events.navigate, listener);
      return () => {
        ipcRenderer.removeListener(IPC.events.navigate, listener);
      };
    },
    onDataChanged: (cb: () => void): (() => void) => {
      const listener = () => cb();
      ipcRenderer.on(IPC.events.dataChanged, listener);
      return () => {
        ipcRenderer.removeListener(IPC.events.dataChanged, listener);
      };
    },
  },
};

export type DddApi = typeof api;

contextBridge.exposeInMainWorld('ddd', api);
