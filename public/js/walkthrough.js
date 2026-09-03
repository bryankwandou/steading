/**
 * Driving the walkthrough.
 *
 * Three rules shape it.
 *
 * It must be stoppable. Something that moves on its own and cannot be halted is an
 * obstacle to anyone who reads slowly, and pressing any control stops the timer rather
 * than fighting it for the next few seconds.
 *
 * It must not move at all for someone who asked their system for less motion. That
 * reader gets step one and the full set of controls, which is the same walkthrough at a
 * pace they choose, rather than a lesser one.
 *
 * It must be correct with this file absent. The markup carries all six steps; the first
 * is marked current by this script, so a blocked script leaves a readable list of the
 * six stages instead of an empty frame.
 */

const $ = (id) => document.getElementById(id);

const screen = $('wt-screen');
const steps = $('wt-steps');
const track = $('wt-track');
const count = $('wt-count');
const playBtn = $('wt-play');

if (screen && steps) {
  const slides = [...screen.querySelectorAll('.wt-slide')];
  const captions = [...steps.querySelectorAll('li')];
  const pips = [...track.querySelectorAll('button')];
  const total = slides.length;

  const wantsMotion = matchMedia('(prefers-reduced-motion: no-preference)');

  /** How long each step holds. Step two depicts a wait, so it is given one. */
  const HOLD = [4200, 5200, 4600, 5200, 4600, 5600];

  let index = 0;
  let timer = 0;
  let playing = wantsMotion.matches;

  function show(next) {
    index = (next + total) % total;

    slides.forEach((s, i) => s.classList.toggle('is-on', i === index));
    captions.forEach((c, i) => c.classList.toggle('is-on', i === index));
    pips.forEach((p, i) => {
      p.classList.toggle('is-on', i === index);
      p.setAttribute('aria-current', i === index ? 'step' : 'false');
    });

    // Announced through a live region rather than by moving focus: moving focus on a
    // timer would yank a keyboard user out of whatever they were reading.
    count.textContent = `Step ${index + 1} of ${total}`;
  }

  function stop() {
    clearTimeout(timer);
    timer = 0;
  }

  function schedule() {
    stop();
    if (!playing) return;
    timer = setTimeout(() => {
      show(index + 1);
      schedule();
    }, HOLD[index] ?? 4600);
  }

  function setPlaying(on) {
    playing = on;
    playBtn.textContent = on ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-pressed', String(on));
    if (on) schedule(); else stop();
  }

  /** Any manual move pauses: the reader has taken over, and a timer fighting them is rude. */
  const goTo = (next) => {
    setPlaying(false);
    show(next);
  };

  $('wt-prev').addEventListener('click', () => goTo(index - 1));
  $('wt-next').addEventListener('click', () => goTo(index + 1));
  playBtn.addEventListener('click', () => setPlaying(!playing));

  for (const [i, pip] of pips.entries()) {
    pip.setAttribute('aria-label', `Go to step ${i + 1}`);
    pip.addEventListener('click', () => goTo(i));
  }

  // Arrow keys, once the walkthrough has been touched. Bound to the controls rather than
  // the document so they do not steal arrow keys from the rest of the page.
  for (const el of [playBtn, $('wt-prev'), $('wt-next'), ...pips]) {
    el.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(index - 1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); goTo(index + 1); }
    });
  }

  // A timer running against a tab nobody is looking at is spent battery and, on return,
  // a walkthrough that has silently played itself out.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else schedule();
  });

  wantsMotion.addEventListener('change', (event) => setPlaying(event.matches));

  show(0);
  setPlaying(playing);
}
