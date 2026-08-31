/**
 * Check that the session is actually answering before sending anyone to it.
 *
 * A meta refresh alone sends the visitor into a browser connection error the moment the
 * presenter's laptop sleeps, loses its network, or is closed without shutting the
 * session down properly -- and a Chrome error page in front of a room reads as "this
 * product is broken" rather than "that machine went to sleep".
 *
 * The probe is `no-cors`, so the response is opaque and nothing can be read from it.
 * All it establishes is that something answered, which is the only question here.
 */

const target = document.body.dataset.target || '';
const waiting = document.getElementById('waiting');
const dead = document.getElementById('dead');
const link = document.getElementById('go');

async function reachable(url) {
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(6000) });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!target) {
    // No session was ever published into this page.
    waiting.hidden = true;
    dead.hidden = false;
    return;
  }

  if (link) link.href = target;

  if (await reachable(target)) {
    location.replace(target);
    return;
  }

  // Answered nothing. Say so plainly rather than handing over a broken redirect.
  waiting.hidden = true;
  dead.hidden = false;
}

main();
