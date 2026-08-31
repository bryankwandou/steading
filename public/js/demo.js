/**
 * Demo backend.
 *
 * Speaks exactly the same shapes as the real server in the local build -- the same job
 * fields, the same phase names, the same error codes -- so app.js cannot tell the
 * difference and no UI code is branched for the demo. If the two ever diverge, the UI
 * breaks in demo mode, which is the point: the demo exercises the real rendering path.
 *
 * Two hard rules:
 *   1. It touches the network for nothing except its own sample file. No third party is
 *      contacted, so nothing here can fail because a site changed or an IP was blocked.
 *   2. It never claims to have fetched something it did not. The metadata it returns is
 *      labelled as a sample, and the file it hands over is a real clip generated for
 *      this project -- not the video whose link was pasted.
 *
 * The progress curve is deterministic: same link, same timings, every time. That is
 * what makes it safe to show live.
 */

import { validateUrl, safeFilename } from './validate.js';

/** Sample media that ships with the app. Real files, really playable. */
const SAMPLE = {
  mp4: { url: '/demo/sample.mp4', size: 341746, duration: 6 },
  mp3: { url: '/demo/sample.mp3', size: 24799, duration: 6 },
};

/**
 * The byte counts shown during the run are the sample file's real size. An invented
 * 25 MB would read better on a projector, but the message at the end names the size of
 * the file that actually lands, and the two disagreeing is exactly the kind of detail
 * that makes a viewer doubt everything else on screen.
 */
const totalBytes = (format) => SAMPLE[format].size;

const QUALITIES = ['best', '1080', '720', '480', '360'];

let counter = 0;
const jobs = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function newId() {
  // Same 16-hex shape the real server uses, so the UI's id handling is exercised too.
  counter += 1;
  return (Date.now().toString(16) + counter.toString(16)).padStart(16, '0').slice(-16);
}

class DemoError extends Error {
  constructor(code, { status = 400, detail = null } = {}) {
    super(code);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Metadata. The URL is validated for real -- an unsupported host is rejected here
 * exactly as the server would reject it -- but the details returned describe the sample
 * clip, not the pasted video.
 */
export async function info(rawUrl) {
  const checked = validateUrl(rawUrl);
  if (!checked.ok) throw new DemoError(checked.code, { detail: checked.detail ?? null });

  await sleep(420); // enough to see the button's loading state, short enough to feel instant

  return {
    title: null,           // app.js renders t('demo.sampleTitle') when this is the demo
    demoSample: true,      // the badge and the preview caption key off this
    uploader: 'Steading',
    duration: SAMPLE.mp4.duration,
    thumbnail: null,
    extractor: checked.platform,
    isLive: false,
    qualities: QUALITIES,
    url: checked.url,
    platform: checked.platform,
    platformLabel: checked.platformLabel,
  };
}

/**
 * The scripted run. Timings are chosen so a room watching a projector sees each phase
 * long enough to read it, and the whole thing finishes in about nine seconds.
 */
function script(format) {
  const total = totalBytes(format);
  const steps = [{ at: 0, phase: 'extracting', percent: null }];

  // Download: ease out, so it starts fast and visibly slows, the way a real one does.
  for (let i = 1; i <= 24; i += 1) {
    const t = i / 24;
    const percent = Math.round((1 - Math.pow(1 - t, 1.7)) * 100);
    steps.push({
      at: 900 + i * 240,
      phase: 'downloading',
      percent,
      downloaded: Math.round(total * (percent / 100)),
      total,
      speed: Math.round((total / 5.8) * (0.75 + Math.sin(t * Math.PI) * 0.45)),
      eta: Math.max(0, Math.round((1 - t) * 6)),
    });
  }

  const after = 900 + 24 * 240;
  steps.push({
    at: after + 300,
    phase: format === 'mp3' ? 'converting' : 'merging',
    percent: 100, downloaded: total, total, speed: null, eta: null,
  });
  steps.push({ at: after + 1800, phase: 'finishing', percent: 100, downloaded: total, total });
  return steps;
}

export async function createJob({ url, format, quality, title }) {
  const checked = validateUrl(url);
  if (!checked.ok) throw new DemoError(checked.code, { detail: checked.detail ?? null });
  if (!['mp4', 'mp3'].includes(format)) throw new DemoError('bad_format');
  if (quality && !QUALITIES.includes(quality)) throw new DemoError('bad_quality');

  // The real server allows two at once; keeping the same rule means the same message
  // is reachable here.
  const running = [...jobs.values()].filter((j) => j.state === 'running').length;
  if (running >= 2) throw new DemoError('too_many_jobs', { status: 429, detail: '2' });

  const id = newId();
  const job = {
    id,
    state: 'running',
    phase: 'extracting',
    percent: null,
    downloaded: null,
    total: null,
    speed: null,
    eta: null,
    format,
    filename: safeFilename(title, format),
    size: SAMPLE[format].size,
    code: null,
    detail: null,
    canceled: false,
  };
  jobs.set(id, job);
  return job;
}

export function cancel(id) {
  const job = jobs.get(id);
  if (job && job.state === 'running') {
    job.state = 'canceled';
    job.code = 'canceled';
    job.canceled = true;
  }
}

export function fileUrl(id) {
  const job = jobs.get(id);
  return job ? SAMPLE[job.format].url : SAMPLE.mp4.url;
}

/**
 * Stand-in for the SSE subscription. Same callback contract as api.watch, including the
 * returned unsubscribe function.
 */
export function watch(id, { onUpdate, onReady, onFailed }) {
  const job = jobs.get(id);
  if (!job) {
    queueMicrotask(() => onFailed({ code: 'job_not_found' }));
    return () => {};
  }

  const timers = [];
  let stopped = false;

  const emit = (patch) => {
    if (stopped || job.canceled) return;
    Object.assign(job, patch);
    onUpdate({ ...job });
  };

  for (const step of script(job.format)) {
    timers.push(setTimeout(() => emit({
      phase: step.phase,
      percent: step.percent ?? null,
      downloaded: step.downloaded ?? null,
      total: step.total ?? null,
      speed: step.speed ?? null,
      eta: step.eta ?? null,
    }), step.at));
  }

  const last = script(job.format).at(-1).at;
  timers.push(setTimeout(() => {
    if (stopped || job.canceled) return;
    job.state = 'ready';
    job.phase = 'ready';
    job.percent = 100;
    onReady({ ...job });
  }, last + 700));

  return () => {
    stopped = true;
    for (const t of timers) clearTimeout(t);
  };
}

export { DemoError };
