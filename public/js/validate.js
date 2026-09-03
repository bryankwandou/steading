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
  { id: 'youtube',     label: 'YouTube',     hosts: ['youtube.com', 'youtu.be'] },
  { id: 'tiktok',      label: 'TikTok',      hosts: ['tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'] },
  { id: 'instagram',   label: 'Instagram',   hosts: ['instagram.com', 'instagr.am', 'ddinstagram.com'] },
  { id: 'facebook',    label: 'Facebook',    hosts: ['facebook.com', 'fb.watch', 'fb.com'] },
  { id: 'twitch',      label: 'Twitch',      hosts: ['twitch.tv'] },
  { id: 'vimeo',       label: 'Vimeo',       hosts: ['vimeo.com'] },
  { id: 'dailymotion', label: 'Dailymotion', hosts: ['dailymotion.com', 'dai.ly'] },
  { id: 'reddit',      label: 'Reddit',      hosts: ['reddit.com', 'redd.it'] },
  { id: 'pinterest',   label: 'Pinterest',   hosts: ['pinterest.com', 'pin.it'] },
  { id: 'snapchat',    label: 'Snapchat',    hosts: ['snapchat.com'] },
  { id: 'bluesky',     label: 'Bluesky',     hosts: ['bsky.app'] },
  { id: 'tumblr',      label: 'Tumblr',      hosts: ['tumblr.com'] },
  { id: 'telegram',    label: 'Telegram',    hosts: ['t.me', 'telegram.me'] },
  { id: 'vk',          label: 'VK',          hosts: ['vk.com', 'vkvideo.ru'] },
  { id: 'weibo',       label: 'Weibo',       hosts: ['weibo.com', 'weibo.cn'] },
  { id: 'xiaohongshu', label: 'Xiaohongshu', hosts: ['xiaohongshu.com', 'xhslink.com'] },
  { id: 'bilibili',    label: 'Bilibili',    hosts: ['bilibili.com', 'b23.tv'] },
  { id: 'kick',        label: 'Kick',        hosts: ['kick.com'] },
  { id: 'odysee',      label: 'Odysee',      hosts: ['odysee.com', 'lbry.tv'] },
  { id: 'rumble',      label: 'Rumble',      hosts: ['rumble.com'] },
  { id: 'soundcloud',  label: 'SoundCloud',  hosts: ['soundcloud.com', 'snd.sc'], audio: true },
  { id: 'bandcamp',    label: 'Bandcamp',    hosts: ['bandcamp.com'], audio: true },
  { id: 'mixcloud',    label: 'Mixcloud',    hosts: ['mixcloud.com'], audio: true },
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
/**
 * Is this hostname on the visitor's own network rather than out on the web?
 *
 * Mirrors isPrivateHost() in the local build's server/lib/validate.js -- see the note
 * there. Only consulted for hosts that are not on the list, so the catalogued sites are
 * unaffected; this exists to keep universal mode pointed outward.
 */
function isPrivateHost(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const bare = host.replace(/^\[|\]$/g, '');

  if (bare === 'localhost' || bare.endsWith('.localhost')) return true;
  if (/\.(local|internal|intranet|localdomain|home|lan|corp|private)$/.test(bare)) return true;
  if (!bare.includes('.') && !bare.includes(':')) return true;

  if (bare === '::1' || bare === '::') return true;
  if (/^f[cd][0-9a-f]{2}:/.test(bare)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(bare)) return true;
  const mapped = bare.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateHost(mapped[1]);

  const v4 = bare.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return false;

  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (v4.slice(1).some((n) => Number(n) > 255)) return true;
  if (a === 0 || a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;

  return false;
}

export function validateUrl(input, { universal = false } = {}) {
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
    if (!universal) return { ok: false, code: 'url_unsupported_site' };

    // An unlisted host has to be out on the public web before anything is handed to a
    // subprocess. Same rule as the local build, so the two cannot disagree about it.
    if (isPrivateHost(url.hostname)) return { ok: false, code: 'url_unsupported_site' };
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
