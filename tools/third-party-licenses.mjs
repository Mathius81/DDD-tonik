#!/usr/bin/env node
/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Generator al fișierului THIRD-PARTY-LICENSES.txt.
 *
 * Aplicația Tonik e scrisă de Marius Constantinescu — cod propriu, proprietar,
 * vezi LICENSE — dar folosește zeci de componente open-source (React, Mantine,
 * Electron, zod, nodemailer etc.). Licențele lor (majoritatea MIT/ISC/BSD/
 * Apache-2.0) cer ca la DISTRIBUIRE — inclusiv atunci când se distribuie doar
 * executabilul, nu codul sursă — să fie incluse textul integral al licenței și
 * notificarea de copyright. Acest fișier există ca să acopere acea obligație.
 *
 * Ce parcurge scriptul:
 *   - dependențele de PRODUCȚIE din package.json (secțiunea `dependencies`,
 *     NU `devDependencies` — acelea nu se distribuie);
 *   - recursiv, dependențele LOR tranzitive (exact ce ajunge, prin bundling-ul
 *     Vite/Rollup al proceselor main/preload și al renderer-ului, în codul
 *     livrat cu aplicația);
 *   - Electron însuși — deși e listat ca devDependency, binarul Electron se
 *     împachetează alături de aplicație, deci trebuie atribuit la fel.
 *
 * Excepție deliberată: pentru „electron” NU se coboară în propriile lui
 * dependențe (@electron/get, extract-zip etc.) — acelea sunt unelte de
 * INSTALARE/build (descarcă și despachetează binarul Electron de pe internet),
 * nu cod care ajunge în aplicația împachetată. Pachetul npm „electron” însuși
 * e atribuit cu propria licență MIT. (Chromium/V8/Node, componente interne ale
 * binarului Electron, au propriul document de atribuiri — LICENSES.chromium.html
 * — publicat de proiectul Electron; nu e reprodus aici.)
 *
 * Rezoluție pachet ↔ folder: replicăm algoritmul de rezoluție al Node.js —
 * pentru fiecare pachet, căutăm `node_modules/<nume>` pornind din folderul
 * pachetului care îl cere și urcând spre rădăcină — ca să folosim exact
 * versiunea instalată în arborele real (npm poate instala mai multe versiuni
 * ale aceluiași pachet, imbricate, când versiunile cerute diferă).
 *
 * Rulare:  npm run licenses   (sau: node tools/third-party-licenses.mjs)
 * Rezultat: THIRD-PARTY-LICENSES.txt, în rădăcina proiectului. Fișierul
 * generat TREBUIE comis în git (nu doar scriptul) — trebuie să existe și
 * pentru cine nu rulează scriptul, și trebuie împachetat lângă executabil
 * (vezi `packagerConfig.extraResource` din forge.config.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_FILE = path.join(ROOT, 'THIRD-PARTY-LICENSES.txt');

/** Marcator între blocuri — improbabil să apară vreodată în textul unei licențe reale. */
const PACKAGE_MARKER = '<<<TONIK-THIRD-PARTY-PACKAGE>>>';
const BODY_SEPARATOR = '\n---\n';

/** Pachete ale căror dependențe proprii NU se urmăresc mai departe — vezi antetul de mai sus. */
const NO_RECURSE = new Set(['electron']);

/**
 * Texte de licență STANDARD, folosite DOAR dacă pachetul nu vine cu un fișier
 * LICENSE/COPYING propriu pe disc și SPDX-ul lui e unul cunoscut. Marea
 * majoritate a pachetelor își includ propriul fișier — aceste șabloane sunt
 * plasa de siguranță pentru cele câteva care nu o fac.
 */
const FALLBACK_LICENSE_TEXTS = {
  MIT: (holder) => `MIT License

Copyright (c) ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`,
  ISC: (holder) => `ISC License

Copyright (c) ${holder}

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
`,
  '0BSD': () => `BSD Zero Clause License

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
`,
  'BSD-2-Clause': (holder) => `BSD 2-Clause License

Copyright (c) ${holder}

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
`,
  'BSD-3-Clause': (holder) => `BSD 3-Clause License

Copyright (c) ${holder}

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
`,
  Unlicense: () => `This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or distribute this
software, either in source code form or as a compiled binary, for any purpose,
commercial or non-commercial, and by any means.

In jurisdictions that recognize copyright laws, the author or authors of this
software dedicate any and all copyright interest in the software to the public
domain. We make this dedication for the benefit of the public at large and to
the detriment of our heirs and successors. We intend this dedication to be an
overt act of relinquishment in perpetuity of all present and future rights to
this software under copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to <https://unlicense.org>
`,
  WTFPL: () => `DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
                    Version 2, December 2004

 Copyright (C) 2004 Sam Hocevar <sam@hocevar.net>

 Everyone is permitted to copy and distribute verbatim or modified
 copies of this license document, and changing it is allowed as long
 as the name is changed.

            DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
   TERMS AND CONDITIONS FOR COPYING, DISTRIBUTION AND MODIFICATION

  0. You just DO WHAT THE FUCK YOU WANT TO.
`,
  'Apache-2.0': () => `Apache License
Version 2.0, January 2004
https://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

"License" shall mean the terms and conditions for use, reproduction, and
distribution as defined by Sections 1 through 9 of this document.

"Licensor" shall mean the copyright owner or entity authorized by the
copyright owner that is granting the License.

"Legal Entity" shall mean the union of the acting entity and all other
entities that control, are controlled by, or are under common control with
that entity. For the purposes of this definition, "control" means (i) the
power, direct or indirect, to cause the direction or management of such
entity, whether by contract or otherwise, or (ii) ownership of fifty percent
(50%) or more of the outstanding shares, or (iii) beneficial ownership of such
entity.

"You" (or "Your") shall mean an individual or Legal Entity exercising
permissions granted by this License.

"Source" form shall mean the preferred form for making modifications,
including but not limited to software source code, documentation source, and
configuration files.

"Object" form shall mean any form resulting from mechanical transformation or
translation of a Source form, including but not limited to compiled object
code, generated documentation, and conversions to other media types.

"Work" shall mean the work of authorship, whether in Source or Object form,
made available under the License, as indicated by a copyright notice that is
included in or attached to the work (an example is provided in the Appendix
below).

"Derivative Works" shall mean any work, whether in Source or Object form, that
is based on (or derived from) the Work and for which the editorial revisions,
annotations, elaborations, or other modifications represent, as a whole, an
original work of authorship. For the purposes of this License, Derivative
Works shall not include works that remain separable from, or merely link (or
bind by name) to the interfaces of, the Work and Derivative Works thereof.

"Contribution" shall mean any work of authorship, including the original
version of the Work and any modifications or additions to that Work or
Derivative Works thereof, that is intentionally submitted to Licensor for
inclusion in the Work by the copyright owner or by an individual or Legal
Entity authorized to submit on behalf of the copyright owner. For the purposes
of this definition, "submitted" means any form of electronic, verbal, or
written communication sent to the Licensor or its representatives, including
but not limited to communication on electronic mailing lists, source code
control systems, and issue tracking systems that are managed by, or on behalf
of, the Licensor for the purpose of discussing and improving the Work, but
excluding communication that is conspicuously marked or otherwise designated
in writing by the copyright owner as "Not a Contribution."

"Contributor" shall mean Licensor and any individual or Legal Entity on behalf
of whom a Contribution has been received by Licensor and subsequently
incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of this
License, each Contributor hereby grants to You a perpetual, worldwide,
non-exclusive, no-charge, royalty-free, irrevocable copyright license to
reproduce, prepare Derivative Works of, publicly display, publicly perform,
sublicense, and distribute the Work and such Derivative Works in Source or
Object form.

3. Grant of Patent License. Subject to the terms and conditions of this
License, each Contributor hereby grants to You a perpetual, worldwide,
non-exclusive, no-charge, royalty-free, irrevocable (except as stated in this
section) patent license to make, have made, use, offer to sell, sell, import,
and otherwise transfer the Work, where such license applies only to those
patent claims licensable by such Contributor that are necessarily infringed by
their Contribution(s) alone or by combination of their Contribution(s) with
the Work to which such Contribution(s) was submitted. If You institute patent
litigation against any entity (including a cross-claim or counterclaim in a
lawsuit) alleging that the Work or a Contribution incorporated within the Work
constitutes direct or contributory patent infringement, then any patent
licenses granted to You under this License for that Work shall terminate as
of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the Work or
Derivative Works thereof in any medium, with or without modifications, and in
Source or Object form, provided that You meet the following conditions:

   (a) You must give any other recipients of the Work or Derivative Works a
   copy of this License; and

   (b) You must cause any modified files to carry prominent notices stating
   that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works that You
   distribute, all copyright, patent, trademark, and attribution notices from
   the Source form of the Work, excluding those notices that do not pertain to
   any part of the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its distribution,
   then any Derivative Works that You distribute must include a readable copy
   of the attribution notices contained within such NOTICE file, excluding
   those notices that do not pertain to any part of the Derivative Works, in
   at least one of the following places: within a NOTICE text file distributed
   as part of the Derivative Works; within the Source form or documentation,
   if provided along with the Derivative Works; or, within a display generated
   by the Derivative Works, if and wherever such third-party notices normally
   appear. The contents of the NOTICE file are for informational purposes only
   and do not modify the License. You may add Your own attribution notices
   within Derivative Works that You distribute, alongside or as an addendum to
   the NOTICE text from the Work, provided that such additional attribution
   notices cannot be construed as modifying the License.

   You may add Your own copyright statement to Your modifications and may
   provide additional or different license terms and conditions for use,
   reproduction, or distribution of Your modifications, or for any such
   Derivative Works as a whole, provided Your use, reproduction, and
   distribution of the Work otherwise complies with the conditions stated in
   this License.

5. Submission of Contributions. Unless You explicitly state otherwise, any
Contribution intentionally submitted for inclusion in the Work by You to the
Licensor shall be under the terms and conditions of this License, without any
additional terms or conditions. Notwithstanding the above, nothing herein
shall supersede or modify the terms of any separate license agreement you may
have executed with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade names,
trademarks, service marks, or product names of the Licensor, except as
required for reasonable and customary use in describing the origin of the
Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or agreed to in
writing, Licensor provides the Work (and each Contributor provides its
Contributions) on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, either express or implied, including, without limitation, any
warranties or conditions of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or
FITNESS FOR A PARTICULAR PURPOSE. You are solely responsible for determining
the appropriateness of using or redistributing the Work and assume any risks
associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory, whether in
tort (including negligence), contract, or otherwise, unless required by
applicable law (such as deliberate and grossly negligent acts) or agreed to in
writing, shall any Contributor be liable to You for damages, including any
direct, indirect, special, incidental, or consequential damages of any
character arising as a result of this License or out of the use or inability
to use the Work (including but not limited to damages for loss of goodwill,
work stoppage, computer failure or malfunction, or any and all other
commercial damages or losses), even if such Contributor has been advised of
the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing the Work
or Derivative Works thereof, You may choose to offer, and charge a fee for,
acceptance of support, warranty, indemnity, or other liability obligations
and/or rights consistent with this License. However, in accepting such
obligations, You may act only on Your own behalf and on Your sole
responsibility, not on behalf of any other Contributor, and only if You agree
to indemnify, defend, and hold each Contributor harmless for any liability
incurred by, or claims asserted against, such Contributor by reason of your
accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS
`,
};

/** Normalizează un identificator SPDX pentru căutarea în FALLBACK_LICENSE_TEXTS (fără paranteze/spații). */
function normalizeSpdxToken(token) {
  return token.trim();
}

/** Prima potrivire cunoscută dintr-o expresie SPDX gen "(MIT OR CC0-1.0)". */
function findFallbackLicense(spdxExpression, holder) {
  if (!spdxExpression) return null;
  const cleaned = spdxExpression.replace(/[()]/g, '');
  const tokens = cleaned.split(/\s+(?:OR|AND)\s+/i).map(normalizeSpdxToken);
  for (const token of tokens) {
    if (FALLBACK_LICENSE_TEXTS[token]) return FALLBACK_LICENSE_TEXTS[token](holder);
  }
  return null;
}

/** Identificatorul de licență dintr-un package.json, indiferent de formatul folosit (nou/vechi). */
function licenseIdFromPkg(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license && typeof pkg.license === 'object' && pkg.license.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses) && pkg.licenses.length) {
    return pkg.licenses.map((l) => (typeof l === 'string' ? l : l.type)).filter(Boolean).join(' OR ');
  }
  return 'NECUNOSCUTĂ';
}

/** Reprezentare text a câmpului `author`/`contributors`, oricare ar fi forma lui. */
function personToString(person) {
  if (!person) return null;
  if (typeof person === 'string') return person;
  if (typeof person === 'object') {
    const parts = [person.name, person.email ? `<${person.email}>` : null, person.url ? `(${person.url})` : null];
    const joined = parts.filter(Boolean).join(' ');
    return joined || null;
  }
  return null;
}

function authorToString(pkg) {
  const author = personToString(pkg.author);
  if (author) return author;
  if (Array.isArray(pkg.contributors) && pkg.contributors.length) {
    return pkg.contributors.map(personToString).filter(Boolean).join('; ');
  }
  return null;
}

/** Prima linie „Copyright ...” găsită într-un text de licență — cea mai fiabilă sursă a deținătorului. */
function extractCopyrightLine(text) {
  const match = text.match(/^.*copyright.*$/im);
  return match ? match[0].replace(/\s+/g, ' ').trim() : null;
}

/** Fișierele de tip LICENSE/COPYING dintr-un folder de pachet (pot fi mai multe — ex. licențe duale). */
function findLicenseFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && /^licen[sc]e/i.test(e.name))
    .concat(entries.filter((e) => e.isFile() && /^copying/i.test(e.name)))
    .map((e) => path.join(dir, e.name));
}

/** Rezoluție de tip Node: caută `node_modules/<name>` pornind din `fromDir`, urcând spre rădăcină. */
function resolvePackageDir(name, fromDir) {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Colectează, prin BFS, toate pachetele de producție + tranzitivele lor, deduplicate după calea reală. */
function collectPackages(rootDir) {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const entryNames = [...Object.keys(rootPkg.dependencies || {}), 'electron'];

  // `visitedPaths` evită re-parcurgerea aceleiași instanțe fizice (bucle infinite).
  // `entriesByKey` deduplichează RAPORTUL după nume@versiune — npm poate instala
  // aceeași versiune, identică, în mai multe foldere imbricate (nod_modules diferite),
  // dar în raport trebuie să apară o singură dată.
  const visitedPaths = new Set();
  const entriesByKey = new Map(); // "nume@versiune" -> { name, version, dir, pkg }
  const queue = entryNames.map((name) => ({ name, fromDir: rootDir }));

  while (queue.length) {
    const { name, fromDir } = queue.shift();
    const dir = resolvePackageDir(name, fromDir);
    if (!dir) continue; // nu e instalat (ex. dependență opțională neinstalată) — nimic de atribuit

    const real = fs.realpathSync(dir);
    if (visitedPaths.has(real)) continue;
    visitedPaths.add(real);

    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    } catch {
      continue;
    }

    const key = `${pkg.name || name}@${pkg.version || '0.0.0'}`;
    if (!entriesByKey.has(key)) {
      entriesByKey.set(key, { name: pkg.name || name, version: pkg.version || '0.0.0', dir, pkg });
    }

    if (NO_RECURSE.has(name)) continue; // vezi antetul — dependențele proprii ale Electron nu se distribuie
    const deps = { ...(pkg.dependencies || {}), ...(pkg.optionalDependencies || {}) };
    for (const dep of Object.keys(deps)) {
      queue.push({ name: dep, fromDir: dir });
    }
  }

  return [...entriesByKey.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
}

function buildEntry(info) {
  const { name, version, dir, pkg } = info;
  const spdx = licenseIdFromPkg(pkg);
  const author = authorToString(pkg) ?? 'necunoscut';

  const licenseFiles = findLicenseFiles(dir);
  let text;
  let sourceNote;
  let copyright;

  if (licenseFiles.length > 0) {
    text = licenseFiles
      .map((f) => {
        const body = fs.readFileSync(f, 'utf8').trimEnd();
        return licenseFiles.length > 1 ? `[${path.basename(f)}]\n\n${body}` : body;
      })
      .join('\n\n----------------------------------------\n\n');
    sourceNote = `fișier ${licenseFiles.map((f) => path.basename(f)).join(', ')} din pachet`;
    copyright = extractCopyrightLine(text) ?? author;
  } else {
    const fallback = findFallbackLicense(spdx, author);
    if (fallback) {
      text = fallback.trimEnd();
      sourceNote = `text standard ${spdx} (pachetul nu include un fișier de licență propriu)`;
      copyright = extractCopyrightLine(text) ?? author;
    } else {
      text = `(Acest pachet nu include un fișier de licență, iar licența declarată — „${spdx}” — nu are\nun text standard cunoscut de acest generator. Verifică manual pagina pachetului:\nhttps://www.npmjs.com/package/${encodeURIComponent(name)}/v/${encodeURIComponent(version)}`;
      sourceNote = 'NEGĂSIT — verificare manuală necesară';
      copyright = author;
    }
  }

  return { name, version, license: spdx, copyright, sourceNote, text };
}

function formatEntry(entry) {
  return [
    `\n${PACKAGE_MARKER}\n`,
    `Pachet: ${entry.name}@${entry.version}\n`,
    `Licență: ${entry.license}\n`,
    `Copyright: ${entry.copyright}\n`,
    `Sursă text licență: ${entry.sourceNote}`,
    BODY_SEPARATOR,
    `${entry.text}\n`,
  ].join('');
}

function buildHeader(entries) {
  const distributie = new Map();
  for (const e of entries) {
    distributie.set(e.license, (distributie.get(e.license) ?? 0) + 1);
  }
  const listaDistributie = [...distributie.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([lic, n]) => `  - ${lic}: ${n}`)
    .join('\n');

  return `================================================================================
LICENȚE ALE COMPONENTELOR OPEN-SOURCE — Tonik / DDD Manager
================================================================================

Codul sursă propriu al aplicației Tonik este proprietar și aparține exclusiv
lui Marius Constantinescu — vezi fișierul LICENSE din rădăcina proiectului.

Aplicația folosește însă componente open-source (biblioteci terțe), listate
mai jos, fiecare sub PROPRIA ei licență. Acest fișier este generat automat de
\`tools/third-party-licenses.mjs\` (rulează \`npm run licenses\` pentru a-l
regenera după ce se schimbă dependențele) și reproduce, pentru fiecare
componentă: numele, versiunea, tipul licenței, deținătorul copyrightului și
textul integral al licenței.

Generat la: ${new Date().toISOString()}
Total componente: ${entries.length}

Distribuția pe tipuri de licență:
${listaDistributie}

================================================================================
`;
}

function main() {
  const entries = collectPackages(ROOT).map(buildEntry);
  const header = buildHeader(entries);
  const body = entries.map(formatEntry).join('\n');
  fs.writeFileSync(OUTPUT_FILE, header + body);

  const negasite = entries.filter((e) => e.sourceNote.startsWith('NEGĂSIT'));

  console.log(`Scris ${OUTPUT_FILE}`);
  console.log(`Total componente: ${entries.length}`);
  if (negasite.length) {
    console.log(`\nATENȚIE — ${negasite.length} pachet(e) fără licență identificabilă (verifică manual):`);
    for (const e of negasite) console.log(`  - ${e.name}@${e.version} (declară „${e.license}”)`);
  }
}

main();
