/**
 * Build public/steading.zip -- the copy of the real app that the setup page hands out.
 *
 * Run this after any change to ../steading, or the setup page keeps serving the old
 * one. tests/parity.test.js fails when that happens, so it cannot go unnoticed for long.
 *
 *   npm run package
 *
 * The packing itself lives in scripts/lib/pack.js, which has no side effects so the
 * tests can import it without rebuilding the very thing they are checking.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { collect, fingerprint, build, SOURCE, ZIP, MANIFEST } from './lib/pack.js';

const files = collect();

const entries = files.map((file) => ({
  name: `steading/${relative(SOURCE, file).split('\\').join('/')}`,
  data: readFileSync(file),
}));

// The server refuses to start without tmp/, so ship it empty.
entries.push({ name: 'steading/tmp/.gitkeep', data: Buffer.alloc(0) });

const zip = build(entries);
writeFileSync(ZIP, zip);

const source = fingerprint(files);
writeFileSync(MANIFEST, `${JSON.stringify({
  source,
  files: files.length,
  bytes: zip.length,
  built: new Date().toISOString(),
}, null, 2)}\n`);

console.log(`  steading.zip  ${entries.length} entries, ${(zip.length / 1024).toFixed(0)} KB`);
console.log(`  fingerprint    ${source.slice(0, 16)}...`);
