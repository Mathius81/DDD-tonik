/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import type { AppContext } from '../../app-context';
import type { ReportId, ReportPeriod, ReportWorkspace } from '../../../shared/schemas/settings';
import { buildDddReport } from './ddd-report';
import { buildCovoareReport } from './covoare-report';
import { buildCauciucuriReport } from './cauciucuri-report';
import type { ReportContent } from './report-types';

export type { ReportContent } from './report-types';

/** 'ddd_dimineata' → ['ddd', 'dimineata']. Fiecare id are un singur „_”. */
export function splitReportId(id: ReportId): [ReportWorkspace, ReportPeriod] {
  const sep = id.indexOf('_');
  return [id.slice(0, sep) as ReportWorkspace, id.slice(sep + 1) as ReportPeriod];
}

/** Construiește conținutul raportului cerut, cu data de azi ca reper. */
export function buildReportContent(ctx: AppContext, id: ReportId): ReportContent {
  const todayIso = ctx.todayIso();
  const [workspace, period] = splitReportId(id);
  switch (workspace) {
    case 'ddd':
      return buildDddReport(ctx, todayIso, period);
    case 'covoare':
      return buildCovoareReport(ctx, todayIso, period);
    case 'cauciucuri':
      return buildCauciucuriReport(ctx, todayIso, period);
    default: {
      const exhaustive: never = workspace;
      throw new Error(`Spațiu de lucru necunoscut pentru raport: ${exhaustive}`);
    }
  }
}
