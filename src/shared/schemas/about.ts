/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE.
 */
import { z } from 'zod';
import { reportIds } from './settings';

/** Datele afișate în „Despre” și în mesajul personal al autorului. */
export interface AboutInfo {
  author: string;
  email: string;
  copyrightYear: number;
  version: string;
  electronVersion: string;
  /** 'YYYY-MM-DD' — prima pornire înregistrată a aplicației. */
  firstRun: string;
  daysSinceFirstRun: number;
  runCount: number;
  associations: number;
  interventions: number;
}

/** Numărul de rânduri pe fiecare tabel — folosit în tab-ul „Diagnostic”. */
export interface AboutTableCounts {
  associations: number;
  contacts: number;
  interventions: number;
  followups: number;
  reminders: number;
  messages: number;
  carpetClients: number;
  carpetOrders: number;
  tyreClients: number;
  tyreVehicles: number;
  tyreStorageSets: number;
}

/** Rezumatul stării licenței, pentru afișare (nu conține token-ul brut). */
export type AboutLicenseSummary =
  | { status: 'valid'; expiresAt: string; daysLeft: number }
  | { status: 'expired'; expiresAt: string }
  | { status: 'missing' };

/** Ultimul backup găsit pe disc. */
export interface AboutBackupSummary {
  name: string;
  /** 'YYYY-MM-DD HH:mm:ss' */
  createdAt: string;
  sizeBytes: number;
}

/** Ce ar întreba un telefon de suport — vezi tab-ul „Diagnostic” din meniul secret. */
export interface AboutDiagnostics {
  tableCounts: AboutTableCounts;
  schemaVersion: number;
  lastBackup: AboutBackupSummary | null;
  license: AboutLicenseSummary;
  dbPath: string;
  logsPath: string;
  electronVersion: string;
  nodeVersion: string;
  chromeVersion: string;
  /** Ultimele ~20 de linii de nivel ERROR din logul zilei curente. */
  recentErrors: string[];
}

/** Cea mai aglomerată lună (după numărul de intervenții). */
export interface AboutMonthlyPeak {
  /** 'YYYY-MM' */
  month: string;
  count: number;
}

/** Asociația/clientul cu cele mai multe lucrări înregistrate. */
export interface AboutTopAssociation {
  name: string;
  count: number;
}

/** Bilanțul personal al utilizatorului — tab-ul „Statisticile tale”. */
export interface AboutStats {
  /** 'YYYY-MM-DD' — prima pornire înregistrată a aplicației. */
  firstRun: string;
  daysSinceFirstRun: number;
  totalInterventions: number;
  totalMessagesSent: number;
  busiestMonth: AboutMonthlyPeak | null;
  topAssociation: AboutTopAssociation | null;
  monthlyAverage: number;
}

/** Resetează marcajul „trimis azi” al unui raport zilnic — consola de service. */
export const resetReportGuardSchema = z.object({ report: z.enum(reportIds) });
export type ResetReportGuardInput = z.infer<typeof resetReportGuardSchema>;
