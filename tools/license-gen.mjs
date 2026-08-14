#!/usr/bin/env node
/**
 * Generator de chei de licență Tonik — DOAR pentru emitent (Marius).
 *
 * Prima rulare:   node tools/license-gen.mjs --init
 *   → creează perechea de chei în ~/.tonik-license/ (privată + publică)
 *   → afișează cheia publică de pus în src/main/services/license.service.ts
 *
 * Emitere cheie:  node tools/license-gen.mjs 2027-01-31
 *   → tipărește tokenul TONIK-... valabil până la data dată (inclusiv)
 *
 * Cheia privată rămâne pe calculatorul tău. NU o pune în git sau în aplicație.
 */
import { generateKeyPairSync, createPrivateKey, sign } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const keyDir = path.join(os.homedir(), '.tonik-license');
const privFile = path.join(keyDir, 'private.pem');
const pubFile = path.join(keyDir, 'public.b64');

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const arg = process.argv[2];

if (arg === '--init') {
  if (fs.existsSync(privFile)) {
    console.error(`Există deja o pereche de chei în ${keyDir} — nu o suprascriu.`);
    console.error(`Cheia publică existentă:\n${fs.readFileSync(pubFile, 'utf8')}`);
    process.exit(1);
  }
  fs.mkdirSync(keyDir, { recursive: true, mode: 0o700 });
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  fs.writeFileSync(privFile, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
  const pubB64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  fs.writeFileSync(pubFile, pubB64);
  console.log('Pereche de chei creată în', keyDir);
  console.log('\nCheia PUBLICĂ (pune-o în LICENSE_PUBLIC_KEY_B64 din license.service.ts):\n');
  console.log(pubB64);
  process.exit(0);
}

if (!arg || !/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
  console.error('Folosire:');
  console.error('  node tools/license-gen.mjs --init          # o singură dată, creează cheile');
  console.error('  node tools/license-gen.mjs 2027-01-31      # emite cheie valabilă până la dată');
  process.exit(1);
}

if (!fs.existsSync(privFile)) {
  console.error(`Nu există cheia privată (${privFile}). Rulează întâi: node tools/license-gen.mjs --init`);
  process.exit(1);
}

const privateKey = createPrivateKey(fs.readFileSync(privFile, 'utf8'));
const payload = Buffer.from(JSON.stringify({ exp: arg }), 'utf8');
const signature = sign(null, payload, privateKey);
const token = `TONIK-${b64url(payload)}.${b64url(signature)}`;

console.log(`Cheie de licență valabilă până la ${arg} (inclusiv):\n`);
console.log(token);
