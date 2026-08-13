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
    log: invoke(IPC.messages.log),
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
    chooseBackupFolder: invoke(IPC.settings.chooseBackupFolder),
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
