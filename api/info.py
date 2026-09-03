"""
Live metadata lookup.

This is the real thing: it runs yt-dlp on the server and contacts the source site. It
exists so the "live" toggle is not theatre -- if it works, it genuinely worked.

Expect it to fail often. Serverless functions call out from datacenter addresses, and
the platforms this app supports block those aggressively; a 403 here is the normal
outcome, not a bug. The failure is mapped to the same error codes the local build uses,
so the UI explains it in the user's language instead of showing a stack trace.

Only metadata is offered. A real download is not implemented here on purpose: merging
video and audio needs ffmpeg and a writable, seekable filesystem, and a 25 MB transfer
does not fit in the execution limit. Pretending otherwise would fail at the worst
moment. The local build does that job.
"""

import json
import re
import urllib.request
import urllib.error
import urllib.parse
import socket
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse

MAX_BODY = 8 * 1024

PLATFORMS = [
    ("youtube", "YouTube", ["youtube.com", "youtu.be"]),
    ("tiktok", "TikTok", ["tiktok.com", "vm.tiktok.com", "vt.tiktok.com"]),
    ("instagram", "Instagram", ["instagram.com", "instagr.am", "ddinstagram.com"]),
    ("facebook", "Facebook", ["facebook.com", "fb.watch", "fb.com"]),
    ("twitch", "Twitch", ["twitch.tv"]),
    ("vimeo", "Vimeo", ["vimeo.com"]),
    ("dailymotion", "Dailymotion", ["dailymotion.com", "dai.ly"]),
    ("reddit", "Reddit", ["reddit.com", "redd.it"]),
    ("pinterest", "Pinterest", ["pinterest.com", "pin.it"]),
    ("snapchat", "Snapchat", ["snapchat.com"]),
    ("bluesky", "Bluesky", ["bsky.app"]),
    ("tumblr", "Tumblr", ["tumblr.com"]),
    ("telegram", "Telegram", ["t.me", "telegram.me"]),
    ("vk", "VK", ["vk.com", "vkvideo.ru"]),
    ("weibo", "Weibo", ["weibo.com", "weibo.cn"]),
    ("xiaohongshu", "Xiaohongshu", ["xiaohongshu.com", "xhslink.com"]),
    ("bilibili", "Bilibili", ["bilibili.com", "b23.tv"]),
    ("kick", "Kick", ["kick.com"]),
    ("odysee", "Odysee", ["odysee.com", "lbry.tv"]),
    ("rumble", "Rumble", ["rumble.com"]),
    ("soundcloud", "SoundCloud", ["soundcloud.com", "snd.sc"]),
    ("bandcamp", "Bandcamp", ["bandcamp.com"]),
    ("mixcloud", "Mixcloud", ["mixcloud.com"]),
]

def _is_private_host(hostname: str) -> bool:
    """Is this hostname on the server's own network rather than out on the web?

    Mirrors isPrivateHost() in the two JavaScript validators. Only consulted for hosts
    that are not on the list, so the catalogued sites are unaffected.
    """
    host = hostname.lower().rstrip(".").strip("[]")

    if host == "localhost" or host.endswith(".localhost"):
        return True
    if re.search(r"\.(local|internal|intranet|localdomain|home|lan|corp|private)$", host):
        return True
    if "." not in host and ":" not in host:
        return True

    if host in ("::1", "::"):
        return True
    if re.match(r"^f[cd][0-9a-f]{2}:", host):
        return True
    if re.match(r"^fe[89ab][0-9a-f]:", host):
        return True
    mapped = re.match(r"^::ffff:(\d+\.\d+\.\d+\.\d+)$", host)
    if mapped:
        return _is_private_host(mapped.group(1))

    v4 = re.match(r"^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$", host)
    if not v4:
        return False

    parts = [int(x) for x in v4.groups()]
    if any(n > 255 for n in parts):
        return True

    a, b = parts[0], parts[1]
    if a in (0, 127):
        return True
    if a == 10:
        return True
    if a == 172 and 16 <= b <= 31:
        return True
    if a == 192 and b == 168:
        return True
    if a == 169 and b == 254:
        return True
    if a == 100 and 64 <= b <= 127:
        return True
    if a >= 224:
        return True

    return False


def _resolves_privately(hostname: str) -> bool:
    """Does this name actually point onto a private network?

    _is_private_host() reads the hostname as typed, so it stops "192.168.1.1" and misses
    "192.168.1.1.nip.io" -- an ordinary public name whose DNS answers with that same
    address. Mirrors resolve-guard.js in the local build, including its limits: redirects
    are not followed, and whatever fetches the URL resolves the name again for itself, so
    this raises the cost of the attack rather than removing it.

    A name that will not resolve is treated as private: an address that does not answer
    is not one worth starting work for.
    """
    if re.match(r"^\d{1,3}(\.\d{1,3}){3}$", hostname) or ":" in hostname:
        return _is_private_host(hostname)

    try:
        infos = socket.getaddrinfo(hostname, None)
    except OSError:
        return True

    if not infos:
        return True

    return any(_is_private_host(info[4][0]) for info in infos)


_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0 Safari/537.36"
)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Hand the 3xx back instead of following it, so each hop can be judged."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def _redirects_inward(start_url: str, max_hops: int = 5, timeout: float = 6.0) -> bool:
    """Does following this link land on a private address?

    _resolves_privately() settles where the typed name points; it says nothing about
    where that name forwards to. A public host can answer 302 with a private Location,
    and whatever fetches the URL follows redirects.

    Advisory, and deliberately so. The downloader makes its own requests and follows its
    own redirects; a server that answers differently the second time still wins. What
    this removes is the plain case.

    A pre-flight that cannot complete does not refuse the download: plenty of ordinary
    sites reject HEAD, rate-limit, or time out, and failing all of those would cost far
    more than it buys. The typed hostname has already been checked by then.
    """
    current = start_url

    for _ in range(max_hops):
        try:
            req = urllib.request.Request(
                current,
                method="HEAD",
                headers={"User-Agent": _BROWSER_UA},
            )
            opener = urllib.request.build_opener(_NoRedirect)
            res = opener.open(req, timeout=timeout)
            res.close()
            return False  # no redirect at all
        except urllib.error.HTTPError as e:
            if e.code < 300 or e.code >= 400:
                return False
            location = e.headers.get("Location")
            if not location:
                return False
        except Exception:
            return False  # could not look; the typed host was already checked

        nxt = urllib.parse.urlparse(urllib.parse.urljoin(current, location))
        if nxt.scheme not in ("http", "https"):
            return True
        if not nxt.hostname:
            return True
        if _is_private_host(nxt.hostname) or _resolves_privately(nxt.hostname):
            return True

        current = nxt.geturl()

    return False







# Sites people reasonably expect to work, which cannot: they assemble their posts in the
# browser and gate most of them behind a login, so a plain HTTP client is handed nothing.
# Mirrors LOCKED in the browser validator and in the local build. Recognising a site is
# not supporting it -- nothing here is ever fetched.
LOCKED = [
    ("Threads", ["threads.net", "threads.com"]),
    ("X", ["x.com", "twitter.com"]),
]


def match_locked(hostname):
    host = (hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    for label, hosts in LOCKED:
        for h in hosts:
            if host == h or host.endswith("." + h):
                return label
    return None


def match_platform(hostname):
    host = (hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    for pid, label, hosts in PLATFORMS:
        for h in hosts:
            if host == h or host.endswith("." + h):
                return pid, label
    return None, None


def validate_url(raw):
    """Mirrors server/lib/validate.js. Returns (url, platform, label) or (None, code, None)."""
    if not isinstance(raw, str):
        return None, "url_not_text", None
    raw = raw.strip()
    if not raw:
        return None, "url_empty", None
    if len(raw) > 2048:
        return None, "url_too_long", None
    if any(ord(c) < 32 or ord(c) == 127 for c in raw):
        return None, "url_bad_chars", None

    # Matches the JS side: any "scheme:" prefix is left alone so the scheme check
    # below sees it. Using "://" here let "javascript:alert(1)" through to the
    # allowlist and reported the wrong reason.
    has_scheme = re.match(r"^[a-z][a-z0-9+.-]*:", raw, re.IGNORECASE)
    candidate = raw if has_scheme else "https://" + raw
    try:
        parsed = urlparse(candidate)
    except ValueError:
        return None, "url_malformed", None

    if parsed.scheme not in ("http", "https"):
        return None, "url_bad_scheme", None
    if not parsed.hostname:
        return None, "url_malformed", None

    pid, label = match_platform(parsed.hostname)
    if not pid:
        locked = match_locked(parsed.hostname)
        if locked:
            # Third slot carries the site name; it comes from the table above, never
            # from the request, so nothing user-supplied reaches the response.
            return None, "url_site_locked", locked

        # Universal mode: an unlisted host is accepted, but only once it is established
        # to be out on the public web. Same rule as both JavaScript validators.
        if _is_private_host(parsed.hostname) or _resolves_privately(parsed.hostname):
            return None, "url_unsupported_site", None
        # Where it points is settled; where it forwards to is not.
        if _redirects_inward(parsed.geturl()):
            return None, "url_unsupported_site", None
        pid, label = "other", parsed.hostname

    clean = parsed._replace(fragment="", netloc=parsed.netloc.split("@")[-1])
    return clean.geturl(), pid, label


def classify(message):
    """
    Same buckets as classifyError() in server/ytdlp.js, with one deliberate difference.

    The single most likely failure from a hosted address is YouTube's "Sign in to
    confirm you're not a bot". Locally that really does mean cookies are needed, and the
    local build maps it to private_content. Here it means the datacenter IP was
    challenged -- the video is public and the user's own machine would fetch it fine. So
    the bot-check and the 403 family are tested first and reported as live_blocked,
    whose wording says exactly that.
    """
    m = (message or "").lower()

    if any(k in m for k in (
        "not a bot", "confirm you", "captcha", "403", "forbidden",
        "blocked", "denied", "too many requests", "rate limit",
    )):
        return "live_blocked"
    if any(k in m for k in ("geo", "country", "region", "not available in")):
        return "geo_blocked"
    if any(k in m for k in ("sign in", "private", "login required", "cookies", "members-only", "age-restrict", "age restrict")):
        return "private_content"
    if any(k in m for k in ("unavailable", "removed", "deleted", "404", "not found")):
        return "content_gone"
    if any(k in m for k in ("timed out", "timeout", "network", "connection", "unreachable")):
        return "network"
    return "download_failed"


def normalize(raw, url, platform, label):
    heights = set()
    for f in raw.get("formats") or []:
        if f.get("vcodec") and f["vcodec"] != "none" and isinstance(f.get("height"), int):
            heights.add(f["height"])

    offered = [q for q in ("1080", "720", "480", "360") if any(h >= int(q) for h in heights)]
    thumb = raw.get("thumbnail")

    return {
        "title": (raw.get("title") or "").strip() or None,
        "uploader": raw.get("uploader") or raw.get("channel") or raw.get("uploader_id"),
        "duration": int(raw["duration"]) if isinstance(raw.get("duration"), (int, float)) else None,
        "thumbnail": thumb if isinstance(thumb, str) and thumb.startswith(("http://", "https://")) else None,
        "extractor": raw.get("extractor_key") or raw.get("extractor"),
        "isLive": bool(raw.get("is_live")),
        "qualities": ["best"] + offered,
        "url": url,
        "platform": platform,
        "platformLabel": label,
    }


class handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _fail(self, status, code, detail=None):
        self._send(status, {"code": code, "error": code, "detail": detail})

    def do_POST(self):
        try:
            length = int(self.headers.get("content-length") or 0)
        except ValueError:
            return self._fail(400, "bad_json")
        if length > MAX_BODY:
            return self._fail(413, "body_too_large")

        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, UnicodeDecodeError):
            return self._fail(400, "bad_json")

        url, platform, label = validate_url(body.get("url"))
        if url is None:
            # On failure the second slot is the code and the third is an optional detail.
            return self._fail(400, platform, label)

        try:
            from yt_dlp import YoutubeDL
        except ImportError:
            return self._fail(503, "no_binary")

        options = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "noplaylist": True,
            "socket_timeout": 12,
            "extract_flat": False,
        }

        try:
            with YoutubeDL(options) as ydl:
                raw = ydl.extract_info(url, download=False)
        except Exception as exc:  # noqa: BLE001 - any extractor failure becomes a code
            text = str(exc)
            return self._send(422, {
                "code": classify(text),
                "error": "extraction failed",
                # The raw line is genuinely useful when this is inspected, and the UI
                # only ever shows it under a translated heading.
                "detail": text[-300:],
            })

        if raw.get("is_live"):
            return self._fail(400, "is_live")

        return self._send(200, normalize(raw, url, platform, label))

    def do_GET(self):
        self._fail(405, "unknown_endpoint")
