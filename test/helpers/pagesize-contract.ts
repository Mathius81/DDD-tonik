import fs from 'node:fs';
import path from 'node:path';

/**
 * Citește codul SURSĂ real al unui fișier din renderer și extrage valoarea literală
 * `pageSize: N` dintr-un apel `ddd.<domeniu>.<listă>.list({ page: 1, pageSize: N })`.
 *
 * Scopul: lega testul de CODUL REAL al modalului, nu de o presupunere despre ce trimite —
 * dacă cineva schimbă valoarea (ex. o pune înapoi la 500), testul citește noua valoare din
 * sursă și o validează cu schema zod REALĂ folosită de handler-ul IPC. Așa pică testul dacă
 * reparația e anulată, nu doar dacă cineva schimbă manual o constantă din test.
 */
export function extractPageSizeFromRenderer(relativeFilePath: string, callPattern: RegExp): number {
  const absPath = path.resolve(process.cwd(), relativeFilePath);
  const source = fs.readFileSync(absPath, 'utf-8');
  const match = source.match(callPattern);
  if (!match) {
    throw new Error(
      `Nu am găsit apelul așteptat în ${relativeFilePath} (pattern: ${callPattern.source}). ` +
        'Verifică dacă modalul a fost refactorizat — testul de contract trebuie actualizat.',
    );
  }
  return Number(match[1]);
}
