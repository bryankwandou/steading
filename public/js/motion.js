/**
 * The part of the motion system that needs a script.
 *
 * Most of it does not. Scroll-linked depth, the fanning stack, the section entrances and
 * the progress rail are all native CSS timelines, which means they keep working with
 * this file blocked and they cost nothing to drive. Three things genuinely need code:
 * a pointer position to lean towards, numbers that count rather than sit, and a marquee
 * that stops when it leaves the screen.
 *
 * Everything here is additive. The page is complete before this runs, and if it never
 * runs the cards sit flat, the figures show their final values, and the marquee is a
 * plain row of names.
 */

const wantsMotion = matchMedia('(prefers-reduced-motion: no-preference)');

/* ------------------------------------------------------------------- tilt */

/**
 * Lean a card towards the pointer.
 *
 * Written as two custom properties from -1 to 1 rather than as a transform, so the CSS
 * owns what the numbers mean and this owns only where the pointer is. That split is what
 * lets the tilt be switched off entirely in the stylesheet.
 *
 * Positions are read on pointermove but written in a frame, because reading
 * getBoundingClientRect and writing a style in the same handler is how a smooth pointer
 * turns into a stuttering one.
 */
function tilt() {
  const cards = document.querySelectorAll('.tilt');
  if (!cards.length) return;

  for (const card of cards) {
    let frame = 0;

    card.addEventListener('pointermove', (event) => {
      // Coarse pointers have no hover state to speak of, and a finger on the card would
      // leave it stuck at whatever angle the last touch set.
      if (event.pointerType !== 'mouse') return;
      if (frame) return;

      frame = requestAnimationFrame(() => {
        frame = 0;
        const box = card.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width - 0.5;
        const y = (event.clientY - box.top) / box.height - 0.5;
        card.style.setProperty('--mx', (x * 2).toFixed(3));
        card.style.setProperty('--my', (y * 2).toFixed(3));
      });
    });

    card.addEventListener('pointerleave', () => {
      cancelAnimationFrame(frame);
      frame = 0;
      card.style.setProperty('--mx', '0');
      card.style.setProperty('--my', '0');
    });
  }
}

/* ----------------------------------------------------------------- tallies */

/**
 * Count the headline figures up, once, when they arrive.
 *
 * Once is the load-bearing word. A number that re-counts every time it scrolls past
 * stops reading as a measurement and starts reading as an ornament, and these four are
 * the page's factual claims.
 *
 * The final value is already in the markup, so a blocked script or a reader with reduced
 * motion sees the correct figure immediately rather than a zero.
 */
function tallies() {
  const nodes = document.querySelectorAll('.tally');
  if (!nodes.length || !('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const node = entry.target;
      observer.unobserve(node);

      const final = Number(node.textContent.replace(/[^\d]/g, ''));
      if (!Number.isFinite(final) || final === 0) continue;

      const started = performance.now();
      const DURATION = 900;

      const step = (now) => {
        const t = Math.min(1, (now - started) / DURATION);
        // Eased out, so it decelerates into the real number instead of stopping dead.
        const eased = 1 - (1 - t) ** 3;
        node.textContent = Math.round(final * eased).toLocaleString();
        if (t < 1) requestAnimationFrame(step);
        else node.textContent = final.toLocaleString();
      };

      requestAnimationFrame(step);
    }
  }, { threshold: 0.6 });

  for (const node of nodes) observer.observe(node);
}

/* ---------------------------------------------------------------- marquee */

/**
 * Fill the marquee, and stop it when it is not being looked at.
 *
 * The names come from /sites.json rather than the markup, so the band cannot claim
 * support for something the list no longer contains. The row is written twice because a
 * loop that translates by half its width needs the second half to arrive seamlessly.
 */
async function marquee() {
  const track = document.getElementById('marquee-track');
  const band = document.getElementById('marquee');
  if (!track || !band) return;

  let names = [];
  try {
    const res = await fetch('/sites.json', { cache: 'force-cache' });
    const data = await res.json();
    names = (Array.isArray(data) ? data : data.sites ?? [])
      .map((s) => (typeof s === 'string' ? s : s.name))
      .filter(Boolean);
  } catch {
    return; // no list, no band -- better than a band of invented names
  }

  if (names.length < 6) return;

  const row = document.createDocumentFragment();
  for (const name of [...names, ...names]) {
    const chip = document.createElement('span');
    chip.className = 'marquee-chip';
    chip.textContent = name;
    row.append(chip);
  }
  track.replaceChildren(row);
  band.hidden = false;

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => {
      band.classList.toggle('is-resting', !entry.isIntersecting);
    }, { threshold: 0 });
    observer.observe(band);
  }
}

/* -------------------------------------------------------------------- rail */

/** The progress rail, only where the browser can drive it from scroll position itself. */
function rail() {
  if (!CSS.supports('animation-timeline: scroll()')) return;
  const bar = document.createElement('div');
  bar.className = 'scroll-rail';
  bar.setAttribute('aria-hidden', 'true');
  document.body.prepend(bar);
}

/* --------------------------------------------------------------------- go */

marquee();

if (wantsMotion.matches) {
  tilt();
  tallies();
  rail();
}
