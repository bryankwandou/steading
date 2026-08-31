/**
 * Reading and packing, with no side effects.
 *
 * Split out of package.js so the tests can import collect() and fingerprint() to check
 * the shipped archive is current. Importing package.js itself rebuilt the archive as a
 * side effect, so the staleness test was comparing the archive against a copy of itself
 * and could never fail.
 *
 * The archive is written by hand rather than by shelling out to zip/tar/Compress-Archive
 * for two reasons. It keeps the zero-dependency rule the rest of the project follows,
 * and PowerShell's Compress-Archive writes entry names with backslashes, which unpack as
 * one long filename on macOS and Linux -- exactly the people most likely to be handed
 * this link. Everything here uses forward slashes.
 */

import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = resolve(ROOT, '..', 'steading');
const ZIP = join(ROOT, 'public', 'steading.zip');
const MANIFEST = join(ROOT, 'public', 'steading.manifest.json');

// bin/ holds a 17 MB Windows binary the installer fetches from the yt-dlp project
// itself, which is both smaller to ship and always the current release. tmp/ is
// scratch space. Neither belongs in the archive.
const SKIP_DIRS = new Set(['bin', 'tmp', '.git', '.vercel', 'node_modules', '__pycache__']);

/** Every shipped file, sorted, so the archive and its hash are reproducible. */
export function collect(from = SOURCE) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
      } else if (!entry.name.endsWith('.zip')) {
        found.push(full);
      }
    }
  };
  walk(from);
  return found;
}

/** One hash over every shipped file's path and contents. */
export function fingerprint(files, from = SOURCE) {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(relative(from, file).replace(/\\/g, '/'));
    hash.update('\0');
    hash.update(readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

/* -------------------------------------------------------------- zip writing */

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

export function build(entries) {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = deflateRawSync(data, { level: 9 });
    // Storing is smaller than deflating for tiny or already-compressed files.
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    const method = stored ? 0 : 8;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0x0800, 6);        // UTF-8 filenames
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);            // time
    local.writeUInt16LE(0x21, 12);         // date: a fixed value keeps builds reproducible
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);              // version made by
    dir.writeUInt16LE(20, 6);              // version needed
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt16LE(0, 12);
    dir.writeUInt16LE(0x21, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt16LE(0, 30);              // extra
    dir.writeUInt16LE(0, 32);              // comment
    dir.writeUInt16LE(0, 34);              // disk
    dir.writeUInt16LE(0, 36);              // internal attrs
    dir.writeUInt32LE(0, 38);              // external attrs
    dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuf, end]);
}

export { SOURCE, ZIP, MANIFEST };
