/**
 * Generate public/sites.html -- the catalogue of what Steading supports.
 *
 * Built by `npm run package`, from the same validator the server runs on, so the page
 * cannot claim a site the app would reject or miss one it accepts. A hand-maintained
 * list drifted once already: the hosted build spent a day rejecting eighteen platforms
 * the application supported, and nothing noticed because nothing compared them.
 *
 * The reason this page is worth publishing is the middle column. "Supports 23 sites" is
 * a claim; "fifteen of them were fetched on a named date and eight were not" is a
 * position someone can check, and it is the honest shape of what is actually known.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { platforms, locked, summary, DROPPED, } from './lib/catalogue.js';
import { ROOT } from './lib/evidence.js';

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const rows = platforms();
const stats = summary();
const built = new Date().toISOString().slice(0, 10);

const COPY = {
  id: {
    title: 'Situs yang didukung',
    lead: `Daftar ini dibaca langsung dari kode yang memutuskan tautan mana diterima, jadi ia tidak bisa menjanjikan situs yang akan ditolak aplikasinya. Per ${built}: ${stats.total} situs, ${stats.probed} sudah diuji dengan tautan sungguhan, ${stats.listed} belum.`,
    probedTitle: `Diuji dan berhasil — ${stats.probed}`,
    probedLead: 'Sebuah tautan hidup benar-benar diambil di mesin nyata, dengan tanggalnya. Beberapa dijalankan sampai berkasnya jadi.',
    listedTitle: `Terdaftar, belum diuji — ${stats.listed}`,
    listedLead: 'yt-dlp punya extractor-nya dan tautannya diterima, tapi belum ada yang mengonfirmasi unduhan sungguhan. Ini bukan janji.',
    droppedTitle: `Dicoba dan dibuang — ${stats.dropped}`,
    droppedLead: 'Dibiarkan terlihat supaya kandidat yang sama tidak ditemukan ulang lalu ditambahkan penuh harap setiap beberapa bulan.',
    lockedTitle: 'Dikenali, tapi ditolak dengan namanya',
    lockedLead: 'Situs ini merakit halamannya di dalam browser dan mengunci sebagian besar kirimannya di balik login. Mengunduhnya butuh browser tanpa tampilan yang membawa akun seseorang — program yang berbeda dari ini.',
    hostsLabel: 'Alamat yang diterima',
    audioLabel: 'audio saja',
    back: 'Kembali ke halaman utama',
    note: 'Kolom tengah itulah alasan halaman ini diterbitkan. "Mendukung 23 situs" adalah klaim; "lima belas diambil pada tanggal tertentu, delapan belum" adalah posisi yang bisa diperiksa.',
  },
  en: {
    title: 'Supported sites',
    lead: `This list is read straight from the code that decides which links are accepted, so it cannot promise a site the app would reject. As of ${built}: ${stats.total} sites, ${stats.probed} fetched with a real link, ${stats.listed} not yet.`,
    probedTitle: `Fetched and working — ${stats.probed}`,
    probedLead: 'A live URL was actually retrieved on a real machine, with a date. Several were run through to a finished file.',
    listedTitle: `Listed, not yet checked — ${stats.listed}`,
    listedLead: 'yt-dlp has an extractor and the link is accepted, but nobody has confirmed a real download. This is not a promise.',
    droppedTitle: `Tried and dropped — ${stats.dropped}`,
    droppedLead: 'Kept visible so the same candidate is not rediscovered and re-added hopefully every few months.',
    lockedTitle: 'Recognised, and refused by name',
    lockedLead: 'These assemble their pages inside the browser and gate most posts behind a login. Downloading them would need a headless browser carrying someone’s account — a different program from this one.',
    hostsLabel: 'Addresses accepted',
    audioLabel: 'audio only',
    back: 'Back to the main page',
    note: 'That middle column is why this page is published. "Supports 23 sites" is a claim; "fifteen were fetched on a named date and eight were not" is a position someone can check.',
  },
};

function siteRows(list, c) {
  return list.map((p) => `
        <tr>
          <td class="s-name">${esc(p.label)}${p.audio ? ` <span class="s-tag">${esc(c.audioLabel)}</span>` : ''}</td>
          <td class="s-hosts">${p.hosts.map((h) => `<code>${esc(h)}</code>`).join(' ')}</td>
          <td class="s-note">${p.on ? `<span class="s-date">${esc(p.on)}</span> ` : ''}${esc(p.note ?? '')}</td>
        </tr>`).join('');
}

function section(c) {
  const probed = rows.filter((r) => r.state === 'probed');
  const listed = rows.filter((r) => r.state === 'listed');

  const table = (title, lead, list) => `
  <section class="s-block">
    <h2>${esc(title)}</h2>
    <p>${esc(lead)}</p>
    <div class="v-scroll">
      <table class="v-table s-table">
        <thead><tr><th>${esc(c.title)}</th><th>${esc(c.hostsLabel)}</th><th></th></tr></thead>
        <tbody>${siteRows(list, c)}
        </tbody>
      </table>
    </div>
  </section>`;

  return `
  <h1 class="v-title">${esc(c.title)}</h1>
  <p class="v-lead">${esc(c.lead)}</p>

  ${table(c.probedTitle, c.probedLead, probed)}
  ${table(c.listedTitle, c.listedLead, listed)}

  <section class="s-block">
    <h2>${esc(c.droppedTitle)}</h2>
    <p>${esc(c.droppedLead)}</p>
    <ul class="s-plain">${DROPPED.map((d) => `
      <li><strong>${esc(d.label)}</strong> &mdash; ${esc(d.why)}</li>`).join('')}
    </ul>
  </section>

  <section class="s-block">
    <h2>${esc(c.lockedTitle)}</h2>
    <p>${esc(c.lockedLead)}</p>
    <ul class="s-plain">${locked().map((l) => `
      <li><strong>${esc(l.label)}</strong></li>`).join('')}
    </ul>
  </section>

  <p class="v-note">${esc(c.note)}</p>
  <p class="v-links"><a href="/">${esc(c.back)}</a> <a href="/verify">/verify</a></p>`;
}

const html = `<!doctype html>
<html lang="id" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Steading</title>
<meta name="description" content="Fast. Seamless. 100% Local.">
<meta name="theme-color" content="#ffffff">
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
  <div data-lang="id">${section(COPY.id)}</div>
  <div data-lang="en" hidden>${section(COPY.en)}</div>
</main>

<script type="module" src="/js/verify.js"></script>
</body>
</html>
`;

writeFileSync(join(ROOT, 'public', 'sites.html'), html);
console.log(`  sites.html     ${stats.total} sites (${stats.probed} probed, ${stats.listed} listed), ${(html.length / 1024).toFixed(0)} KB`);
