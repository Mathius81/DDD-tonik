/**
 * Contractul IPC: fiecare canal are un nume unic.
 * Main validează payload-ul cu schema zod corespunzătoare înainte de execuție.
 */
export const IPC = {
  associations: {
    list: 'associations:list',
    get: 'associations:get',
    create: 'associations:create',
    update: 'associations:update',
    setActive: 'associations:setActive',
  },
  contacts: {
    listByAssociation: 'contacts:listByAssociation',
    create: 'contacts:create',
    update: 'contacts:update',
    delete: 'contacts:delete',
  },
  services: {
    list: 'services:list',
    create: 'services:create',
    update: 'services:update',
  },
  interventions: {
    list: 'interventions:list',
    create: 'interventions:create',
    previewDueDate: 'interventions:previewDueDate',
  },
  followups: {
    list: 'followups:list',
    markContacted: 'followups:markContacted',
    schedule: 'followups:schedule',
    cancel: 'followups:cancel',
  },
  reminders: {
    list: 'reminders:list',
    retry: 'reminders:retry',
    cancel: 'reminders:cancel',
  },
  messages: {
    templates: {
      list: 'messages:templates:list',
      create: 'messages:templates:create',
      update: 'messages:templates:update',
    },
    send: 'messages:send',
    preview: 'messages:preview',
    markSent: 'messages:markSent',
    log: 'messages:log',
  },
  dashboard: {
    get: 'dashboard:get',
    calendarMonth: 'dashboard:calendarMonth',
    notifications: 'dashboard:notifications',
  },
  settings: {
    get: 'settings:get',
    update: 'settings:update',
    setSecret: 'settings:setSecret',
    testSmtp: 'settings:testSmtp',
    chooseBackupFolder: 'settings:chooseBackupFolder',
  },
  backup: {
    create: 'backup:create',
    list: 'backup:list',
    restore: 'backup:restore',
  },
  events: {
    /** main → renderer: navighează la o rută (click pe notificare). */
    navigate: 'events:navigate',
    /** main → renderer: datele s-au schimbat în fundal (scheduler). */
    dataChanged: 'events:dataChanged',
  },
} as const;

/** Răspuns standard pentru operațiile IPC care pot eșua controlat. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };
