/**
 * Facts about this build, read from the build itself.
 *
 * Everything the verification page states is produced here from the actual artefacts:
 * file sizes, SHA-256 digests, the tool versions the app resolves, the test counts. A
 * page that claims things a human typed in is worth nothing to someone checking it, so
 * nothing here is hand-entered -- if a number is wrong, the file it came from is wrong.
 *
 * Pure reads, no writes, so the tests can import it without side effects.
 */

import { createHash } from 'node:crypto';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect } from './pack.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOCAL = resolve(ROOT, '..', 'steading');

/** Files the reader is invited to check for themselves. */
export const ARTEFACTS = [
  { path: 'public/steading.zip', label: 'steading.zip', what: 'the application' },
  { path: 'public/install.ps1', label: 'install.ps1', what: 'Windows setup script' },
  { path: 'public/install.sh', label: 'install.sh', what: 'macOS, Linux and Termux setup script' },
];

export function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

export function digests() {
  return ARTEFACTS.filter((a) => existsSync(join(ROOT, a.path))).map((a) => {
    const full = join(ROOT, a.path);
    return {
      label: a.label,
      what: a.what,
      bytes: statSync(full).size,
      sha256: sha256(full),
    };
  });
}

/** Ask a binary its version, or report that it was not found. Never throws. */
function version(command, args) {
  try {
    const out = execFileSync(command, args, {
      encoding: 'utf8',
      timeout: 120_000,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    return out.trim().split(/\r?\n/)[0].trim() || null;
  } catch {
    return null;
  }
}

export function toolchain() {
  const ytdlpExe = join(LOCAL, 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  return {
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    ytdlp: existsSync(ytdlpExe) ? version(ytdlpExe, ['--version']) : version('yt-dlp', ['--version']),
    ffmpeg: (version('ffmpeg', ['-version']) || '').replace(/^ffmpeg version /, '').split(' ')[0] || null,
  };
}

/**
 * The size of the thing being vouched for.
 *
 * "Small enough that you could read all of it" is a claim, so it should be checkable.
 * The file list comes from the same collect() the packer uses, so this counts exactly
 * what ships and not a line more.
 */
export function shipped() {
  const files = collect();
  let lines = 0;
  let bytes = 0;
  for (const file of files) {
    const text = readFileSync(file);
    bytes += text.length;
    lines += text.toString('utf8').split('\n').length;
  }
  return { files: files.length, lines, bytes, dependencies: dependencyCount() };
}

/** Runtime npm dependencies of the application being shipped. Expected to be zero. */
function dependencyCount() {
  const pkg = JSON.parse(readFileSync(join(LOCAL, 'package.json'), 'utf8'));
  return Object.keys(pkg.dependencies ?? {}).length;
}

export { ROOT, LOCAL };
