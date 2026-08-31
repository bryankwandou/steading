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
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse

MAX_BODY = 8 * 1024

PLATFORMS = [
    ("youtube", "YouTube", ["youtube.com", "youtu.be", "music.youtube.com", "m.youtube.com"]),
    ("tiktok", "TikTok", ["tiktok.com", "vm.tiktok.com", "vt.tiktok.com"]),
    ("instagram", "Instagram", ["instagram.com", "instagr.am", "ddinstagram.com"]),
    ("facebook", "Facebook", ["facebook.com", "fb.watch", "fb.com", "m.facebook.com"]),
]


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
        return None, "url_unsupported_site", None

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
