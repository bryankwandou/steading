/**
 * The setup page.
 *
 * This page exists because the hosted build cannot do the one thing the app is for:
 * every platform Steading supports blocks datacenter addresses, so a download run from
 * a server fails no matter how it is written. Run from someone's own machine it works
 * fine. So the job here is not to demonstrate the app -- it is to get the reader from
 * "a link someone sent me" to "it is running on my computer" without them having to
 * type anything or read a README.
 *
 * Hence: guess their system, show one line, give them a copy button.
 */

import {
  LANGUAGES, t, setLanguage, detectLanguage, getLanguage, onLanguageChange, applyStatic,
} from './i18n.js';
import { initTheme, toggleTheme, resolvedTheme, onThemeChange } from './theme.js';

const $ = (id) => document.getElementById(id);

const el = {
  lang: $('lang'),
  theme: $('theme'),
  tabs: $('os-tabs'),
  cmdText: $('cmd-text'),
  cmdNote: $('cmd-note'),
  copy: $('copy'),
  step2: $('step2-text'),
  sourceLink: $('source-link'),
};

/**
 * One line per system. The shell each one names is what step 2 tells the reader to
 * open, so the two must stay in step -- hence they live together here rather than in
 * the dictionary.
 */
const RECIPES = {
  windows: {
    command: 'powershell -c "irm https://getsteading.vercel.app/install.ps1 | iex"',
    shell: 'PowerShell',
    source: '/install.ps1',
    noteKey: 'setup.noteWindows',
  },
  mac: {
    command: 'curl -fsSL https://getsteading.vercel.app/install.sh | sh',
    shell: 'Terminal',
    source: '/install.sh',
    noteKey: 'setup.noteMac',
  },
  linux: {
    command: 'curl -fsSL https://getsteading.vercel.app/install.sh | sh',
    shell: 'Terminal',
    source: '/install.sh',
    noteKey: 'setup.noteLinux',
  },
  android: {
    command: 'curl -fsSL https://getsteading.vercel.app/install.sh | sh',
    shell: 'Termux',
    source: '/install.sh',
    noteKey: 'setup.noteAndroid',
  },
};

let current = 'windows';

/** A guess, not a verdict -- the tabs are right there if it picks wrong. */
function detectOs() {
  const ua = navigator.userAgent;
  const platform = navigator.userAgentData?.platform || navigator.platform || '';

  // Android first, and by more than the word alone. A tablet with "desktop site" on drops
  // "Android" from its user agent while keeping "Linux", which sent an Android reader to
  // the apt/dnf/pacman tab and a terminal command they have no terminal for. X11 is what a
  // real desktop Linux session says and no Android build does.
  const touch = (navigator.maxTouchPoints || 0) > 0;
  if (/Android/i.test(ua)) return 'android';
  if (touch && /Linux/i.test(platform + ua) && !/X11|CrOS/i.test(platform + ua)) return 'android';
  // iOS cannot run this at all; macOS is the closest useful thing to offer.
  if (/Mac|iPhone|iPad|iPod/i.test(platform + ua)) return 'mac';
  if (/Win/i.test(platform) || /Windows/i.test(ua)) return 'windows';
  if (/Linux|X11|CrOS/i.test(platform + ua)) return 'linux';
  return 'windows';
}

function paintOs() {
  const recipe = RECIPES[current];

  el.cmdText.textContent = recipe.command;
  el.cmdNote.textContent = t(recipe.noteKey);
  el.step2.textContent = t('setup.step2', { shell: recipe.shell });
  el.sourceLink.href = recipe.source;

  for (const tab of el.tabs.querySelectorAll('.os-tab')) {
    const on = tab.dataset.os === current;
    tab.classList.toggle('is-on', on);
    tab.setAttribute('aria-selected', String(on));
  }
}

el.tabs.addEventListener('click', (event) => {
  const tab = event.target.closest('.os-tab');
  if (!tab) return;
  current = tab.dataset.os;
  paintOs();
});

/* ------------------------------------------------------------------ copying */

let copyResetTimer = null;

el.copy.addEventListener('click', async () => {
  const text = RECIPES[current].command;
  let ok = false;

  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    // Clipboard API needs a secure context and permission; neither is guaranteed.
    // Selecting the text at least leaves the reader one keystroke away.
    const range = document.createRange();
    range.selectNodeContents(el.cmdText);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    try { ok = document.execCommand('copy'); } catch { ok = false; }
  }

  el.copy.textContent = t(ok ? 'setup.copied' : 'setup.copyFailed');
  el.copy.classList.toggle('is-done', ok);

  clearTimeout(copyResetTimer);
  copyResetTimer = setTimeout(() => {
    el.copy.textContent = t('setup.copy');
    el.copy.classList.remove('is-done');
  }, 2200);
});

/* ------------------------------------------------------- theme and language */

function paintThemeLabel() {
  const next = resolvedTheme() === 'dark' ? 'nav.themeToLight' : 'nav.themeToDark';
  el.theme.setAttribute('aria-label', t(next));
  el.theme.setAttribute('title', t(next));
}

el.theme.addEventListener('click', toggleTheme);
onThemeChange(paintThemeLabel);

function buildLanguageMenu() {
  el.lang.replaceChildren(...LANGUAGES.map(({ code, name }) => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = name;
    return option;
  }));
  el.lang.value = getLanguage();
}

el.lang.addEventListener('change', () => setLanguage(el.lang.value));

onLanguageChange(() => {
  applyStatic();
  paintThemeLabel();
  paintOs();
  el.lang.value = getLanguage();
  document.title = 'Steading';
});

/* -------------------------------------------------------------------- boot */

async function boot() {
  initTheme();
  buildLanguageMenu();
  current = detectOs();
  await setLanguage(detectLanguage());
  applyStatic();
  paintThemeLabel();
  paintOs();
}

boot();
