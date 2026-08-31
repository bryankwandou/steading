"""Reports whether the live backend has yt-dlp available. No network calls."""

import json
from http.server import BaseHTTPRequestHandler


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            from yt_dlp import version as ytdlp_version
            ytdlp = getattr(ytdlp_version, "__version__", "unknown")
        except ImportError:
            ytdlp = None

        payload = {
            "ok": bool(ytdlp),
            "ytdlp": ytdlp,
            # No ffmpeg in this runtime, and none is needed: only metadata is served
            # here. Reported honestly so the UI does not imply merging is available.
            "ffmpeg": None,
            "activeJobs": 0,
            "downloads": False,
        }

        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)
