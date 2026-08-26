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

/**
 * Poarta cu parolă a meniului secret — vezi `about.ipc.ts` pentru verificare
 * (scrypt + timingSafeEqual, exclusiv în main; hash-ul și sarea nu ajung
 * niciodată în renderer).
 */
export interface AboutSecretMenuStatus {
  /** Dacă parola a fost deja setată. Altfel, ecranul cere SETAREA ei, nu introducerea. */
  hasPassword: boolean;
  /** `Date.now()` până la care ecranul e blocat (prea multe încercări greșite), sau null. */
  lockedUntil: number | null;
}

/** Rezultatul unei încercări de deblocare a meniului secret. */
export interface AboutSecretMenuVerifyResult {
  success: boolean;
  /** Setat doar dacă această încercare a declanșat blocajul de 60 de secunde. */
  lockedUntil: number | null;
  /** Câte încercări mai sunt disponibile înainte de blocaj (informativ). */
  attemptsLeft: number;
}

/** Setează parola meniului secret — permis o singură dată, cât timp nu există deja una. */
export const secretMenuSetPasswordSchema = z.object({
  password: z.string().min(4).max(200),
});
export type SecretMenuSetPasswordInput = z.infer<typeof secretMenuSetPasswordSchema>;

/** Verifică parola meniului secret la fiecare deschidere. */
export const secretMenuVerifyPasswordSchema = z.object({
  password: z.string().min(1).max(200),
});
export type SecretMenuVerifyPasswordInput = z.infer<typeof secretMenuVerifyPasswordSchema>;

/** Schimbă parola meniului secret — cere parola veche corectă + una nouă. */
export const secretMenuChangePasswordSchema = z.object({
  oldPassword: z.string().min(1).max(200),
  newPassword: z.string().min(4).max(200),
});
export type SecretMenuChangePasswordInput = z.infer<typeof secretMenuChangePasswordSchema>;

/**
 * O componentă open-source din THIRD-PARTY-LICENSES.txt — DOAR metadatele,
 * fără textul integral al licenței (acela se cere separat, per pachet, ca să
 * nu se trimită dintr-o dată în renderer textul a zeci de licențe).
 */
export interface AboutThirdPartyPackage {
  name: string;
  version: string;
  license: string;
  copyright: string;
}

/** Lista componentelor open-source — vezi „Licențe și componente open-source” din Despre. */
export interface AboutThirdPartyLicenses {
  /** False dacă THIRD-PARTY-LICENSES.txt lipsește (ex. n-a fost încă rulat `npm run licenses`). */
  fileFound: boolean;
  packages: AboutThirdPartyPackage[];
}

/** Cere textul integral al licenței unei singure componente, identificată prin nume+versiune. */
export const thirdPartyLicenseTextSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
});
export type ThirdPartyLicenseTextInput = z.infer<typeof thirdPartyLicenseTextSchema>;

/** Textul integral al licenței unei componente, cerut la nevoie (nu odată cu lista). */
export interface AboutThirdPartyLicenseText {
  found: boolean;
  text: string;
}
