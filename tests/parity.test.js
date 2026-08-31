/**
 * Parity with the local build.
 *
 * The hosted build re-implements URL validation in the browser (there is no server to
 * do it in demo mode) and re-implements the error classifier in Python. Duplication is
 * acceptable only while something proves the copies agree, which is what this file is.
 *
 * If the local build gains a platform or an error code and the hosted one does not,
 * these fail.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const LOCAL = join(ROOT, '..', 'steading');

const hosted = await import('../public/js/validate.js');
const local = await import(`file://${join(LOCAL, 'server', 'lib', 'validate.js').replace(/\\/g, '/')}`);
const { CODES } = await import(`file://${join(LOCAL, 'server', 'lib', 'errors.js').replace(/\\/g, '/')}`);

test('the platform list is identical to the local build', () => {
  // The local module exports only {id,label}; the host lists are compared through
  // behaviour in the next test, which is the stronger check anyway.
  const shape = (list) => list.map((p) => `${p.id}|${p.label}`).sort();
  assert.deepEqual(shape(hosted.PLATFORMS), shape(local.SUPPORTED_PLATFORMS));
});

test('both validators reach the same verdict on the same inputs', () => {
  const cases = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/abc',
    'https://music.youtube.com/watch?v=abc',
    'youtube.com/watch?v=abc',
    'https://vt.tiktok.com/ZSabc/',
    'https://www.instagram.com/reel/Cabc/',
    'https://fb.watch/abc/',
    'https://notyoutube.com/watch?v=abc',
    'https://evil.example.com/x',
    'ftp://youtube.com/x',
    'javascript:alert(1)',
    '',
    '   ',
    `https://youtube.com/${'a'.repeat(2100)}`,
    'https://user:pass@youtube.com/watch?v=abc#frag',
  ];

  for (const input of cases) {
    const a = hosted.validateUrl(input);
    const b = local.validateUrl(input);
    assert.equal(a.ok, b.ok, `ok mismatch for ${JSON.stringify(input.slice(0, 40))}`);
    if (a.ok) {
      assert.equal(a.url, b.url, `normalised url mismatch for ${input.slice(0, 40)}`);
      assert.equal(a.platform, b.platform);
      assert.equal(a.platformLabel, b.platformLabel);
    } else {
      assert.equal(a.code, b.code, `code mismatch for ${JSON.stringify(input.slice(0, 40))}`);
    }
  }
});

test('safeFilename behaves identically', () => {
  const cases = [
    ['Big Buck Bunny 60fps 4K', 'mp4'],
    ['a/b\\c:d*e', 'mp3'],
    ['   ...trimmed...   ', 'mp4'],
    ['CON', 'mp4'],
    ['', 'mp3'],
    ['x'.repeat(300), 'mp4'],
  ];
  for (const [title, ext] of cases) {
    assert.equal(hosted.safeFilename(title, ext), local.safeFilename(title, ext),
      `mismatch for ${JSON.stringify(title.slice(0, 30))}`);
  }
});

test('every error code the hosted UI can show exists in the local error table', async () => {
  const en = (await import('../public/js/i18n.js')).BASE.en;
  const uiCodes = Object.keys(en)
    .filter((k) => k.startsWith('error.'))
    .map((k) => k.slice('error.'.length))
    // Codes the hosted build adds on top of the shared set.
    .filter((c) => !['live_unreachable', 'live_blocked', 'http', 'detail'].includes(c));

  for (const code of uiCodes) {
    assert.ok(CODES.includes(code), `hosted UI has wording for unknown code "${code}"`);
  }
  for (const code of CODES) {
    assert.ok(`error.${code}` in en, `hosted UI is missing wording for server code "${code}"`);
  }
});

test('the Python validator mirrors the same allowlist', async () => {
  const py = await readFile(join(ROOT, 'api', 'info.py'), 'utf8');
  for (const platform of hosted.PLATFORMS) {
    for (const host of platform.hosts) {
      assert.ok(py.includes(`"${host}"`), `api/info.py is missing host ${host}`);
    }
  }
  // And the same error codes it can emit.
  for (const code of ['geo_blocked', 'private_content', 'content_gone', 'network', 'live_blocked']) {
    assert.ok(py.includes(`"${code}"`), `api/info.py never returns ${code}`);
  }
});

test('the hosted dictionaries carry every key the local ones do, plus the mode keys', async () => {
  const hostedEn = (await import('../public/js/i18n.js')).BASE.en;
  const localEn = (await import(`file://${join(LOCAL, 'public', 'js', 'i18n.js').replace(/\\/g, '/')}`)).BASE.en;

  for (const key of Object.keys(localEn)) {
    assert.ok(key in hostedEn, `hosted build lost key "${key}"`);
  }
  for (const key of ['mode.demo', 'mode.live', 'mode.explainDemo', 'mode.explainLive',
    'mode.toLive', 'mode.toDemo', 'demo.sampleTitle', 'demo.sampleNote',
    'error.live_unreachable', 'error.live_blocked']) {
    assert.ok(key in hostedEn, `hosted build is missing mode key "${key}"`);
  }
});

test('all 24 hosted dictionaries stay in key parity', async () => {
  const { BASE, LANGUAGES } = await import('../public/js/i18n.js');
  const expected = Object.keys(BASE.en).sort();

  const dir = join(ROOT, 'public', 'i18n');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  assert.equal(files.length + 2, LANGUAGES.length, 'a language in the picker has no dictionary');

  for (const file of files) {
    const table = JSON.parse(await readFile(join(dir, file), 'utf8'));
    assert.deepEqual(Object.keys(table).sort(), expected, `${file} is out of parity`);
    for (const [key, value] of Object.entries(table)) {
      assert.equal(typeof value, 'string', `${file}["${key}"] is not a string`);
      assert.ok(value.trim(), `${file}["${key}"] is empty`);
    }
  }
});

test('placeholders survive translation in the hosted dictionaries', async () => {
  const { BASE } = await import('../public/js/i18n.js');
  const holders = (v) => [...v.matchAll(/\{([a-z]\w*)\}/gi)].map((m) => m[1]).sort();

  const dir = join(ROOT, 'public', 'i18n');
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.json'))) {
    const table = JSON.parse(await readFile(join(dir, file), 'utf8'));
    for (const [key, value] of Object.entries(BASE.en)) {
      assert.deepEqual(holders(table[key]), holders(value), `${file}["${key}"] placeholder drift`);
    }
  }
});

test('the downloadable zip is not stale', async () => {
  // The setup page hands this archive to anyone who wants to run the app for real, so a
  // stale one means people install a version with bugs that were already fixed. The
  // manifest records a hash over every shipped source file; if ../steading has moved on
  // since the last `npm run package`, these stop matching.
  const { collect, fingerprint } = await import('../scripts/lib/pack.js');
  const manifest = JSON.parse(await readFile(join(ROOT, 'public', 'steading.manifest.json'), 'utf8'));

  const files = collect();
  assert.equal(files.length, manifest.files,
    `../steading now has ${files.length} shipped files, the archive has ${manifest.files}. Run: npm run package`);
  assert.equal(fingerprint(files), manifest.source,
    '../steading has changed since steading.zip was built. Run: npm run package');
});

test('the zip on disk matches the manifest it was built with', async () => {
  const manifest = JSON.parse(await readFile(join(ROOT, 'public', 'steading.manifest.json'), 'utf8'));
  const { size } = await stat(join(ROOT, 'public', 'steading.zip'));
  assert.equal(size, manifest.bytes, 'steading.zip was replaced without its manifest. Run: npm run package');
});

test('all three validators agree on sites that are recognised but impossible', async () => {
  // Threads and X assemble their posts in the browser behind a login, so nothing can
  // fetch them server-side. Each build says so by name instead of giving the generic
  // "unsupported site", and the three copies of that judgement must not drift apart.
  const py = await readFile(join(ROOT, 'api', 'info.py'), 'utf8');

  for (const [input, site] of [
    ['https://www.threads.com/share/abc/', 'Threads'],
    ['https://threads.net/@a/post/b', 'Threads'],
    ['https://x.com/a/status/1', 'X'],
    ['https://twitter.com/a/status/1', 'X'],
  ]) {
    for (const [name, mod] of [['hosted', hosted], ['local', local]]) {
      const r = mod.validateUrl(input);
      assert.equal(r.ok, false, `${name} accepted ${input}`);
      assert.equal(r.code, 'url_site_locked', `${name} gave the wrong code for ${input}`);
      assert.equal(r.detail, site, `${name} did not name ${site}`);
    }
  }

  for (const host of ['threads.net', 'threads.com', 'x.com', 'twitter.com']) {
    assert.ok(py.includes(`"${host}"`), `api/info.py does not recognise ${host}`);
  }
  assert.ok(py.includes('"url_site_locked"'), 'api/info.py never returns url_site_locked');

  // And a genuinely unknown site still gets the generic answer.
  for (const mod of [hosted, local]) {
    assert.equal(mod.validateUrl('https://evil.example.com/x').code, 'url_unsupported_site');
  }
});

test('the verification page states the digests the files actually have', async () => {
  // The whole point of that page is that its numbers can be checked. A stale one would
  // be worse than no page at all: a reader who computes a digest and finds a mismatch
  // has been told, in effect, that the archive was tampered with.
  const { digests } = await import('../scripts/lib/evidence.js');
  const html = await readFile(join(ROOT, 'public', 'verify.html'), 'utf8');

  const facts = digests();
  assert.ok(facts.length >= 3, 'expected the archive and both installers');

  // Every digest printed on the page must be one of the real ones, not merely each real
  // one appearing somewhere. The page carries two language versions of the same table,
  // so an "includes" check passes while one copy is wrong -- which is precisely the
  // state that would make a careful reader think the archive had been tampered with.
  const printed = [...html.matchAll(/class="digest">([0-9a-f]{64})</g)].map((m) => m[1]);
  const real = new Set(facts.map((f) => f.sha256));

  assert.equal(printed.length, facts.length * 2,
    `expected each of the ${facts.length} digests once per language version`);

  for (const digest of printed) {
    assert.ok(real.has(digest),
      `verify.html prints a digest that matches no shipped file: ${digest.slice(0, 16)}... Run: npm run package`);
  }
  for (const { label, sha256, bytes } of facts) {
    assert.equal(printed.filter((d) => d === sha256).length, 2,
      `${label}'s digest should appear once in each language version. Run: npm run package`);
    assert.ok(html.includes(bytes.toLocaleString('en-US')),
      `verify.html does not carry the current size of ${label}. Run: npm run package`);
  }
});

test('the verification page is honest about what it does not prove', async () => {
  // This section is the reason the page is worth anything. If it ever gets trimmed for
  // looking unflattering, that is exactly when it should fail loudly.
  const html = await readFile(join(ROOT, 'public', 'verify.html'), 'utf8');
  for (const marker of ['v-list is-no', 'v-list is-yes']) {
    assert.ok(html.includes(marker), `verify.html is missing its "${marker}" section`);
  }
  const notProven = [...html.matchAll(/<ul class="v-list is-no">([\s\S]*?)<\/ul>/g)];
  assert.equal(notProven.length, 2, 'both language versions must carry the limits section');
  for (const [, body] of notProven) {
    assert.ok((body.match(/<li>/g) || []).length >= 3, 'the limits section must not be trimmed down');
  }
});

test('the service worker cache name changes when the shell does', async () => {
  // This one has teeth. Static assets are served cache-first, and the activate handler
  // only clears caches whose name differs from the current one -- so a fixed name means
  // a returning visitor keeps the old app.js and style.css forever while receiving the
  // new index.html, which renders as a broken page rather than an old one. No number of
  // redeploys fixes it, because every deploy carries the same name.
  const { currentVersion, expectedVersion } = await import('../scripts/stamp-sw.js');
  assert.equal(currentVersion(), expectedVersion(),
    'sw.js still carries a cache name from an older shell. Run: npm run package');
});

test('every path the service worker pre-caches actually exists', async () => {
  // A shell entry that 404s makes install() reject, and a service worker that never
  // installs silently stops being a service worker at all.
  const { shellPaths } = await import('../scripts/stamp-sw.js');
  const { stat } = await import('node:fs/promises');

  for (const path of shellPaths()) {
    if (path.startsWith('/api/')) continue;
    const names = [path === '/' ? '/index.html' : path, `${path}.html`];
    let found = false;
    for (const name of names) {
      try {
        found = (await stat(join(ROOT, 'public', name.replace(/^\//, '')))).isFile();
        if (found) break;
      } catch { /* try the next shape */ }
    }
    assert.ok(found, `sw.js pre-caches "${path}", which is not a file under public/`);
  }
});

test('every function boot() calls actually exists', async () => {
  // Written after shipping a page that rendered nothing. A block replacement removed
  // wireAfterDownload along with the code above it, boot() threw ReferenceError on its
  // fourth line, and everything after that line never ran -- so the page loaded with
  // empty headings and no working buttons. Nothing in the suite noticed, because
  // nothing here executes boot().
  const src = await readFile(join(ROOT, 'public', 'js', 'app.js'), 'utf8');

  const bootAt = src.indexOf('async function boot() {');
  assert.ok(bootAt > 0, 'app.js should still have a boot()');

  const called = [...src.slice(bootAt).matchAll(/^ {2}([a-zA-Z_$][\w$]*)\(\);$/gm)].map((m) => m[1]);
  assert.ok(called.length >= 4, `expected boot() to call several things, saw ${called.length}`);

  for (const name of called) {
    if (name === 'boot') continue; // its own call at the end of the file
    // Built from strings rather than literals, so every backslash has to survive being
    // a string escape first. That is what went wrong the first time this was written.
    const defined = new RegExp(`function ${name}\\s*\\(`).test(src)
      || new RegExp(`(const|let)\\s+${name}\\s*=`).test(src)
      || new RegExp(`^import[^;]*\\b${name}\\b[^;]*;`, 'm').test(src);
    assert.ok(defined, `boot() calls ${name}(), which is neither defined nor imported in app.js`);
  }
});
