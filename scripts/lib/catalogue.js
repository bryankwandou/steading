/**
 * What Steading supports, and how well each claim is backed.
 *
 * The site list is read from the validator the server actually uses, so the catalogue
 * cannot drift from the allowlist the way the hosted copy drifted from the local one.
 * Only the evidence column is written by hand, because "we ran this and a file came
 * out" is a fact about an afternoon, not something a program can infer.
 *
 * Three states, and the distinction is the whole point of publishing this:
 *
 *   probed  -- a live URL was fetched and it worked, on a real machine, with a date.
 *   listed  -- yt-dlp has an extractor and the host is allowed through, but nobody has
 *              confirmed a real download. Not a promise.
 *   dropped -- tried and failed for a stated reason. Kept visible so the same candidate
 *              is not rediscovered and re-added hopefully every few months.
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOCAL = resolve(ROOT, '..', 'steading');

/**
 * Evidence per site. Anything absent from here is reported as `listed`, which is the
 * cautious direction to be wrong in: a site is never claimed as verified by omission.
 */
const EVIDENCE = {
  youtube:     { state: 'probed', on: '2026-08-31', note: 'MP4 and MP3 end to end, file served.' },
  dailymotion: { state: 'probed', on: '2026-08-31' },
  twitch:      { state: 'probed', on: '2026-08-31' },
  reddit:      { state: 'probed', on: '2026-08-31', note: 'MP4, MKV and JPG through the running server.' },
  telegram:    { state: 'probed', on: '2026-08-31' },
  bilibili:    { state: 'probed', on: '2026-08-31' },
  kick:        { state: 'probed', on: '2026-08-31' },
  vimeo:       { state: 'probed', on: '2026-08-31', note: 'One older video answered "web client only works when logged-in"; a current one passed. Per-video, not site-wide.' },
  odysee:      { state: 'probed', on: '2026-08-31' },
  bluesky:     { state: 'probed', on: '2026-08-31' },
  snapchat:    { state: 'probed', on: '2026-08-31' },
  soundcloud:  { state: 'probed', on: '2026-08-31', note: 'MP3, WAV and FLAC through the running server.' },
  bandcamp:    { state: 'probed', on: '2026-08-31' },
  mixcloud:    { state: 'probed', on: '2026-08-31' },
  rumble:      { state: 'probed', on: '2026-08-31', note: 'Refuses the default client with 403; works when the request carries a browser fingerprint, which now happens automatically on a refusal. 9.9 MB MP4 downloaded end to end.' },

  tiktok:      { state: 'probed', on: '2026-08-31', note: 'Had failed here before with "Unable to extract universal data for rehydration". It passes now that a refused request is retried with a browser fingerprint: 10 formats returned.' },
  instagram:   { state: 'listed', note: 'Most posts need a login, which this app refuses to work around.' },
  facebook:    { state: 'probed', on: '2026-08-31', note: 'A public video returned 2 formats. Most other posts need a login, which this app refuses to work around.' },
  pinterest:   { state: 'listed', note: 'Not yet reached: the listing page used to find a live URL could not be enumerated, which says nothing about the extractor itself.' },
  tumblr:      { state: 'listed', note: 'The extractor parsed a real post; that post happened to have no video.' },
  vk:          { state: 'listed', note: 'The extractor parsed a real post; that one was copyright-removed.' },
  xiaohongshu: { state: 'listed', note: 'Three real notes parsed, all of them photo posts rather than video.' },
  weibo:       { state: 'listed', note: 'Not yet reached: the listing page used to find a live URL could not be enumerated, which says nothing about the extractor itself.' },
};

/** Candidates tried and rejected, with the reason. */
export const DROPPED = [
  { label: 'Douyin', why: 'Needs fresh cookies, even without being logged in.' },
  { label: 'Vidio',  why: 'The page resolves but the video manifest 404s, on two different free items.' },
];

/** The site list, read from the validator the server runs on. */
export function platforms() {
  const src = readFileSync(join(LOCAL, 'server', 'lib', 'validate.js'), 'utf8');
  const block = src.match(/const PLATFORMS = \[([\s\S]*?)\n\];/);
  if (!block) throw new Error('could not find PLATFORMS in the local validator');

  const rows = [...block[1].matchAll(
    /\{\s*id:\s*'([^']+)',\s*label:\s*'([^']+)',\s*hosts:\s*\[([^\]]+)\](?:,\s*audio:\s*true)?\s*\}/g,
  )].map((m) => ({
    id: m[1],
    label: m[2],
    hosts: [...m[3].matchAll(/'([^']+)'/g)].map((h) => h[1]),
    audio: /audio:\s*true/.test(m[0]),
    ...(EVIDENCE[m[1]] ?? { state: 'listed' }),
  }));

  if (rows.length < 20) throw new Error(`only parsed ${rows.length} platforms; the shape must have changed`);
  return rows;
}

/** Sites recognised by name and refused by name, rather than shrugged at. */
export function locked() {
  const src = readFileSync(join(LOCAL, 'server', 'lib', 'validate.js'), 'utf8');
  const block = src.match(/const LOCKED = \[([\s\S]*?)\n\];/);
  if (!block) return [];
  return [...block[1].matchAll(/label:\s*'([^']+)'/g)].map((m) => ({ label: m[1] }));
}

/** How many sites the bundled yt-dlp knows, for the universal-mode line. */
export function extractorCount() {
  try {
    const bin = join(LOCAL, 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
    const out = execFileSync(bin, ['--list-extractors'], { encoding: 'utf8', timeout: 300_000 });
    return out.trim().split(/\r?\n/).length;
  } catch {
    return null;
  }
}

export function summary() {
  const rows = platforms();
  return {
    total: rows.length,
    probed: rows.filter((r) => r.state === 'probed').length,
    listed: rows.filter((r) => r.state === 'listed').length,
    dropped: DROPPED.length,
  };
}
