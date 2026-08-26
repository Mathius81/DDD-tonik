/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
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
    counts: 'reminders:counts',
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
    resend: 'messages:resend',
    log: 'messages:log',
    counts: 'messages:counts',
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
    /** Verifică token + Phone Number ID pentru WhatsApp Business Cloud API. */
    testWhatsapp: 'settings:testWhatsapp',
    sendDigestNow: 'settings:sendDigestNow',
    chooseBackupFolder: 'settings:chooseBackupFolder',
    whatsappTemplateMap: {
      list: 'settings:whatsappTemplateMap:list',
      upsert: 'settings:whatsappTemplateMap:upsert',
      delete: 'settings:whatsappTemplateMap:delete',
    },
  },
  license: {
    check: 'license:check',
    activate: 'license:activate',
  },
  /** Date de autor + statistici personale („Despre” și meniul secret al autorului). */
  about: {
    get: 'about:get',
    /** Ce ar întreba un telefon de suport — tab „Diagnostic”. */
    diagnostics: 'about:diagnostics',
    /** Bilanțul personal al utilizatorului — tab „Statisticile tale”. */
    stats: 'about:stats',
    /** Resetează marcajul „trimis azi” al unui raport, ca să poată fi retrimis azi. */
    resetReportGuard: 'about:resetReportGuard',
    openLogsFolder: 'about:openLogsFolder',
    openBackupsFolder: 'about:openBackupsFolder',
  },
  /** Spațiul de lucru Covoare (spălare covoare) — date izolate de DDD. */
  carpets: {
    clients: {
      list: 'carpets:clients:list',
      get: 'carpets:clients:get',
      create: 'carpets:clients:create',
      update: 'carpets:clients:update',
    },
    orders: {
      list: 'carpets:orders:list',
      get: 'carpets:orders:get',
      create: 'carpets:orders:create',
      update: 'carpets:orders:update',
      setStatus: 'carpets:orders:setStatus',
    },
    dashboard: {
      get: 'carpets:dashboard:get',
    },
    calendar: {
      month: 'carpets:calendar:month',
    },
    settings: {
      get: 'carpets:settings:get',
      update: 'carpets:settings:update',
    },
    reminders: {
      get: 'carpets:reminders:get',
    },
    messages: {
      list: 'carpets:messages:list',
    },
    /** Mesaj WhatsApp asistat: deschide wa.me cu textul pregătit, ca în DDD/Cauciucuri. */
    whatsapp: {
      send: 'carpets:whatsapp:send',
    },
  },
  /** Spațiul de lucru Cauciucuri (vulcanizare + hotel de cauciucuri) — date izolate de DDD/Covoare. */
  tyres: {
    clients: {
      list: 'tyres:clients:list',
      get: 'tyres:clients:get',
      create: 'tyres:clients:create',
      update: 'tyres:clients:update',
    },
    vehicles: {
      list: 'tyres:vehicles:list',
      get: 'tyres:vehicles:get',
      create: 'tyres:vehicles:create',
      update: 'tyres:vehicles:update',
    },
    storage: {
      list: 'tyres:storage:list',
      get: 'tyres:storage:get',
      create: 'tyres:storage:create',
      update: 'tyres:storage:update',
      pickup: 'tyres:storage:pickup',
      returnToStorage: 'tyres:storage:returnToStorage',
    },
    dashboard: {
      get: 'tyres:dashboard:get',
    },
    /** Mesaj WhatsApp asistat: deschide wa.me cu textul pregătit, ca în DDD. */
    whatsapp: {
      send: 'tyres:whatsapp:send',
    },
    appointments: {
      list: 'tyres:appointments:list',
      get: 'tyres:appointments:get',
      create: 'tyres:appointments:create',
      update: 'tyres:appointments:update',
      setStatus: 'tyres:appointments:setStatus',
    },
    /** Schimb de sezon — mută (atomic) setul montat/demontat din/în depozit. */
    swaps: {
      list: 'tyres:swaps:list',
      get: 'tyres:swaps:get',
      create: 'tyres:swaps:create',
    },
    /** Istoricul mesajelor WhatsApp Cauciucuri (manual + remindere automate de sezon). */
    messages: {
      list: 'tyres:messages:list',
    },
    /** Remindere automate de sezon — vezi tyre-season-reminder.service.ts. */
    seasonReminders: {
      getSettings: 'tyres:seasonReminders:getSettings',
      saveSettings: 'tyres:seasonReminders:saveSettings',
      status: 'tyres:seasonReminders:status',
    },
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
