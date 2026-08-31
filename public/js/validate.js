/**
 * URL validation, browser side.
 *
 * This is a deliberate port of server/lib/validate.js from the local build, not a
 * loose imitation: it returns the same error codes and enforces the same host
 * allowlist. That matters here because in demo mode there is no server to validate
 * anything, and the rejection of an unsupported site is one of the behaviours a
 * reviewer will actually try. It has to be the real rule, not a stub.
 *
 * tests/parity.test.js fails if this table and the server's ever drift apart.
 */

export const PLATFORMS = [
  { id: 'youtube',   label: 'YouTube',   hosts: ['youtube.com', 'youtu.be', 'music.youtube.com', 'm.youtube.com'] },
  { id: 'tiktok',    label: 'TikTok',    hosts: ['tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'] },
  { id: 'instagram', label: 'Instagram', hosts: ['instagram.com', 'instagr.am', 'ddinstagram.com'] },
  { id: 'facebook',  label: 'Facebook',  hosts: ['facebook.com', 'fb.watch', 'fb.com', 'm.facebook.com'] },
];

/**
 * Sites people reasonably expect to work, which cannot. Mirrors LOCKED in the local
 * build's server/lib/validate.js -- see the note there. Recognising a site is not
 * supporting it: nothing here is ever fetched.
 */
const LOCKED = [
  { label: 'Threads', hosts: ['threads.net', 'threads.com'] },
  { label: 'X',       hosts: ['x.com', 'twitter.com'] },
];

function matchLocked(hostname) {
  const host = hostname.toLowerCase().replace(/^www./, '');
  for (const site of LOCKED) {
    for (const h of site.hosts) {
      if (host === h || host.endsWith(`.${h}`)) return site;
    }
  }
  return null;
}

export const FORMATS = ['mp4', 'mp3'];
export const QUALITIES = ['best', '1080', '720', '480', '360'];

/** A host matches if it equals the entry or is a subdomain of it. */
function matchPlatform(hostname) {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  for (const p of PLATFORMS) {
    for (const h of p.hosts) {
      if (host === h || host.endsWith(`.${h}`)) return p;
    }
  }
  return null;
}

/**
 * @returns {{ok: true, url: string, platform: string, platformLabel: string}
 *          | {ok: false, code: string}}
 */
export function validateUrl(input) {
  if (typeof input !== 'string') return { ok: false, code: 'url_not_text' };

  const raw = input.trim();
  if (!raw) return { ok: false, code: 'url_empty' };
  if (raw.length > 2048) return { ok: false, code: 'url_too_long' };

  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) return { ok: false, code: 'url_bad_chars' };

  // Accept a bare "youtube.com/watch?v=..." paste by assuming https.
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;

  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, code: 'url_malformed' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, code: 'url_bad_scheme' };
  }

  const platform = matchPlatform(url.hostname);
  if (!platform) {
    const locked = matchLocked(url.hostname);
    if (locked) return { ok: false, code: 'url_site_locked', detail: locked.label };
    return { ok: false, code: 'url_unsupported_site' };
  }

  url.username = '';
  url.password = '';
  url.hash = '';

  return { ok: true, url: url.toString(), platform: platform.id, platformLabel: platform.label };
}

/** Make a title safe as a filename on Windows, Android and Linux alike. */
export function safeFilename(title, ext) {
  const base = String(title || 'steading')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 120)
    .trim();

  const safe = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base) ? `${base}_` : base;
  return `${safe || 'steading'}.${ext}`;
}
