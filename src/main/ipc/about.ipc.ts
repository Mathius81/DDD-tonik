/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { app, shell } from 'electron';
import { handle, UserFacingError } from './register';
import { IPC } from '../../shared/ipc-contract';
import { currentSchemaVersion } from '../db/migrations';
import type { AppContext } from '../app-context';
import type { LicenseService } from '../services/license.service';
import type {
  AboutBackupSummary,
  AboutDiagnostics,
  AboutInfo,
  AboutLicenseSummary,
  AboutMonthlyPeak,
  AboutSecretMenuStatus,
  AboutSecretMenuVerifyResult,
  AboutStats,
  AboutTableCounts,
  AboutThirdPartyLicenseText,
  AboutThirdPartyLicenses,
  AboutTopAssociation,
} from '../../shared/schemas/about';
import {
  resetReportGuardSchema,
  secretMenuChangePasswordSchema,
  secretMenuSetPasswordSchema,
  secretMenuVerifyPasswordSchema,
  thirdPartyLicenseTextSchema,
} from '../../shared/schemas/about';
import { AUTHOR_NAME, AUTHOR_EMAIL, COPYRIGHT_YEAR } from '../../shared/authorship';

/**
 * Parola meniului secret — stocată prin `settings.setRaw`, ca la licență, NU
 * în `settingsSchema` (nu are voie să circule prin IPC-ul normal de setări).
 * Sare aleatoare per parolă + hash `scrypt`; comparația la verificare se face
 * cu `timingSafeEqual`. Hash-ul și sarea nu părăsesc niciodată acest fișier.
 */
const SECRET_MENU_SALT_KEY = 'secret_menu_password_salt';
const SECRET_MENU_HASH_KEY = 'secret_menu_password_hash';
const SECRET_MENU_KEYLEN = 64;
const SECRET_MENU_MAX_ATTEMPTS = 5;
const SECRET_MENU_LOCKOUT_MS = 60_000;

function hashSecretMenuPassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SECRET_MENU_KEYLEN).toString('hex');
  return { salt, hash };
}

/** Compară parola introdusă cu hash-ul stocat, în timp constant. */
function verifySecretMenuPassword(password: string, salt: string, expectedHashHex: string): boolean {
  const candidate = scryptSync(password, salt, SECRET_MENU_KEYLEN);
  const expected = Buffer.from(expectedHashHex, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

/** Prima pornire înregistrată + numărul de porniri, ținute în `settings`. */
const FIRST_RUN_KEY = 'first_run_date';
const RUN_COUNT_KEY = 'app_run_count';

/**
 * Cheia gărzii „trimis azi” pentru un raport, definită în `daily-digest.service.ts`
 * (acel fișier e în afara scopului acestei lucrări, deci NU e importat de aici —
 * formatul cheii e stabil și acoperit de teste proprii, `${LAST_DIGEST_KEY}::${id}`).
 */
function reportGuardKey(reportId: string): string {
  return `last_daily_digest_date::${reportId}`;
}

/** Câte zile calendaristice sunt între două date 'YYYY-MM-DD' (niciodată negativ). */
function daysBetween(fromIso: string, toIso: string): number {
  return Math.max(0, Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000));
}

/** Folderul de backup efectiv: cel ales de utilizator, dacă există, altfel cel implicit. */
function resolveBackupDir(ctx: AppContext): string {
  const custom = ctx.settings.get().backup.custom_folder;
  return custom && fs.existsSync(custom) ? custom : ctx.paths.backupsDir;
}

/** Ultimul backup găsit pe disc (cel mai recent după numele fișierului). */
function readLastBackup(ctx: AppContext): AboutBackupSummary | null {
  const dir = resolveBackupDir(ctx);
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('ddd-manager-') && f.endsWith('.sqlite'))
    .sort()
    .reverse();
  if (!files.length) return null;
  const stat = fs.statSync(path.join(dir, files[0]));
  return {
    name: files[0],
    createdAt: stat.mtime.toISOString().replace('T', ' ').slice(0, 19),
    sizeBytes: stat.size,
  };
}

/** Ultimele ~20 de linii ERROR din logul zilei curente — pentru un telefon de suport. */
function readRecentErrors(logsDir: string): string[] {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const file = path.join(logsDir, `ddd-${day}.log`);
    if (!fs.existsSync(file)) return [];
    const lines = fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => l.includes('] ERROR '));
    return lines.slice(-20);
  } catch {
    // Un log ilizibil nu trebuie să strice diagnosticul — restul raportului tot are valoare.
    return [];
  }
}

// --- Licențele componentelor open-source (THIRD-PARTY-LICENSES.txt) --------
// Generat de `tools/third-party-licenses.mjs` (npm run licenses) și comis în
// git. La runtime, calea diferă: în dezvoltare e în rădăcina proiectului
// (`app.getAppPath()`), în aplicația împachetată e lângă executabil, copiat
// acolo de `packagerConfig.extraResource` din forge.config.ts.
const THIRD_PARTY_FILE_NAME = 'THIRD-PARTY-LICENSES.txt';
const THIRD_PARTY_PACKAGE_MARKER = '<<<TONIK-THIRD-PARTY-PACKAGE>>>';
const THIRD_PARTY_BODY_SEPARATOR = '\n---\n';

interface ThirdPartyEntry {
  name: string;
  version: string;
  license: string;
  copyright: string;
  text: string;
}

function resolveThirdPartyLicensesPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, THIRD_PARTY_FILE_NAME)
    : path.join(app.getAppPath(), THIRD_PARTY_FILE_NAME);
}

/** Citește și parsează THIRD-PARTY-LICENSES.txt după marcatorii scriși de generator. */
function readThirdPartyEntries(filePath: string): ThirdPartyEntry[] | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  const chunks = raw.split(`\n${THIRD_PARTY_PACKAGE_MARKER}\n`).slice(1);
  const entries: ThirdPartyEntry[] = [];
  for (const chunk of chunks) {
    const bodyStart = chunk.indexOf(THIRD_PARTY_BODY_SEPARATOR);
    if (bodyStart === -1) continue;
    const meta = chunk.slice(0, bodyStart);
    const text = chunk.slice(bodyStart + THIRD_PARTY_BODY_SEPARATOR.length).replace(/\n+$/, '');
    const pachet = /^Pachet:\s*(.+)$/m.exec(meta)?.[1]?.trim() ?? '';
    const licenta = /^Licen[țt]ă:\s*(.+)$/m.exec(meta)?.[1]?.trim() ?? 'necunoscută';
    const copyright = /^Copyright:\s*(.+)$/m.exec(meta)?.[1]?.trim() ?? 'necunoscut';
    if (!pachet) continue;
    const at = pachet.lastIndexOf('@');
    const name = at > 0 ? pachet.slice(0, at) : pachet;
    const version = at > 0 ? pachet.slice(at + 1) : '';
    entries.push({ name, version, license: licenta, copyright, text });
  }
  return entries;
}

function toLicenseSummary(ctx: AppContext, license: LicenseService): AboutLicenseSummary {
  const state = license.check();
  if (state.status === 'valid') {
    return { status: 'valid', expiresAt: state.expiresAt, daysLeft: state.daysLeft };
  }
  if (state.status === 'expired') {
    return { status: 'expired', expiresAt: state.expiresAt };
  }
  return { status: 'missing' };
  // (parametrul `ctx` e păstrat pentru simetrie cu celelalte funcții helper de mai sus,
  // deși nu e folosit direct aici — licența nu are nevoie de altceva decât de `license`.)
}

function tableCounts(ctx: AppContext): AboutTableCounts {
  const count = (sql: string) => ctx.db.get<{ n: number }>(sql)?.n ?? 0;
  return {
    associations: count('SELECT COUNT(*) AS n FROM associations'),
    contacts: count('SELECT COUNT(*) AS n FROM contacts'),
    interventions: count('SELECT COUNT(*) AS n FROM interventions'),
    followups: count('SELECT COUNT(*) AS n FROM followups'),
    reminders: count('SELECT COUNT(*) AS n FROM reminders'),
    messages: count('SELECT COUNT(*) AS n FROM message_logs'),
    carpetClients: count('SELECT COUNT(*) AS n FROM carpet_clients'),
    carpetOrders: count('SELECT COUNT(*) AS n FROM carpet_orders'),
    tyreClients: count('SELECT COUNT(*) AS n FROM tyre_clients'),
    tyreVehicles: count('SELECT COUNT(*) AS n FROM tyre_vehicles'),
    tyreStorageSets: count('SELECT COUNT(*) AS n FROM tyre_storage_sets'),
  };
}

/**
 * Înregistrează o pornire a aplicației. Apelat o singură dată la bootstrap.
 * Datele alimentează ecranul „Despre” și mesajul personal al autorului.
 */
export function recordAppRun(ctx: AppContext): void {
  const today = ctx.todayIso();
  if (!ctx.settings.getRaw(FIRST_RUN_KEY)) {
    ctx.settings.setRaw(FIRST_RUN_KEY, today);
  }
  const count = Number(ctx.settings.getRaw(RUN_COUNT_KEY) ?? '0');
  ctx.settings.setRaw(RUN_COUNT_KEY, String(Number.isFinite(count) ? count + 1 : 1));
}

export function registerAboutHandlers(ctx: AppContext, license: LicenseService): void {
  handle(IPC.about.get, null, (): AboutInfo => {
    const firstRun = ctx.settings.getRaw(FIRST_RUN_KEY) ?? ctx.todayIso();
    const runCount = Number(ctx.settings.getRaw(RUN_COUNT_KEY) ?? '1');

    // Câte zile de când folosești aplicația — se calculează pe date calendaristice.
    const days = daysBetween(firstRun, ctx.todayIso());

    // Munca strânsă în aplicație, pe cele trei spații de lucru.
    const associations = ctx.associations.list({ status: 'all', page: 1, pageSize: 1 }).total;
    const interventions = ctx.interventions.list({ page: 1, pageSize: 1 }).total;

    return {
      author: AUTHOR_NAME,
      email: AUTHOR_EMAIL,
      copyrightYear: COPYRIGHT_YEAR,
      version: app.getVersion(),
      electronVersion: process.versions.electron,
      firstRun,
      daysSinceFirstRun: days,
      runCount: Number.isFinite(runCount) ? runCount : 1,
      associations,
      interventions,
    };
  });

  // Tab „Diagnostic” din meniul secret — ce ar întreba un telefon de suport.
  handle(IPC.about.diagnostics, null, (): AboutDiagnostics => {
    return {
      tableCounts: tableCounts(ctx),
      schemaVersion: currentSchemaVersion(ctx.db),
      lastBackup: readLastBackup(ctx),
      license: toLicenseSummary(ctx, license),
      dbPath: ctx.paths.dbFile,
      logsPath: ctx.paths.logsDir,
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      chromeVersion: process.versions.chrome,
      recentErrors: readRecentErrors(ctx.paths.logsDir),
    };
  });

  // Tab „Statisticile tale” din meniul secret — bilanț personal, ton prietenos.
  handle(IPC.about.stats, null, (): AboutStats => {
    const firstRun = ctx.settings.getRaw(FIRST_RUN_KEY) ?? ctx.todayIso();
    const totalInterventions = ctx.interventions.list({ page: 1, pageSize: 1 }).total;
    const totalMessagesSent =
      ctx.db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM message_logs WHERE status IN ('confirmed_sent','accepted_by_provider')`,
      )?.n ?? 0;

    const monthRows = ctx.db.all<{ month: string; n: number }>(
      `SELECT substr(performed_date, 1, 7) AS month, COUNT(*) AS n
       FROM interventions GROUP BY month ORDER BY n DESC, month DESC LIMIT 1`,
    );
    const busiestMonth: AboutMonthlyPeak | null = monthRows[0]
      ? { month: monthRows[0].month, count: monthRows[0].n }
      : null;

    const topRows = ctx.db.all<{ name: string; n: number }>(
      `SELECT a.name AS name, COUNT(*) AS n
       FROM interventions i
       JOIN associations a ON a.id = i.association_id
       GROUP BY i.association_id ORDER BY n DESC, a.name ASC LIMIT 1`,
    );
    const topAssociation: AboutTopAssociation | null = topRows[0]
      ? { name: topRows[0].name, count: topRows[0].n }
      : null;

    const monthsSpan =
      ctx.db.get<{ months: number }>(
        `SELECT COUNT(DISTINCT substr(performed_date, 1, 7)) AS months FROM interventions`,
      )?.months ?? 0;
    const monthlyAverage = monthsSpan > 0 ? totalInterventions / monthsSpan : 0;

    return {
      firstRun,
      daysSinceFirstRun: daysBetween(firstRun, ctx.todayIso()),
      totalInterventions,
      totalMessagesSent,
      busiestMonth,
      topAssociation,
      monthlyAverage,
    };
  });

  // Consola de service — resetează garda „trimis azi” ca un raport să poată fi retrimis azi.
  // Acțiune care modifică stare: renderer-ul TREBUIE să ceară confirmare înainte de a apela asta.
  handle(IPC.about.resetReportGuard, resetReportGuardSchema, ({ report }) => {
    ctx.settings.deleteRaw(reportGuardKey(report));
    ctx.logger.info(`Gardă de trimitere resetată manual (consola de service) pentru raportul ${report}`);
    return { reset: true };
  });

  // Consola de service — acțiuni doar de citire (deschid un folder în Finder/Explorer).
  handle(IPC.about.openLogsFolder, null, async () => {
    const err = await shell.openPath(ctx.paths.logsDir);
    if (err) throw new UserFacingError(`Nu am putut deschide folderul de loguri: ${err}`);
    return { opened: true };
  });

  handle(IPC.about.openBackupsFolder, null, async () => {
    const err = await shell.openPath(resolveBackupDir(ctx));
    if (err) throw new UserFacingError(`Nu am putut deschide folderul de backup-uri: ${err}`);
    return { opened: true };
  });

  // Licențele componentelor open-source — modalul din Despre. Lista întoarce
  // doar metadatele (nume, versiune, licență, copyright); textul integral se
  // cere separat, per pachet, ca să nu circule prin IPC dintr-o dată zeci de
  // licențe întregi.
  handle(IPC.about.thirdPartyLicenses.list, null, (): AboutThirdPartyLicenses => {
    const entries = readThirdPartyEntries(resolveThirdPartyLicensesPath());
    if (!entries) return { fileFound: false, packages: [] };
    return {
      fileFound: true,
      packages: entries.map(({ name, version, license, copyright }) => ({ name, version, license, copyright })),
    };
  });

  handle(
    IPC.about.thirdPartyLicenses.getText,
    thirdPartyLicenseTextSchema,
    ({ name, version }): AboutThirdPartyLicenseText => {
      const entries = readThirdPartyEntries(resolveThirdPartyLicensesPath());
      const match = entries?.find((e) => e.name === name && e.version === version);
      return match ? { found: true, text: match.text } : { found: false, text: '' };
    },
  );

  handle(IPC.about.thirdPartyLicenses.openFile, null, async () => {
    const filePath = resolveThirdPartyLicensesPath();
    if (!fs.existsSync(filePath)) {
      throw new UserFacingError('Fișierul THIRD-PARTY-LICENSES.txt nu a fost găsit.');
    }
    const err = await shell.openPath(filePath);
    if (err) throw new UserFacingError(`Nu am putut deschide fișierul: ${err}`);
    return { opened: true };
  });

  // --- Poarta cu parolă a meniului secret --------------------------------
  // Stare doar în memorie (nu trebuie persistată) — trăiește cât aplicația e
  // pornită, într-o închidere proprie acestei înregistrări de handlere.
  let failedAttempts = 0;
  let lockedUntil: number | null = null;

  /** Milisecunde rămase din blocaj; resetează contorul când blocajul a expirat. */
  const lockRemainingMs = (): number => {
    if (lockedUntil === null) return 0;
    const remaining = lockedUntil - Date.now();
    if (remaining <= 0) {
      lockedUntil = null;
      failedAttempts = 0;
      return 0;
    }
    return remaining;
  };

  /** Înregistrează o încercare greșită; blochează ecranul după prea multe. */
  const registerFailedAttempt = (): number | null => {
    failedAttempts += 1;
    if (failedAttempts >= SECRET_MENU_MAX_ATTEMPTS) {
      lockedUntil = Date.now() + SECRET_MENU_LOCKOUT_MS;
      return lockedUntil;
    }
    return null;
  };

  const clearFailedAttempts = (): void => {
    failedAttempts = 0;
    lockedUntil = null;
  };

  handle(IPC.about.secretMenuStatus, null, (): AboutSecretMenuStatus => {
    const remaining = lockRemainingMs();
    return {
      hasPassword: Boolean(ctx.settings.getRaw(SECRET_MENU_HASH_KEY)),
      lockedUntil: remaining > 0 ? Date.now() + remaining : null,
    };
  });

  // Setarea parolei e permisă o singură dată — după aceea se folosește
  // `secretMenuChangePassword`, care cere parola veche.
  handle(IPC.about.secretMenuSetPassword, secretMenuSetPasswordSchema, ({ password }) => {
    if (ctx.settings.getRaw(SECRET_MENU_HASH_KEY)) {
      throw new UserFacingError('Parola este deja setată — folosește schimbarea parolei.');
    }
    const { salt, hash } = hashSecretMenuPassword(password);
    ctx.settings.setRaw(SECRET_MENU_SALT_KEY, salt);
    ctx.settings.setRaw(SECRET_MENU_HASH_KEY, hash);
    ctx.logger.info('Parola meniului secret a fost setată.');
    return { success: true };
  });

  handle(
    IPC.about.secretMenuVerifyPassword,
    secretMenuVerifyPasswordSchema,
    ({ password }): AboutSecretMenuVerifyResult => {
      const remaining = lockRemainingMs();
      if (remaining > 0) {
        return { success: false, lockedUntil: Date.now() + remaining, attemptsLeft: 0 };
      }

      const salt = ctx.settings.getRaw(SECRET_MENU_SALT_KEY);
      const hash = ctx.settings.getRaw(SECRET_MENU_HASH_KEY);
      if (!salt || !hash) {
        throw new UserFacingError('Parola meniului secret nu a fost încă setată.');
      }

      if (verifySecretMenuPassword(password, salt, hash)) {
        clearFailedAttempts();
        return { success: true, lockedUntil: null, attemptsLeft: SECRET_MENU_MAX_ATTEMPTS };
      }

      const lockedNow = registerFailedAttempt();
      return {
        success: false,
        lockedUntil: lockedNow,
        attemptsLeft: Math.max(0, SECRET_MENU_MAX_ATTEMPTS - failedAttempts),
      };
    },
  );

  handle(IPC.about.secretMenuChangePassword, secretMenuChangePasswordSchema, ({ oldPassword, newPassword }) => {
    const remaining = lockRemainingMs();
    if (remaining > 0) {
      throw new UserFacingError(
        `Prea multe încercări. Încearcă din nou peste ${Math.ceil(remaining / 1000)} secunde.`,
      );
    }

    const salt = ctx.settings.getRaw(SECRET_MENU_SALT_KEY);
    const hash = ctx.settings.getRaw(SECRET_MENU_HASH_KEY);
    if (!salt || !hash) {
      throw new UserFacingError('Parola meniului secret nu a fost încă setată.');
    }

    if (!verifySecretMenuPassword(oldPassword, salt, hash)) {
      registerFailedAttempt();
      throw new UserFacingError('Parola veche este greșită.');
    }

    clearFailedAttempts();
    const { salt: newSalt, hash: newHash } = hashSecretMenuPassword(newPassword);
    ctx.settings.setRaw(SECRET_MENU_SALT_KEY, newSalt);
    ctx.settings.setRaw(SECRET_MENU_HASH_KEY, newHash);
    ctx.logger.info('Parola meniului secret a fost schimbată.');
    return { success: true };
  });
}
