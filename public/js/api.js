/**
 * Backend adapter.
 *
 * The UI talks to one interface; this file decides who answers.
 *
 *   demo  -- js/demo.js, entirely offline, deterministic, cannot fail.
 *   live  -- the yt-dlp function under /api/, which really does contact the source site.
 *
 * Live mode is genuinely wired up and genuinely attempts the real thing. It is not the
 * default because a serverless function talks to YouTube from a datacenter address,
 * and those are blocked often enough that it is the wrong thing to stake a live
 * demonstration on. When it fails, it fails honestly: the reason is translated and
 * shown, and the app stays usable.
 */

import * as demo from './demo.js';

export class ApiError extends Error {
  constructor({ code, detail = null, status = 0, message }) {
    super(message || code || `HTTP ${status}`);
    this.name = 'ApiError';
    this.code = code || null;
    this.detail = detail;
    this.status = status;
  }
}

const MODE_KEY = 'steading.mode';

let mode = (() => {
  try {
    return localStorage.getItem(MODE_KEY) === 'live' ? 'live' : 'demo';
  } catch {
    return 'demo';
  }
})();

const listeners = new Set();

export function getMode() { return mode; }

export function setMode(next) {
  mode = next === 'live' ? 'live' : 'demo';
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* private mode */ }
  for (const fn of listeners) fn(mode);
  return mode;
}

export function onModeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ------------------------------------------------------------------- live */

async function postJson(path, body) {
  let res;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError({ code: 'live_unreachable', status: 0 });
  }

  let data = null;
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }

  if (!res.ok) {
    throw new ApiError({
      code: data?.code || 'server_error',
      detail: data?.detail ?? null,
      status: res.status,
      message: data?.error,
    });
  }
  return data;
}

/* -------------------------------------------------------------- interface */

export const api = {
  async health() {
    if (mode === 'demo') {
      return { ok: true, mode: 'demo', ytdlp: null, ffmpeg: null, activeJobs: 0 };
    }
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      return { ...(await res.json()), mode: 'live' };
    } catch {
      return { ok: false, mode: 'live', ytdlp: null, ffmpeg: null };
    }
  },

  info(url) {
    return mode === 'demo' ? demo.info(url) : postJson('/api/info', { url });
  },

  createJob(args) {
    if (mode === 'demo') return demo.createJob(args);
    return postJson('/api/jobs', args);
  },

  cancel(id) {
    if (mode === 'demo') return Promise.resolve(demo.cancel(id));
    return fetch(`/api/jobs/${id}`, { method: 'DELETE' }).catch(() => {});
  },

  fileUrl(id) {
    return mode === 'demo' ? demo.fileUrl(id) : `/api/jobs/${id}/file`;
  },

  watch(id, handlers) {
    if (mode === 'demo') return demo.watch(id, handlers);

    const source = new EventSource(`/api/jobs/${id}/events`);
    const parse = (fn) => (event) => {
      try { fn(JSON.parse(event.data)); } catch { /* malformed frame, skip */ }
    };
    source.addEventListener('update', parse(handlers.onUpdate));
    source.addEventListener('ready', parse(handlers.onReady));
    source.addEventListener('failed', parse(handlers.onFailed));
    source.onerror = () => { /* transient -- let it reconnect */ };
    return () => source.close();
  },
};

/** demo.js throws its own error type; normalise it so app.js has one thing to catch. */
export function normalizeError(err) {
  if (err instanceof ApiError) return err;
  if (err && err.code) return new ApiError({ code: err.code, detail: err.detail, status: err.status || 0 });
  return new ApiError({ code: 'server_error', status: 0 });
}
