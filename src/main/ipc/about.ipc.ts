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
  AboutStats,
  AboutTableCounts,
  AboutTopAssociation,
} from '../../shared/schemas/about';
import { resetReportGuardSchema } from '../../shared/schemas/about';
import { AUTHOR_NAME, AUTHOR_EMAIL, COPYRIGHT_YEAR } from '../../shared/authorship';

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
}
