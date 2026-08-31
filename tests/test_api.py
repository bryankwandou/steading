"""
Tests for the Python function.

node --test cannot reach these, so they run separately:

    python tests/test_api.py

They cover the two pieces with real logic -- the URL allowlist and the error
classifier -- without importing yt-dlp or touching the network.
"""

import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

spec = importlib.util.spec_from_file_location("info", os.path.join(ROOT, "api", "info.py"))
info = importlib.util.module_from_spec(spec)
spec.loader.exec_module(info)

failures = []


def check(label, got, expected):
    if got != expected:
        failures.append(f"{label}: expected {expected!r}, got {got!r}")
        print("  FAIL", label, "->", got)
    else:
        print("  ok  ", label, "->", got)


print("\nvalidate_url")
URL_CASES = [
    ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"),
    ("https://youtu.be/abc", "youtube"),
    ("https://music.youtube.com/watch?v=abc", "youtube"),
    ("youtube.com/watch?v=abc", "youtube"),
    ("https://m.youtube.com/watch?v=abc", "youtube"),
    ("https://vt.tiktok.com/ZSabc/", "tiktok"),
    ("https://www.tiktok.com/@u/video/1", "tiktok"),
    ("https://www.instagram.com/reel/Cabc/", "instagram"),
    ("https://fb.watch/abc/", "facebook"),
    ("https://m.facebook.com/watch/?v=1", "facebook"),
    # Rejections
    ("https://notyoutube.com/x", "url_unsupported_site"),
    ("https://youtube.com.evil.test/x", "url_unsupported_site"),
    ("https://evil.example.com/x", "url_unsupported_site"),
    # Recognised but impossible, and reported as such rather than as a generic refusal.
    ("https://www.threads.com/share/BCJiKr3SJq/", "url_site_locked"),
    ("https://threads.net/@a/post/b", "url_site_locked"),
    ("https://x.com/a/status/1", "url_site_locked"),
    ("https://twitter.com/a/status/1", "url_site_locked"),
    ("ftp://youtube.com/x", "url_bad_scheme"),
    ("javascript:alert(1)", "url_bad_scheme"),
    ("", "url_empty"),
    ("   ", "url_empty"),
    ("https://youtube.com/" + "a" * 2100, "url_too_long"),
    ("https://youtube.com/\x00evil", "url_bad_chars"),
]
for raw, expected in URL_CASES:
    _url, second, _label = info.validate_url(raw)
    check(repr(raw)[:46], second, expected)

print("\nthe locked-site rejection names the site")
for raw, want in [("https://threads.com/x", "Threads"), ("https://x.com/y", "X")]:
    _u, _c, label = info.validate_url(raw)
    check(raw, label, want)

print("\nsubdomains of allowed hosts are accepted")
_u, pid, _l = info.validate_url("https://www.m.youtube.com/watch?v=abc")
check("www.m.youtube.com", pid, "youtube")

print("\ncredentials and fragments are stripped")
url, _p, _l = info.validate_url("https://user:pass@youtube.com/watch?v=abc#frag")
check("no credentials", "user" in (url or ""), False)
check("no fragment", "#frag" in (url or ""), False)

print("\nclassify")
CLASSIFY_CASES = [
    # The hosted build's most likely failure. It must NOT read as "private content".
    ("Sign in to confirm you're not a bot", "live_blocked"),
    ("HTTP Error 403: Forbidden", "live_blocked"),
    ("Too Many Requests", "live_blocked"),
    ("This video is private", "private_content"),
    ("Join this channel to get access to members-only content", "private_content"),
    ("Video unavailable", "content_gone"),
    ("This video has been removed", "content_gone"),
    ("The uploader has not made this video available in your country", "geo_blocked"),
    ("socket timed out", "network"),
    ("Unable to download webpage: <urlopen error timed out>", "network"),
    ("something nobody predicted", "download_failed"),
]
for text, expected in CLASSIFY_CASES:
    check(text[:44], info.classify(text), expected)

print()
if failures:
    print(f"{len(failures)} failure(s):")
    for f in failures:
        print("  -", f)
    sys.exit(1)

total = len(URL_CASES) + len(CLASSIFY_CASES) + 5
print(f"all {total} checks passed")
