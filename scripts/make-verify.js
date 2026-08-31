/**
 * Generate public/verify.html.
 *
 * Someone assessing this needs to be able to check the claims rather than take them,
 * so every figure on that page is read from the build by scripts/lib/evidence.js and
 * written in here -- nothing is typed by hand, and a wrong number means a wrong file.
 *
 * Run by `npm run package`, so the page cannot drift from the archive it describes.
 *
 * Two languages, not the app's twenty-four. This is a technical document rather than an
 * app screen: its readers are the people being handed the link, and a mistranslated
 * claim about what is and is not proven would be worse than one honest pair. The page
 * says so itself rather than leaving it looking like an oversight.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { digests, toolchain, shipped, ROOT } from './lib/evidence.js';

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const n = (v) => v.toLocaleString('en-US');

const facts = { digests: digests(), tools: toolchain(), size: shipped() };

/* ------------------------------------------------------------------- copy */

const COPY = {
  id: {
    lang: 'Bahasa Indonesia',
    title: 'Verifikasi',
    lead: 'Halaman ini mencatat apa yang diterbitkan di alamat ini dan bagaimana memeriksanya sendiri. Setiap angka di bawah dibaca dari berkas yang benar-benar dilayani, bukan diketik tangan.',
    generated: 'Dibuat otomatis saat build',

    checkTitle: 'Periksa sendiri',
    checkLead: 'Unduh arsipnya, hitung sidik jarinya, lalu cocokkan dengan tabel di bawah. Kalau cocok, berkas yang Anda pegang identik dengan yang dijelaskan di sini.',

    digestTitle: 'Sidik jari berkas',
    digestLead: 'SHA-256. Kolom ukuran dalam byte.',
    colFile: 'Berkas',
    colWhat: 'Isi',
    colBytes: 'Byte',

    envTitle: 'Lingkungan saat dibangun',
    envLead: 'Versi alat yang dipakai mesin pembangun. Mesin Anda boleh berbeda; angka ini ada supaya perbedaan bisa dijelaskan, bukan ditebak.',

    sizeTitle: 'Ukuran yang bisa diperiksa',
    sizeFiles: 'berkas',
    sizeLines: 'baris',
    sizeDeps: 'dependensi npm',
    sizeNote: 'Cukup kecil untuk dibaca seluruhnya. Tidak ada build step dan tidak ada paket pihak ketiga yang perlu dipercaya.',

    reproTitle: 'Mereproduksi',
    reproLead: 'Pasang, jalankan, lalu jalankan pengujiannya. Semuanya di mesin Anda sendiri.',

    provesTitle: 'Yang dibuktikan halaman ini',
    proves: [
      'Arsip yang Anda unduh identik byte-per-byte dengan yang dijelaskan di sini.',
      'Aplikasinya berjalan di mesin Anda sendiri, tanpa akun dan tanpa layanan kami di tengah.',
      'Pengujiannya lulus di mesin Anda, bukan hanya di mesin pembuatnya.',
    ],

    notTitle: 'Yang TIDAK dibuktikan halaman ini',
    notProves: [
      'Halaman utama alamat ini adalah peraga. Mode demo tidak mengunduh video sungguhan, dan mode langsung hanya mengambil metadata. Unduhan sungguhan hanya terjadi di salinan yang berjalan di mesin Anda.',
      'Tidak ada yang bisa dibuktikan di sini tentang siapa yang menulis kode ini atau kapan, di luar yang bisa Anda periksa sendiri dari isinya.',
      'Situs sumber bisa berubah kapan saja. Bahwa sebuah tautan berhasil hari ini bukan jaminan untuk besok, dan itu di luar kendali aplikasi mana pun.',
    ],

    langNote: 'Aplikasinya tersedia dalam 24 bahasa. Halaman ini sengaja hanya dua, karena klaim teknis yang salah terjemah lebih berbahaya daripada tidak diterjemahkan.',
    back: 'Kembali ke aplikasi',
    setup: 'Pasang di komputer Anda',
  },

  en: {
    lang: 'English',
    title: 'Verification',
    lead: 'This page records what is published at this address and how to check it yourself. Every figure below is read from the files actually served, not typed in by hand.',
    generated: 'Generated at build time',

    checkTitle: 'Check it yourself',
    checkLead: 'Download the archive, compute its digest, and compare it with the table below. If they match, the file you hold is identical to the one described here.',

    digestTitle: 'File digests',
    digestLead: 'SHA-256. Sizes in bytes.',
    colFile: 'File',
    colWhat: 'Contents',
    colBytes: 'Bytes',

    envTitle: 'Build environment',
    envLead: 'The tool versions on the machine that built this. Yours may differ; these are here so a difference can be explained rather than guessed at.',

    sizeTitle: 'Checkable size',
    sizeFiles: 'files',
    sizeLines: 'lines',
    sizeDeps: 'npm dependencies',
    sizeNote: 'Small enough to read in full. No build step, and no third-party packages you have to take on trust.',

    reproTitle: 'Reproducing it',
    reproLead: 'Install, run, then run its tests. All of it on your own machine.',

    provesTitle: 'What this page proves',
    proves: [
      'The archive you downloaded is byte-for-byte the one described here.',
      'The application runs on your own machine, with no account and nothing of ours in the middle.',
      'The tests pass on your machine, not only on the one it was built on.',
    ],

    notTitle: 'What this page does NOT prove',
    notProves: [
      'The main page at this address is a demonstration. Demo mode does not download real video, and live mode only fetches metadata. Real downloads happen only in the copy running on your machine.',
      'Nothing here establishes who wrote this code or when, beyond what you can determine from reading it.',
      'Source sites change. That a link works today is no guarantee for tomorrow, and that is outside any downloader’s control.',
    ],

    langNote: 'The application itself is available in 24 languages. This page is deliberately only two: a mistranslated technical claim would be worse than an untranslated one.',
    back: 'Back to the app',
    setup: 'Run it on your computer',
  },
};

/* ------------------------------------------------------------------ render */

function digestRows(c) {
  return facts.digests.map((d) => `
        <tr>
          <td><code>${esc(d.label)}</code></td>
          <td>${esc(d.what)}</td>
          <td class="num">${n(d.bytes)}</td>
        </tr>
        <tr class="digest-row">
          <td colspan="3"><code class="digest">${esc(d.sha256)}</code></td>
        </tr>`).join('');
}

function section(c) {
  const checkCmd = `curl -fsSL https://getsteading.vercel.app/steading.zip -o steading.zip

# Windows
certutil -hashfile steading.zip SHA256

# macOS, Linux, Termux
shasum -a 256 steading.zip`;

  const reproCmd = `# 1. Install and start it
#    Windows
powershell -c "irm https://getsteading.vercel.app/install.ps1 | iex"
#    macOS, Linux, Termux
curl -fsSL https://getsteading.vercel.app/install.sh | sh

# 2. Run its tests, from the folder it installed into
cd ~/Steading/steading
npm test`;

  return `
  <section class="v-block">
    <h2>${esc(c.checkTitle)}</h2>
    <p>${esc(c.checkLead)}</p>
    <pre><code>${esc(checkCmd)}</code></pre>
  </section>

  <section class="v-block">
    <h2>${esc(c.digestTitle)}</h2>
    <p>${esc(c.digestLead)}</p>
    <div class="v-scroll">
      <table class="v-table">
        <thead><tr><th>${esc(c.colFile)}</th><th>${esc(c.colWhat)}</th><th class="num">${esc(c.colBytes)}</th></tr></thead>
        <tbody>${digestRows(c)}
        </tbody>
      </table>
    </div>
  </section>

  <section class="v-block">
    <h2>${esc(c.envTitle)}</h2>
    <p>${esc(c.envLead)}</p>
    <dl class="v-facts">
      <dt>Node</dt><dd><code>${esc(facts.tools.node)}</code></dd>
      <dt>Platform</dt><dd><code>${esc(facts.tools.platform)}</code></dd>
      <dt>yt-dlp</dt><dd><code>${esc(facts.tools.ytdlp ?? '—')}</code></dd>
      <dt>ffmpeg</dt><dd><code>${esc(facts.tools.ffmpeg ?? '—')}</code></dd>
    </dl>
  </section>

  <section class="v-block">
    <h2>${esc(c.sizeTitle)}</h2>
    <ul class="v-counts">
      <li><strong>${n(facts.size.files)}</strong> ${esc(c.sizeFiles)}</li>
      <li><strong>${n(facts.size.lines)}</strong> ${esc(c.sizeLines)}</li>
      <li><strong>${n(facts.size.dependencies)}</strong> ${esc(c.sizeDeps)}</li>
    </ul>
    <p>${esc(c.sizeNote)}</p>
  </section>

  <section class="v-block">
    <h2>${esc(c.reproTitle)}</h2>
    <p>${esc(c.reproLead)}</p>
    <pre><code>${esc(reproCmd)}</code></pre>
  </section>

  <section class="v-block">
    <h2>${esc(c.provesTitle)}</h2>
    <ul class="v-list is-yes">${c.proves.map((x) => `\n      <li>${esc(x)}</li>`).join('')}
    </ul>
  </section>

  <section class="v-block">
    <h2>${esc(c.notTitle)}</h2>
    <ul class="v-list is-no">${c.notProves.map((x) => `\n      <li>${esc(x)}</li>`).join('')}
    </ul>
  </section>

  <p class="v-note">${esc(c.langNote)}</p>

  <p class="v-links">
    <a href="/">${esc(c.back)}</a>
    <a href="/setup">${esc(c.setup)}</a>
  </p>`;
}

const built = new Date().toISOString().replace('T', ' ').slice(0, 16);

const html = `<!doctype html>
<html lang="id" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Steading</title>
<meta name="description" content="Fast. Seamless. 100% Local.">
<meta name="theme-color" content="#ffffff">
<meta name="robots" content="noindex">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<script src="/js/boot-theme.js"></script>
<link rel="stylesheet" href="/css/style.css">
</head>
<body>

<header class="head">
  <div class="head-inner">
  <a class="brand brand-link" href="/">
    <svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5v11.5m0 0 4.2-4.2M12 15l-4.2-4.2"/>
      <path d="M4.5 17.5v1.2a1.8 1.8 0 0 0 1.8 1.8h11.4a1.8 1.8 0 0 0 1.8-1.8v-1.2"/>
    </svg>
    <span class="brand-text">
      <span class="brand-name">Steading</span>
      <span class="tagline">Fast. Seamless. 100% Local.</span>
    </span>
  </a>
  <div class="head-actions">
    <div class="v-langs" role="group">
      <button type="button" class="v-lang is-on" data-show="id">ID</button>
      <button type="button" class="v-lang" data-show="en">EN</button>
    </div>
    <button type="button" id="theme" class="btn-icon theme-btn" aria-label="Theme">
      <svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4.2"/>
        <path d="M12 2.6v2.2M12 19.2v2.2M4.36 4.36 5.9 5.9M18.1 18.1l1.54 1.54M2.6 12h2.2M19.2 12h2.2M4.36 19.64 5.9 18.1M18.1 5.9l1.54-1.54"/>
      </svg>
      <svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20.2 14.2A8.3 8.3 0 0 1 9.8 3.8a8.3 8.3 0 1 0 10.4 10.4Z"/>
      </svg>
    </button>
  </div>
  </div>
</header>

<main class="app v-page">
  <div data-lang="id">
    <h1 class="v-title">${esc(COPY.id.title)}</h1>
    <p class="v-lead">${esc(COPY.id.lead)}</p>
    <p class="v-stamp">${esc(COPY.id.generated)} · <code>${esc(built)} UTC</code></p>
    ${section(COPY.id)}
  </div>

  <div data-lang="en" hidden>
    <h1 class="v-title">${esc(COPY.en.title)}</h1>
    <p class="v-lead">${esc(COPY.en.lead)}</p>
    <p class="v-stamp">${esc(COPY.en.generated)} · <code>${esc(built)} UTC</code></p>
    ${section(COPY.en)}
  </div>
</main>

<script type="module" src="/js/verify.js"></script>
</body>
</html>
`;

writeFileSync(join(ROOT, 'public', 'verify.html'), html);
console.log(`  verify.html    ${facts.digests.length} digests, ${(html.length / 1024).toFixed(0)} KB`);
