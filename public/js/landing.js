/**
 * Landing motion: the hero parallax, and the reveal as sections come into view.
 *
 * Two rules shape all of it.
 *
 * The first is that motion is a preference, not a default. The reduced-motion query is
 * checked before a single listener is attached, so a visitor who asked for less motion
 * does not merely get animations that finish instantly -- the code that would run them
 * never runs. That also means no scroll listener and no pointer listener on the devices
 * least able to afford them.
 *
 * The second is that the page has to be correct with this file absent. The scene has a
 * composed default rotation in CSS and every revealed section is visible until an
 * observer decides otherwise, so a blocked or failed script costs the flourish and
 * nothing else. A landing page whose content depends on JavaScript is a landing page
 * that is sometimes blank.
 */

const wantsMotion = window.matchMedia('(prefers-reduced-motion: no-preference)');

/* ------------------------------------------------------------------ reveal */

/**
 * Reveal on scroll.
 *
 * The `.rise` class only hides an element inside the no-preference media query, so the
 * starting state is invisible exactly when it is going to be animated back. Adding
 * `shown` is therefore safe to do eagerly, and is what happens if IntersectionObserver
 * is missing: everything is simply already shown.
 */
function reveal() {
  const items = document.querySelectorAll('.rise');
  if (!items.length) return;

  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('shown'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('shown');
      observer.unobserve(entry.target); // it only needs to arrive once
    }
  }, {
    // Deliberately no negative bottom margin and no threshold above zero.
    //
    // The tasteful version of this biases the trigger upward so an element has settled
    // by the time it is properly in view. That bias has a failure mode: anything sitting
    // in the bottom slice of a page that cannot scroll any further never crosses the
    // line, so it stays at opacity 0 for ever. Measured on this page it cost the last
    // three elements -- a heading and its text, permanently invisible.
    //
    // Revealing on the first visible pixel costs a little of the effect and cannot hide
    // content, which is the right way round. Nothing decorative is worth a reader not
    // being able to read the page.
    rootMargin: '0px',
    threshold: 0,
  });

  items.forEach((el) => observer.observe(el));

  // A second, cruder guarantee. If anything is still hidden by the time the reader has
  // reached the end of the page, the effect has failed at its one job and the content
  // is simply shown. Cheap insurance against a browser quirk in an observer that is
  // otherwise invisible when it goes wrong.
  addEventListener('scroll', function atBottom() {
    if (scrollY + innerHeight < document.documentElement.scrollHeight - 4) return;
    items.forEach((el) => el.classList.add('shown'));
    removeEventListener('scroll', atBottom);
  }, { passive: true });
}

/* --------------------------------------------------------------- parallax */

/**
 * Turn the hero scene toward the pointer.
 *
 * The rotation is deliberately small. The effect should register as the scene being a
 * physical object rather than as the page moving: past about ten degrees it stops
 * reading as depth and starts reading as a gimmick.
 *
 * Writes are batched into one animation frame because pointermove fires far faster than
 * the screen refreshes, and setting a custom property on every event is how a smooth
 * effect turns into a stuttering one.
 */
function parallax() {
  const scene = document.querySelector('.scene');
  const stage = scene?.querySelector('.stage');
  if (!scene || !stage) return;

  // Coarse pointers have no hover to track, and a phone tilting the scene under a
  // thumb that is trying to scroll is an irritation rather than a flourish.
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const MAX = 9; // degrees, per axis
  let frame = 0;
  let rx = 8;
  let ry = -14;

  const apply = () => {
    frame = 0;
    stage.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
    stage.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
  };

  scene.addEventListener('pointermove', (event) => {
    const box = scene.getBoundingClientRect();
    // -1..1 from the centre of the scene, so the maths does not care about its size.
    const x = ((event.clientX - box.left) / box.width) * 2 - 1;
    const y = ((event.clientY - box.top) / box.height) * 2 - 1;

    rx = 8 - y * MAX;
    ry = -14 + x * MAX;
    if (!frame) frame = requestAnimationFrame(apply);
  });

  // Returning to the composed default rather than freezing wherever the pointer left.
  scene.addEventListener('pointerleave', () => {
    rx = 8;
    ry = -14;
    if (!frame) frame = requestAnimationFrame(apply);
  });
}

/* ------------------------------------------------------------------- start */

if (wantsMotion.matches) {
  reveal();
  parallax();
} else {
  document.querySelectorAll('.rise').forEach((el) => el.classList.add('shown'));
}

// Someone can change the setting while the page is open; honouring that immediately is
// cheaper than making them reload, and it is the polite reading of the preference.
wantsMotion.addEventListener('change', (event) => {
  if (!event.matches) {
    document.querySelectorAll('.rise').forEach((el) => el.classList.add('shown'));
  }
});
