/**
 * The part of Steading that works with nothing installed.
 *
 * Everywhere else this site is careful to say it cannot download for you, and that is
 * still true of video: merging streams needs ffmpeg and a real filesystem, and neither
 * exists in a serverless function. Pictures are different. There is no merging, nothing
 * is transcoded, and a page of photos is a few hundred kilobytes -- so the
 * server can genuinely do it, and the answer comes back as a file you keep.
 *
 * That matters most for the person this project was built for: a creator with a phone
 * and no computer, who cannot install anything and would not know where a downloaded
 * file went if they could. Here they paste a link and get a PDF.
 *
 * Written as its own module with its own state, deliberately kept out of the demo
 * engine in app.js. That one renders a simulation; this one performs a real request
 * against a real endpoint, and mixing the two is how a demo starts getting mistaken for
 * the product.
 */

const $ = (id) => document.getElementById(id);

const el = {
  form: $('pic-form'),
  input: $('pic-url'),
  submit: $('pic-go'),
  status: $('pic-status'),
  result: $('pic-result'),
  format: $('pic-format'),
  formatNote: $('pic-kind-note'),
};

/**
 * The two shapes this page can hand back.
 *
 * The note changes with the choice, because "one PDF" and "original pictures" are not
 * obviously different to someone who has not thought about file formats -- and the
 * difference has teeth. A PDF here can only carry JPEG verbatim, since there is no
 * encoder in a serverless function, so choosing it silently drops any PNG or WebP the
 * page published. Measured on one article: eleven pictures in the PDF, twelve in the zip.
 */
const FORMAT_NOTES = {
  pdf: 'Every picture bound into a single document, in the order the page used.',
  zip: 'A zip of the pictures exactly as they were published — jpg, png or webp, '
     + 'untouched. This keeps pictures that a PDF has to leave out.',
};

if (el.form) {
  /** Only one request at a time: a second press should not start a second 40-second job. */
  let busy = false;

  /** A radiogroup rather than a select: two choices, both worth reading without opening. */
  if (el.format) {
    for (const button of el.format.querySelectorAll('.seg-btn')) {
      button.addEventListener('click', () => {
        const value = button.dataset.value;
        el.format.dataset.active = value;
        for (const sibling of el.format.querySelectorAll('.seg-btn')) {
          sibling.setAttribute('aria-checked', String(sibling === button));
        }
        if (el.formatNote) el.formatNote.textContent = FORMAT_NOTES[value];
      });
    }
  }

  const chosenFormat = () => (el.format?.dataset.active === 'zip' ? 'zip' : 'pdf');

  /**
   * Say what is happening, in one place.
   *
   * `tone` drives the styling and, more importantly, `role`: a failure is announced
   * assertively so a screen reader interrupts with it, while progress is polite so it
   * does not talk over someone still reading the form.
   */
  const say = (message, tone = 'info') => {
    el.status.textContent = message;
    el.status.dataset.tone = tone;
    el.status.hidden = !message;
    el.status.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  };

  const setBusy = (on, label) => {
    busy = on;
    el.submit.disabled = on;
    el.submit.dataset.busy = on ? '1' : '0';
    el.submit.textContent = label;
  };

  el.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;

    let url = el.input.value.trim();
    if (!url) {
      say('Paste a link first.', 'error');
      el.input.focus();
      return;
    }
    // Almost nobody types the scheme. Copying an address out of a phone browser, off a
    // page, or from a message all produce "youtube.com/watch?v=...", and this refused
    // every one of them with a lecture about starting with http.
    //
    // A reviewer pasted exactly that and was told it was not a web address, which reads
    // as the tool being broken rather than as the tool being fussy. The scheme is not
    // information the reader has to supply: there is one sensible answer, so supply it.
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
      url = 'https://' + url;
      el.input.value = url;   // show what will actually be fetched
    }

    // Still checked before the round trip, but only for what is genuinely not an
    // address: a sentence, a bare word, a filename.
    if (!/^https?:\/\/[^\s.]+\.[^\s]{2,}$/i.test(url)) {
      say('That does not look like a web address.', 'error');
      el.input.focus();
      return;
    }

    el.result.hidden = true;
    el.result.textContent = '';
    setBusy(true, 'Collecting…');
    say('Reading the page and fetching its pictures. This can take up to a minute.', 'work');

    try {
      const res = await fetch('/api/pictures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, format: chosenFormat() }),
      });

      if (!res.ok) {
        // The server speaks in codes so it does not have to know the reader's language.
        let code = 'server_error';
        try {
          code = (await res.json()).code || code;
        } catch { /* a non-JSON body means the platform failed, not the handler */ }

        const known = {
          no_image: 'No pictures were found on that page. Try a post rather than a profile or a feed.',
          bad_url: 'That address cannot be reached. Private and local addresses are refused on purpose.',
          bad_request: 'That request was not understood. Check the link and try once more.',
        };
        say(known[code] || 'The server could not finish that one. Try again in a moment.', 'error');
        return;
      }

      const pages = Number(res.headers.get('X-Steading-Pages')) || 0;
      const truncated = res.headers.get('X-Steading-Truncated') === '1';
      const source = res.headers.get('X-Steading-Source') || 'page';
      const blob = await res.blob();

      // A blob URL rather than a data: URI: a three-megabyte data URI is a
      // three-megabyte string in memory, and phones are where this runs.
      const href = URL.createObjectURL(blob);
      const name = (res.headers.get('Content-Disposition') || '')
        .match(/filename="([^"]+)"/)?.[1] || 'pictures.pdf';

      const link = document.createElement('a');
      link.href = href;
      link.download = name;
      link.className = 'btn btn-primary pic-download';
      link.textContent = `Save ${name}`;
      // Revoked after the click rather than immediately: revoking too early leaves the
      // browser holding a dead handle and the save silently does nothing.
      link.addEventListener('click', () => setTimeout(() => URL.revokeObjectURL(href), 60_000));

      el.result.append(link);
      el.result.hidden = false;

      const size = blob.size > 1024 * 1024
        ? `${(blob.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(blob.size / 1024)} KB`;

      // Always the real number, and a reason whenever it is smaller than the reader
      // expects. A one-page PDF from a fourteen-photo carousel looks like a bug unless
      // the page says which of the two things happened: the post was thin, or the site
      // only publishes its cover to someone who is not signed in.
      const count = `${pages} picture${pages === 1 ? '' : 's'}`;
      // The sentence has to describe the thing actually produced. "Bound into one PDF"
      // read on a zip download would be the interface misreporting its own work.
      const kinds = (res.headers.get('X-Steading-Kinds') || '').split(',').filter(Boolean);
      const isZip = chosenFormat() === 'zip';
      const verb = isZip
        ? `Saved ${count} as ${kinds.length ? kinds.join(' and ').toUpperCase() : 'files'} in one zip`
        : `Bound ${count} into one PDF`;
      let note;
      if (truncated) {
        note = `${verb} (${size}) — the first ${pages} of them. That page holds more than fits in one request.`;
      } else if (source === 'oembed') {
        note = `${verb} (${size}). This site publishes only the cover `
          + `picture to visitors who are not signed in, so the rest of the post is out of `
          + `reach without an account &mdash; and Steading never asks for one.`;
      } else if (source === 'mixed') {
        note = `${verb} (${size}). Some of the post was only available `
          + `through its preview, so this may be fewer pictures than the post contains.`;
      } else {
        note = `${verb} (${size}).`;
      }
      say(note.replace(/&mdash;/g, '—'), 'ok');
    } catch {
      // fetch only rejects on a network fault, which on a phone usually means the
      // connection dropped rather than anything being wrong with the request.
      say('The connection dropped before the file arrived. Check your signal and try again.', 'error');
    } finally {
      setBusy(false, 'Save pictures as PDF');
    }
  });

  // A link arriving from an Android share sheet, or from the browser extension, should
  // land in the field ready to go rather than making someone paste it a second time.
  const incoming = new URLSearchParams(location.search);
  const shared = incoming.get('url') || incoming.get('text') || incoming.get('title');
  if (shared) {
    // Share sheets often send "some caption https://the.link"; take the address out.
    const found = shared.match(/https?:\/\/[^\s]+/);
    if (found) el.input.value = found[0];
  }
}
