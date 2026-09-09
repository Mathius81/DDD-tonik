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
 * Construiește `build-assets/icon.ico` din logo-ul firmei, pentru executabilul
 * de Windows (bara de activități, scurtătura de pe desktop, Proprietăți).
 *
 * De ce un script propriu: pe macOS nu există `png2ico`/ImageMagick preinstalate,
 * iar `iconutil` produce doar `.icns` (macOS), nu `.ico`. Formatul ICO e însă
 * simplu — un antet, câte o intrare de director per dimensiune, apoi imaginile.
 * Windows Vista+ acceptă imagini PNG direct în interiorul ICO, deci nu trebuie
 * scris encoder BMP: refolosim PNG-urile redimensionate cu `sips`.
 *
 * Rulare:  node tools/make-ico.mjs
 * Cere:    `sips` (preinstalat pe macOS) — vezi `npm run icon`.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SURSA = 'logo/ChatGPT Image Aug 14, 2026, 10_32_41 AM.png';
const DESTINATIE = 'build-assets/icon.ico';
/** Dimensiunile cerute de Windows: 16 pentru bara de activități, 256 pentru vederea „Extra large”. */
const DIMENSIUNI = [16, 24, 32, 48, 64, 128, 256];

if (!fs.existsSync(SURSA)) {
  console.error(`Lipsește logo-ul sursă: ${SURSA}`);
  process.exit(1);
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tonik-ico-'));
try {
  // Logo-ul e lat (1672×941). Îl încadrăm într-un pătrat, cu spațiu transparent
  // sus și jos, ca să nu fie tăiat nimic din el la conversie.
  const patrat = path.join(temp, 'patrat.png');
  execFileSync('sips', ['-p', '1672', '1672', SURSA, '--out', patrat], { stdio: 'ignore' });

  const imagini = DIMENSIUNI.map((dim) => {
    const fisier = path.join(temp, `icon-${dim}.png`);
    execFileSync('sips', ['-z', String(dim), String(dim), patrat, '--out', fisier], {
      stdio: 'ignore',
    });
    return { dim, date: fs.readFileSync(fisier) };
  });

  // Antetul ICO: 0 rezervat, tipul 1 (icoană), numărul de imagini.
  const antet = Buffer.alloc(6);
  antet.writeUInt16LE(0, 0);
  antet.writeUInt16LE(1, 2);
  antet.writeUInt16LE(imagini.length, 4);

  // Fiecare intrare de director are 16 octeți; datele încep după toate intrările.
  let offset = 6 + imagini.length * 16;
  const intrari = [];
  for (const { dim, date } of imagini) {
    const intrare = Buffer.alloc(16);
    // 256 se scrie ca 0 — câmpul are un singur octet.
    intrare.writeUInt8(dim >= 256 ? 0 : dim, 0);
    intrare.writeUInt8(dim >= 256 ? 0 : dim, 1);
    intrare.writeUInt8(0, 2); // paletă: 0 = fără
    intrare.writeUInt8(0, 3); // rezervat
    intrare.writeUInt16LE(1, 4); // planuri de culoare
    intrare.writeUInt16LE(32, 6); // biți per pixel
    intrare.writeUInt32LE(date.length, 8);
    intrare.writeUInt32LE(offset, 12);
    intrari.push(intrare);
    offset += date.length;
  }

  fs.mkdirSync(path.dirname(DESTINATIE), { recursive: true });
  fs.writeFileSync(
    DESTINATIE,
    Buffer.concat([antet, ...intrari, ...imagini.map((i) => i.date)]),
  );

  const kb = Math.round(fs.statSync(DESTINATIE).size / 1024);
  console.log(`Icoană scrisă: ${DESTINATIE} (${kb} KB, dimensiuni: ${DIMENSIUNI.join(', ')})`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
