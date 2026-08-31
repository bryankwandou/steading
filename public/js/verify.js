/**
 * The verification page.
 *
 * Both language versions are in the document already; this only decides which one is
 * shown, and keeps the theme toggle working. No dictionaries, no fetching -- a page
 * whose job is to be checkable should not depend on anything loading successfully.
 */

import { initTheme, toggleTheme, resolvedTheme, onThemeChange } from './theme.js';

const buttons = [...document.querySelectorAll('.v-lang')];
const panels = [...document.querySelectorAll('[data-lang]')];

function show(code) {
  for (const panel of panels) panel.hidden = panel.dataset.lang !== code;
  for (const button of buttons) button.classList.toggle('is-on', button.dataset.show === code);
  document.documentElement.lang = code;
  try {
    localStorage.setItem('steading.verify.lang', code);
  } catch { /* private browsing; the choice simply will not persist */ }
}

for (const button of buttons) {
  button.addEventListener('click', () => show(button.dataset.show));
}

const themeBtn = document.getElementById('theme');
themeBtn.addEventListener('click', toggleTheme);
onThemeChange(() => {
  themeBtn.setAttribute('title', resolvedTheme() === 'dark' ? 'Light' : 'Dark');
});

initTheme();

// A remembered choice wins. Otherwise Indonesian, because that is who this page was
// written for, unless the browser asks for something else -- in which case English is
// the closer of the two on offer.
let stored = null;
try {
  stored = localStorage.getItem('steading.verify.lang');
} catch { /* private browsing */ }

const preferred = navigator.language?.toLowerCase().startsWith('id') ? 'id' : 'en';
show(stored === 'id' || stored === 'en' ? stored : preferred);
