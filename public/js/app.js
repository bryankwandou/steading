/**
 * Steading UI -- hosted build. One module, one state object, no framework.
 *
 * Identical to the local build apart from the mode layer. api.js decides whether the
 * demo engine or the live function answers; this file only renders which one is active.
 * Every other path -- rendering, i18n, theming, progress -- is the same code the local
 * version runs, deliberately: a demo built on a different renderer would prove nothing
 * about the real one.
 *
 * No string in this file is user-facing prose. Anything the user reads comes from
 * i18n.js, and every message the UI is currently showing is stored in `state.message`
 * as {key, vars} rather than as rendered text -- otherwise switching language mid-error
 * would leave the old language frozen on screen.
 */

import { api, ApiError, getMode, setMode, onModeChange, normalizeError } from './api.js';
import {
  LANGUAGES, t, tError, setLanguage, detectLanguage, getLanguage, onLanguageChange, applyStatic,
} from './i18n.js';
import { initTheme, toggleTheme, resolvedTheme, onThemeChange } from './theme.js';
import { PLATFORMS } from './validate.js';

const $ = (id) => document.getElementById(id);

const el = {
  form: $('url-form'),
  url: $('url'),
  paste: $('paste'),
  fetchBtn: $('fetch'),
  lang: $('lang'),
  theme: $('theme'),
  preview: $('preview'),
  thumbWrap: $('thumb-wrap'),
  thumb: $('thumb'),
  title: $('title'),
  submeta: $('submeta'),
  seg: $('seg'),
  segButtons: document.querySelectorAll('.seg-btn'),
  qualityWrap: $('quality-wrap'),
  quality: $('quality'),
  download: $('download'),
  progress: $('progress'),
  phase: $('phase'),
  percent: $('percent'),
  bar: document.querySelector('.bar'),
  barFill: $('bar-fill'),
  stats: $('stats'),
  cancel: $('cancel'),
  message: $('message'),
  sampleNote: $('sample-note'),
  modeChip: $('mode-chip'),
  modeNote: $('mode-note'),
  modeSwitch: $('mode-switch'),
  getApp: $('get-app'),
  getInstall: $('get-install'),
  getLive: $('get-live'),
  getOpen: $('get-open'),
  openLocal: $('open-local'),
  getNote: $('get-note'),
  dot: $('server-status'),
  serverText: $('server-text'),
  supports: $('supports'),
};

const state = {
  info: null,
  format: 'mp4',
  quality: 'best',
  jobId: null,
  unwatch: null,
  /** @type {{key: string, vars?: object, kind: string}|null} */
  message: null,
  /** Last progress frame, replayed on a language change. */
  lastProgress: null,
  /** Last health result, replayed on a language change. */
  health: undefined,
  /** True while a download is starting or running, so labels re-render correctly. */
  downloading: false,
  checking: false,
};

const EM_DASH = '—';

/* ------------------------------------------------------------------ helpers */

function bytes(n) {
  if (!Number.isFinite(n)) return null;
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u += 1; }
  return `${v < 10 && u > 0 ? v.toFixed(1) : Math.round(v)} ${units[u]}`;
}

function clock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return h > 0
    ? `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    : `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Show a message by key, remembering it so a language switch can re-render it. */
function say(key, { vars, kind = '' } = {}) {
  state.message = key ? { key, vars, kind } : null;
  paintMessage();
}

/** Show a message that is already a finished string (a translated server error). */
function sayText(text, kind = '') {
  state.message = text ? { text, kind } : null;
  paintMessage();
}

function paintMessage() {
  const m = state.message;
  if (!m) {
    el.message.hidden = true;
    el.message.textContent = '';
    el.message.className = 'message';
    return;
  }
  el.message.textContent = m.text ?? t(m.key, m.vars);
  el.message.className = `message${m.kind ? ` is-${m.kind}` : ''}`;
  el.message.hidden = false;
}

function clearMessage() { say(''); }

/** Render an ApiError in the current language. */
function sayApiError(raw) {
  const err = normalizeError(raw);
  if (err.code) return sayText(tError(err.code, err.detail), 'error');
  if (err.status) return say('error.http', { vars: { status: err.status }, kind: 'error' });
  sayText(tError('server_error'), 'error');
}

function busy(button, isBusy, key) {
  button.disabled = isBusy;
  if (key) button.textContent = t(key);
}

/* --------------------------------------------------------------------- chrome */

function buildLanguageMenu() {
  const fragment = document.createDocumentFragment();
  for (const { code, name } of LANGUAGES) {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = name; // endonym, deliberately not translated
    fragment.append(option);
  }
  el.lang.replaceChildren(fragment);
}

el.lang.addEventListener('change', () => { setLanguage(el.lang.value); });

el.theme.addEventListener('click', () => {
  toggleTheme();
  paintThemeLabel();
});

/** The label describes what the button will do next, not what is showing now. */
function paintThemeLabel() {
  const next = resolvedTheme() === 'dark' ? 'nav.theme.light' : 'nav.theme.dark';
  el.theme.setAttribute('aria-label', t(next));
  el.theme.setAttribute('title', t(next));
}

onThemeChange(paintThemeLabel);

/* ----------------------------------------------------------------------- mode */

el.modeSwitch.addEventListener('click', () => {
  setMode(getMode() === 'demo' ? 'live' : 'demo');
});

onModeChange(() => {
  // Switching backend invalidates anything fetched from the previous one.
  state.info = null;
  el.preview.hidden = true;
  resetProgress();
  clearMessage();
  paintMode();
  paintSupported();
  paintGet();
  paintLocalState();
  paintLiveRoute();
  checkServer();
});

function paintMode() {
  const demo = getMode() === 'demo';
  el.modeChip.textContent = t(demo ? 'mode.demo' : 'mode.live');
  el.modeChip.className = `mode-chip ${demo ? 'is-demo' : 'is-live'}`;
  el.modeNote.textContent = t(demo ? 'mode.explainDemo' : 'mode.explainLive');
  el.modeSwitch.textContent = t(demo ? 'mode.toLive' : 'mode.toDemo');

  el.modeBar?.setAttribute('data-mode', demo ? 'demo' : 'live');
}

/* -------------------------------------------------------------------- step 1 */

el.paste.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      el.url.value = text.trim();
      el.url.focus();
    }
  } catch {
    // Clipboard permission denied or unsupported -- typing still works.
    el.url.focus();
    say('url.clipboardDenied');
  }
});

el.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = el.url.value.trim();
  if (!url) {
    el.url.setAttribute('aria-invalid', 'true');
    el.url.focus();
    return;
  }
  el.url.removeAttribute('aria-invalid');

  clearMessage();
  resetProgress();
  el.preview.hidden = true;
  state.checking = true;
  busy(el.fetchBtn, true, 'action.checking');

  try {
    state.info = await api.info(url);
    renderPreview(state.info);
  } catch (err) {
    el.url.setAttribute('aria-invalid', 'true');
    sayApiError(err);
  } finally {
    state.checking = false;
    busy(el.fetchBtn, false, 'action.check');
  }
});

function renderPreview(info) {
  el.title.textContent = info.title || t(info.demoSample ? 'demo.sampleTitle' : 'media.untitled');
  el.sampleNote.hidden = !info.demoSample;

  const parts = [info.platformLabel, info.uploader, clock(info.duration)].filter(Boolean);
  el.submeta.textContent = parts.join(' · ');

  if (info.thumbnail) {
    el.thumb.src = info.thumbnail;
    el.thumb.alt = '';
    el.thumbWrap.classList.remove('is-empty');
  } else {
    el.thumb.removeAttribute('src');
    el.thumbWrap.classList.add('is-empty');
  }

  renderQualities(info);

  el.preview.hidden = false;
  el.download.focus({ preventScroll: true });
}

function renderQualities(info) {
  const previous = state.quality;
  const fragment = document.createDocumentFragment();
  for (const q of info.qualities) {
    const option = document.createElement('option');
    option.value = q;
    option.textContent = q === 'best' ? t('quality.best') : `${q}p`;
    fragment.append(option);
  }
  el.quality.replaceChildren(fragment);

  state.quality = info.qualities.includes(previous) ? previous : (info.qualities[0] ?? 'best');
  el.quality.value = state.quality;
}

/* -------------------------------------------------------------------- step 2 */

for (const button of el.segButtons) {
  button.addEventListener('click', () => {
    state.format = button.dataset.format;
    el.seg.dataset.active = state.format; // drives the sliding thumb
    for (const other of el.segButtons) {
      const on = other === button;
      other.classList.toggle('is-on', on);
      other.setAttribute('aria-checked', String(on));
    }
    // Quality only means something for video.
    el.qualityWrap.hidden = state.format === 'mp3';
  });
}

el.quality.addEventListener('change', () => { state.quality = el.quality.value; });

el.download.addEventListener('click', async () => {
  if (!state.info) return;

  clearMessage();
  state.downloading = true;
  busy(el.download, true, 'action.starting');

  try {
    const job = await api.createJob({
      url: state.info.url,
      format: state.format,
      quality: state.format === 'mp3' ? 'best' : state.quality,
      title: state.info.title
        || t(state.info.demoSample ? 'demo.sampleTitle' : 'media.untitled'),
    });
    startWatching(job.id);
  } catch (err) {
    sayApiError(err);
    state.downloading = false;
    busy(el.download, false, 'action.download');
  }
});

/* ------------------------------------------------------------------ progress */

function resetProgress() {
  state.unwatch?.();
  state.unwatch = null;
  state.jobId = null;
  state.lastProgress = null;
  el.progress.hidden = true;
  el.barFill.style.width = '';
  el.barFill.classList.add('is-indeterminate');
  el.barFill.classList.remove('is-done');
  el.stats.textContent = '';
  el.percent.textContent = EM_DASH;
  el.cancel.hidden = false;
}

function startWatching(id) {
  state.jobId = id;
  el.progress.hidden = false;
  el.phase.textContent = t('phase.extracting');

  state.unwatch = api.watch(id, {
    onUpdate: renderProgress,
    onReady: (job) => {
      renderProgress({ ...job, phase: 'ready', percent: 100 });
      el.barFill.classList.add('is-done');
      el.cancel.hidden = true;
      state.unwatch?.();
      state.unwatch = null;
      deliver(job);
    },
    onFailed: (job) => {
      sayText(tError(job.code || 'server_error', job.detail), 'error');
      resetProgress();
      state.downloading = false;
      busy(el.download, false, 'action.download');
    },
  });
}

function renderProgress(job) {
  state.lastProgress = job;

  const phaseKey = `phase.${job.phase}`;
  el.phase.textContent = t(phaseKey) === phaseKey ? t('phase.downloading') : t(phaseKey);

  if (Number.isFinite(job.percent) && job.percent !== null) {
    el.barFill.classList.remove('is-indeterminate');
    el.barFill.style.width = `${job.percent.toFixed(1)}%`;
    el.percent.textContent = `${Math.round(job.percent)}%`;
    el.bar.setAttribute('aria-valuenow', String(Math.round(job.percent)));
  } else {
    el.barFill.classList.add('is-indeterminate');
    el.barFill.style.width = '';
    el.percent.textContent = EM_DASH;
    el.bar.removeAttribute('aria-valuenow');
  }

  const bits = [];
  if (job.downloaded) bits.push(job.total ? `${bytes(job.downloaded)} / ${bytes(job.total)}` : bytes(job.downloaded));
  if (job.speed) bits.push(`${bytes(job.speed)}/s`);
  if (Number.isFinite(job.eta) && job.eta !== null) bits.push(t('progress.remaining', { time: clock(job.eta) }));
  el.stats.textContent = bits.filter(Boolean).join('  ·  ');
}

/**
 * Hand the finished file to the browser. A hidden anchor with `download` is what makes
 * a mobile browser write straight to the device's Downloads folder; navigating the top
 * window instead would tear down the page on some Android builds.
 */
function deliver(job) {
  const link = document.createElement('a');
  link.href = api.fileUrl(job.id);
  link.download = job.filename || '';
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();

  if (job.size) {
    say('progress.savedSize', { vars: { name: job.filename, size: bytes(job.size) }, kind: 'ok' });
  } else {
    say('progress.saved', { vars: { name: job.filename }, kind: 'ok' });
  }
  state.downloading = false;
  busy(el.download, false, 'action.download');

  // The server purges its temp copy as soon as the transfer completes.
  setTimeout(() => { el.progress.hidden = true; }, 1200);
}

el.cancel.addEventListener('click', async () => {
  if (!state.jobId) return;
  const id = state.jobId;
  resetProgress();
  state.downloading = false;
  busy(el.download, false, 'action.download');
  say('progress.canceled');
  await api.cancel(id);
});

/* -------------------------------------------------------------------- boot */

async function checkServer() {
  try {
    state.health = await api.health();
  } catch {
    state.health = null;
  }
  paintServerStatus();

  // No "run npm run check" advice here: this build is not the one the reader is
  // running, so pointing them at a terminal would be nonsense. The mode bar already
  // explains what live mode is and why it can fail.
}

/**
 * Name the supported platforms before anyone types, not after they get it wrong.
 *
 * Demo mode has no server to ask, so the list comes from PLATFORMS in validate.js --
 * the same table that decides what is accepted. The line therefore cannot promise a
 * site the validator would reject, in either mode. Intl.ListFormat joins the names the
 * way the current language does it, which a hand-written separator in 24 dictionaries
 * would get wrong somewhere.
 */
/**
 * The download button.
 *
 * Only Windows gets a one-click file, because Windows is the only one of the four where
 * a downloaded script runs from a double-click. Everywhere else the honest thing is to
 * send people to the setup page rather than hand them a file their system will not run,
 * so on those systems the button says so and goes there instead.
 */
/**
 * A touch device that calls itself Linux is almost always Android.
 *
 * Android's user agent contains "Linux", and a tablet with "desktop site" switched on
 * drops the word "Android" from it entirely -- so the plain string test fell through to
 * the Linux row and handed an Android tablet a page of apt/dnf/pacman instructions and a
 * terminal command it has no terminal for. Reported from exactly that device.
 *
 * X11 is the tell in the other direction: a real desktop Linux session says so, and no
 * Android build does. A touchscreen laptop running Linux without X11 would be guessed
 * wrong here, but the setup page keeps all four systems as tabs, so that costs one tap --
 * while the current fault costs an Android reader the whole route.
 */
function looksLikeAndroid(ua, platform) {
  if (/Android/i.test(ua)) return true;
  const both = platform + ua;
  const touch = (navigator.maxTouchPoints || 0) > 0;
  return touch && /Linux/i.test(both) && !/X11|CrOS/i.test(both);
}

const SYSTEMS = [
  { id: 'windows', label: 'Windows', file: '/Steading.cmd', test: (ua, p) => /Win/i.test(p) || /Windows/i.test(ua) },
  { id: 'mac', label: 'macOS', file: null, test: (ua, p) => /Mac|iPhone|iPad|iPod/i.test(p + ua) },
  { id: 'android', label: 'Android', file: null, test: (ua, p) => looksLikeAndroid(ua, p) },
  { id: 'linux', label: 'Linux', file: null, test: (ua, p) => /Linux|X11|CrOS/i.test(p + ua) },
];

/**
 * Is the real app already running on this machine?
 *
 * This exists because of how the page was actually being got wrong. Someone downloaded
 * the installer, came back to this page, pasted a video link into the box here, and was
 * told the source site refused the server -- so they concluded the whole thing was
 * broken. The box was the trap: it is on the page that cannot download, while the copy
 * that can was sitting on their machine unopened.
 *
 * The probe is deliberately the weakest possible one. `no-cors` returns an opaque
 * response, so nothing can be read from it -- all it establishes is that something
 * answered on that port. No data crosses, and the local app needs no CORS headers for
 * this to work. A port with nothing on it fails in about a tenth of a second, so the
 * negative case is quick as well as correct.
 */
const LOCAL_APP = 'http://127.0.0.1:3000/';

async function localAppRunning() {
  try {
    await fetch(`${LOCAL_APP}api/health`, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Offer the one action that can actually work right now, and only that one.
 *
 * Not installed: the installer, and no video box at all -- a field that cannot succeed
 * should not be sitting there inviting someone to try. Installed: a way through to the
 * copy that works, carrying whatever link they had already pasted so they do not have
 * to find it again.
 */
async function paintLocalState() {
  const running = await localAppRunning();

  el.getInstall.hidden = running;
  el.getOpen.hidden = !running;
  document.documentElement.classList.toggle('app-running', running);

  if (!running) return;

  const pasted = el.url.value.trim();
  el.openLocal.href = pasted ? `${LOCAL_APP}?url=${encodeURIComponent(pasted)}` : LOCAL_APP;
  el.openLocal.textContent = t('local.open');
}

/**
 * Offer the live session, but only when there is one.
 *
 * The people this matters for cannot open a downloaded file, so an install button is a
 * dead end for them and this is the only route that arrives anywhere. It still must not
 * be offered when the far end is dark: a button that leads to "the session has ended"
 * is worse than no button, because it teaches them the thing is broken.
 *
 * The status file is written by scripts/publish-live.js when a session opens and again
 * when it closes. Same origin, so no permission question arises; and if the fetch fails
 * for any reason the answer is simply no, which is the safe direction to be wrong in.
 */
async function paintLiveRoute() {
  let active = false;
  try {
    const res = await fetch('/live-status.json', { cache: 'no-store' });
    active = res.ok && (await res.json())?.active === true;
  } catch {
    active = false;
  }

  el.getLive.hidden = !active;
  document.documentElement.classList.toggle('live-open', active);
}

function paintGet() {
  const ua = navigator.userAgent;
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  const system = SYSTEMS.find((s) => s.test(ua, platform)) ?? SYSTEMS[0];

  el.getApp.textContent = t('landing.get', { system: system.label });

  if (system.file) {
    el.getApp.href = system.file;
    el.getApp.setAttribute('download', '');
    el.getNote.textContent = t('landing.getNote');
  } else {
    // No double-click file for this system; the setup page has the one line it needs.
    el.getApp.href = '/setup';
    el.getApp.removeAttribute('download');
    el.getNote.textContent = t('setup.step1');
  }
}

function paintSupported() {
  const names = PLATFORMS.map((p) => p.label);
  let list;
  try {
    list = new Intl.ListFormat(getLanguage(), { style: 'long', type: 'conjunction' }).format(names);
  } catch {
    list = names.join(', '); // very widely supported, but not universally
  }
  el.supports.textContent = t('url.supports', { list });
  el.supports.hidden = false;
}

function paintServerStatus() {
  const health = state.health;

  if (getMode() === 'demo') {
    el.dot.className = 'dot is-ok';
    el.serverText.textContent = t('mode.explainDemo');
    return;
  }
  if (health === undefined) {
    el.dot.className = 'dot';
    el.serverText.textContent = t('server.checking');
    return;
  }
  if (health === null) {
    el.dot.className = 'dot is-bad';
    el.serverText.textContent = t('server.down');
    return;
  }
  if (!health.ok) {
    el.dot.className = 'dot is-bad';
    el.serverText.textContent = t('error.live_unreachable');
    return;
  }
  el.dot.className = 'dot is-ok';
  // Not t('server.ok'): that string says "local server running", which is true of the
  // build this app is named for but false here -- this is a function on Vercel. Saying
  // "local" on a hosted page is the kind of small lie that makes a careful reader
  // distrust the rest. Composed from the mode label so it needs no new translation.
  el.serverText.textContent = `${t('mode.live')} · yt-dlp ${health.ytdlp}`;
}

/**
 * Re-render everything language-dependent.
 *
 * Static markup is handled by data-i18n attributes; the rest is state that was rendered
 * earlier and would otherwise be stranded in the previous language.
 */
function repaintLanguage() {
  applyStatic();
  paintThemeLabel();
  paintMode();
  paintSupported();
  paintGet();
  paintLocalState();
  paintLiveRoute();
  paintMessage();
  paintServerStatus();

  busy(el.fetchBtn, el.fetchBtn.disabled, state.checking ? 'action.checking' : 'action.check');
  busy(el.download, el.download.disabled, state.downloading ? 'action.starting' : 'action.download');

  if (state.info) {
    el.title.textContent = state.info.title
      || t(state.info.demoSample ? 'demo.sampleTitle' : 'media.untitled');
    renderQualities(state.info);
  }
  if (state.lastProgress) renderProgress(state.lastProgress);

  el.lang.value = getLanguage();
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('app.description'));
}

// Leaving the page mid-download closes the SSE stream, which is the signal the server
// uses to reclaim the temp folder. Being explicit about it costs nothing.
window.addEventListener('pagehide', () => state.unwatch?.());

/**
 * Android share sheet. manifest.json registers Steading as a share target, so sharing
 * from the YouTube or TikTok app lands here as /?url=... -- or as /?text=... with the
 * link buried in a sentence, which is what those apps actually send.
 */
function consumeSharedLink() {
  const params = new URLSearchParams(location.search);
  const candidate = params.get('url') || params.get('text') || params.get('title');
  if (!candidate) return;

  const match = candidate.match(/https?:\/\/\S+/);
  const link = (match ? match[0] : candidate).trim();
  if (!link) return;

  el.url.value = link;
  // Clean the address bar so a reload does not re-trigger the same share.
  history.replaceState(null, '', location.pathname);
  el.form.requestSubmit();
}

/**
 * Entrances, and the diagram's motion.
 *
 * Two reasons this is observed rather than simply switched on at load. A page opened in
 * a background tab should not be animating to nobody, which matters on the kind of
 * machine this app is meant to run on. And a section that fades in as it arrives reads
 * as deliberate, where everything appearing at once reads as a page that jumped.
 *
 * If IntersectionObserver is missing, everything is shown at rest immediately: the
 * fallback must be the readable state, never the invisible one.
 */
function watchReveals() {
  const flow = document.getElementById('flow');
  const targets = document.querySelectorAll('.reveal');

  if (!('IntersectionObserver' in window)) {
    flow?.classList.add('is-live');
    return; // js-reveal was never added, so nothing was hidden. Nothing to restore.
  }

  /**
   * Arm the entrance, but only while the page is actually being drawn.
   *
   * A hidden tab is the trap here. CSS transitions do not advance in one, so an element
   * that starts at opacity 0 and is handed the class that transitions it to 1 simply
   * stays at 0 -- and IntersectionObserver reports nothing either, so the fallback that
   * adds the class does not help. Someone who opens the link in a background tab and
   * switches to it a moment later would find a blank page.
   *
   * Waiting for the page to be visible before hiding anything removes the whole failure
   * rather than patching it, and costs nothing: the animation still plays, just from the
   * moment the reader is actually looking.
   */
  const arm = () => {
    if (document.visibilityState !== 'visible') return false;

    document.documentElement.classList.add('js-reveal');

    const shown = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        shown.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -40px 0px' });

    for (const el of targets) shown.observe(el);

    const running = flow && new IntersectionObserver((entries) => {
      for (const entry of entries) flow.classList.toggle('is-live', entry.isIntersecting);
    });
    running?.observe(flow);

    // Belt and braces. Some embedded views composite without ever reporting an
    // intersection; after a moment, show everything regardless. If the observer did its
    // job it has already won and this changes nothing.
    setTimeout(() => {
      for (const el of targets) el.classList.add('is-in');
      flow?.classList.add('is-live');
    }, 1200);

    return true;
  };

  if (!arm()) {
    document.addEventListener('visibilitychange', function once() {
      if (!arm()) return;
      document.removeEventListener('visibilitychange', once);
    });
  }
}

// The install happens in another window. Coming back to this tab is the moment the
// answer is most likely to have changed, so that is when it is asked again.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') paintLocalState();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* offline shell is optional */ });
  });

  /**
   * A new worker replaced an older cache, which means this page was very probably built
   * from that old cache -- new markup running against last deploy's code. Reload once so
   * the visitor sees the current version rather than a broken-looking mixture.
   *
   * The session flag is the safety catch. Without it a worker that kept re-activating
   * would reload the page endlessly, and an endless reload in front of an audience is
   * far worse than the stale render this is meant to avoid.
   */
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type !== 'steading:updated') return;

    const flag = `steading.reloaded.${event.data.version}`;
    try {
      if (sessionStorage.getItem(flag)) return;
      sessionStorage.setItem(flag, '1');
    } catch {
      return; // No sessionStorage means no safety catch, so do not reload at all.
    }
    location.reload();
  });
}

/**
 * The demonstration is off the page entirely, and reachable only at ?demo=1.
 *
 * It was costing far more than it was worth. Someone came here to install the app,
 * found a video box, pasted their link into it, and was told the source site refused
 * the server -- so they concluded the product was broken. It was not: they were typing
 * into the one copy that can never download, while the copy that can sat unopened on
 * their machine. That happened repeatedly, which makes it the page's fault rather than
 * theirs.
 *
 * The interface is already visible in the hero as a drawing, so nothing is lost by
 * taking the interactive version off the main route. ?demo=1 keeps it available for
 * showing on purpose, which is the only context where it was ever useful.
 */
function wireDemoRoute() {
  const area = document.getElementById('demo-area');
  if (!area) return;

  const asked = new URLSearchParams(location.search).get('demo') === '1';
  area.hidden = !asked;
}

/**
 * Say what just happened, the moment it happens.
 *
 * Pressing the button used to change nothing on screen. The file landed in a folder the
 * reader may never open, the page sat there looking identical, and the reasonable
 * conclusion was that the click had failed -- so it got pressed again. One visit's
 * download history read Steading.cmd, Steading (1).cmd, Steading (2).cmd, and not
 * one of them had been run.
 *
 * The instructions are not behind another click, because the person who needs them is
 * exactly the person who will not go looking for them.
 */
function wireAfterDownload() {
  const button = document.getElementById('get-app');
  const panel = document.getElementById('after');
  if (!button || !panel) return;

  button.addEventListener('click', () => {
    // Only for the system that actually receives a file; elsewhere this goes to /setup.
    if (!button.hasAttribute('download')) return;
    if (!panel.hidden) return;

    panel.hidden = false;
    // After layout, or there is nothing for the browser to scroll to yet.
    requestAnimationFrame(() => panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  });
}

async function boot() {
  initTheme();
  watchReveals();
  wireDemoRoute();
  wireAfterDownload();
  buildLanguageMenu();
  el.modeBar = $('mode-bar');
  onLanguageChange(repaintLanguage);

  await setLanguage(detectLanguage());
  repaintLanguage();

  checkServer();
  consumeSharedLink();
}

boot();
