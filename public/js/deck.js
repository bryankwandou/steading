/**
 * Driving the presentation.
 *
 * Deliberately small. The deck is nine sections of real markup, so with this file blocked
 * a reader still gets the whole thing as one scrolling document -- which is also exactly
 * what the print stylesheet produces. The script only decides which one is showing.
 *
 * No auto-advance. A deck that moves on its own is a deck that leaves the room behind,
 * and this one is meant to be talked over.
 */

const slides = [...document.querySelectorAll('.slide')];
const count = document.getElementById('deck-count');

if (slides.length) {
  let index = 0;

  function show(next) {
    index = Math.max(0, Math.min(slides.length - 1, next));
    slides.forEach((s, i) => s.classList.toggle('is-on', i === index));
    // Announced through the live region rather than by moving focus, which would pull a
    // keyboard user out of wherever they were.
    count.textContent = `${index + 1} / ${slides.length}`;
    // The address bar carries the position, so a slide can be linked to and a reload
    // does not send the speaker back to the beginning.
    history.replaceState(null, '', `#${index + 1}`);
  }

  document.getElementById('deck-prev').addEventListener('click', () => show(index - 1));
  document.getElementById('deck-next').addEventListener('click', () => show(index + 1));

  document.addEventListener('keydown', (event) => {
    // Never steal a key from someone typing, and never fight a browser shortcut.
    if (event.target.closest('input, textarea, [contenteditable]')) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const back = ['ArrowLeft', 'ArrowUp', 'PageUp'];
    const on = ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'];

    if (back.includes(event.key)) { event.preventDefault(); show(index - 1); }
    else if (on.includes(event.key)) { event.preventDefault(); show(index + 1); }
    else if (event.key === 'Home') { event.preventDefault(); show(0); }
    else if (event.key === 'End') { event.preventDefault(); show(slides.length - 1); }
  });

  // Swipe, because this will be opened on a phone.
  let startX = 0;
  document.addEventListener('touchstart', (e) => { startX = e.changedTouches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 60) show(index + (dx < 0 ? 1 : -1));
  }, { passive: true });

  /** Read the slide number out of the address, defaulting to the first. */
  const fromHash = () => {
    const n = Number(location.hash.slice(1));
    return Number.isFinite(n) && n > 0 ? n - 1 : 0;
  };

  // A link to /deck#7 from a page that is already showing /deck#1 changes only the
  // fragment, so the browser does not reload and the script above never re-runs. Without
  // this the address bar would say 7 while slide 1 stayed on screen -- and every deep
  // link into the deck, including the ones in a written submission, would land on the
  // title. Found by trying exactly that.
  window.addEventListener('hashchange', () => show(fromHash()));

  show(fromHash());
}
