"""
A post's pictures, bound into one PDF -- on the server, for someone who has no computer.

This is the half of the product that genuinely can run here, and the reason is worth
stating because the other half genuinely cannot.

A video download needs ffmpeg to merge a video stream with an audio one, needs a
writable seekable filesystem to do it in, and moves tens of megabytes. None of those
three things exists in a serverless function. That is why api/info.py offers metadata
only, and it was right to.

Pictures need none of them. There is no merging, no transcoding, and a post of fourteen
photos becomes a PDF of a few hundred kilobytes. It fits inside the execution limit and
inside the response limit with room to spare. So the one thing a creator with nothing but
a phone most often wants -- a carousel saved as a single file they can open, keep, and
send -- works with nothing installed at all.

Two limits are real and are enforced rather than hoped about:

- The response cap. Serverless replies are capped a few megabytes up, so MAX_PAGES and
  MAX_TOTAL_BYTES stop a photo board from producing a reply that is silently truncated
  into a corrupt PDF. Hitting the cap ends the PDF early and says so in a header rather
  than failing.
- The clock. Every fetch is bounded and the whole run stops collecting once the budget
  is spent, because a function killed mid-write returns nothing at all, and a shorter
  PDF is worth more than a dead request.

Nothing here needs a third-party package. The PDF is assembled by hand and JPEG bytes
are embedded verbatim through DCTDecode, so no pixel is decoded and no library has to be
installed, audited, or kept up to date.
"""

import hashlib
import io
import zipfile
import json
import re
import socket
import struct
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib
from http.server import BaseHTTPRequestHandler

MAX_BODY = 8 * 1024

# Response and time budgets. Deliberately conservative: the failure mode of guessing
# high is a truncated reply, which reads to the user as a broken file.
MAX_PAGES = 40
MAX_TOTAL_BYTES = 3 * 1024 * 1024
TIME_BUDGET_S = 45.0

MAX_IMAGE_BYTES = 8 * 1024 * 1024
MIN_IMAGE_BYTES = 3 * 1024
MAX_HTML_BYTES = 4 * 1024 * 1024

UA = "Mozilla/5.0 (compatible; Steading/1.0; +https://steading.vercel.app)"

# Names that are almost never the picture anyone wanted: interface furniture, avatars,
# tracking pixels. Occasionally wrong, and that is the right trade -- a PDF padded with
# eleven copies of a site's logo is worse than one that missed a photo.
JUNK = re.compile(
    r"(sprite|icon|favicon|logo|avatar|badge|emoji|spacer|pixel|1x1|blank"
    r"|placeholder|loading|thumb_?small|profile_?pic)",
    re.I,
)


# --------------------------------------------------------------------- safety


def _is_private(ip):
    """Addresses this function must never be talked into fetching.

    Every URL reaching this file was written by whoever controls the page it came from.
    Resolving the name and checking the address is what stops a hostile page naming an
    internal address and having the platform fetch it back as a "photo". Resolved rather
    than pattern-matched, because a public-looking hostname is free to have an A record
    pointing anywhere it likes.
    """
    try:
        packed = socket.inet_pton(socket.AF_INET, ip)
    except OSError:
        try:
            packed6 = socket.inet_pton(socket.AF_INET6, ip)
        except OSError:
            return True  # unparseable is not a risk worth taking
        low = ip.lower()
        if low in ("::1", "::"):
            return True
        if low.startswith(("fe80", "fc", "fd")):
            return True
        mapped = re.match(r"^::ffff:(\d+\.\d+\.\d+\.\d+)$", low)
        return _is_private(mapped.group(1)) if mapped else False

    a, b = packed[0], packed[1]
    if a in (0, 10, 127):
        return True
    if a == 169 and b == 254:  # link-local, and cloud metadata
        return True
    if a == 172 and 16 <= b <= 31:
        return True
    if a == 192 and b == 168:
        return True
    if a == 100 and 64 <= b <= 127:  # carrier-grade NAT
        return True
    return a >= 224  # multicast and reserved


def _fetchable(url):
    """True when this URL is safe for the server to request."""
    try:
        parsed = urllib.parse.urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False
    try:
        infos = socket.getaddrinfo(parsed.hostname, None)
    except OSError:
        return False
    # Every address the name resolves to has to pass, not just the first: a hostile name
    # can return one public address and one loopback and hope for a lucky pick.
    return bool(infos) and all(not _is_private(i[4][0]) for i in infos)


def _get(url, timeout, accept, cap):
    """One bounded GET. Returns (bytes, content_type) or (None, None)."""
    if not _fetchable(url):
        return None, None
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            ctype = (res.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            declared = res.headers.get("Content-Length")
            if declared and declared.isdigit() and int(declared) > cap:
                return None, None
            # read one byte past the cap so an oversized body is detected rather than
            # silently truncated into something that will not parse.
            body = res.read(cap + 1)
            if len(body) > cap:
                return None, None
            return body, ctype
    except (urllib.error.URLError, urllib.error.HTTPError, socket.timeout, OSError, ValueError):
        return None, None


# -------------------------------------------------------------------- finding


def _attr(tag, name):
    m = re.search(name + r"""\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))""", tag, re.I)
    if not m:
        return None
    return (m.group(2) or m.group(3) or m.group(4) or "").strip()


def _from_meta(html):
    out = []
    for tag in re.findall(r"<meta\b[^>]*>", html, re.I):
        key = (_attr(tag, "property") or _attr(tag, "name") or "").lower()
        if key not in ("og:image", "og:image:url", "og:image:secure_url", "twitter:image"):
            continue
        content = _attr(tag, "content")
        if content:
            out.append(content)
    return out


def _from_jsonld(html):
    """JSON-LD image fields.

    The shape is wildly inconsistent in the wild -- a string, a list of strings, an
    object with a url, a list of those -- so this walks whatever it finds rather than
    assuming one of them.
    """
    out = []
    for block in re.findall(
        r"""<script\b[^>]*type\s*=\s*["']application/ld\+json["'][^>]*>(.*?)</script>""",
        html, re.I | re.S,
    ):
        try:
            data = json.loads(block)
        except (ValueError, TypeError):
            continue  # malformed JSON-LD is extremely common and not our problem

        stack = [(data, 0)]
        while stack:
            node, depth = stack.pop()
            if depth > 6:
                continue
            if isinstance(node, list):
                stack.extend((n, depth + 1) for n in node)
            elif isinstance(node, dict):
                for key, value in node.items():
                    if key in ("image", "contentUrl", "thumbnailUrl"):
                        pending = [value]
                        while pending:
                            v = pending.pop()
                            if isinstance(v, str):
                                out.append(v)
                            elif isinstance(v, list):
                                pending.extend(v)
                            elif isinstance(v, dict) and isinstance(v.get("url"), str):
                                out.append(v["url"])
                    else:
                        stack.append((value, depth + 1))
    return out


def _largest_in_srcset(srcset):
    """The biggest candidate a srcset offers, by its own descriptors.

    Reading the last entry was the previous approach and it is not sound: the
    specification does not require the list to be ordered, and pages that list the
    smallest last handed back a thumbnail every time. The descriptors are the only
    statement of size the attribute actually makes, so they are what gets compared --
    "1600w" against "400w", or "3x" against "1x", with an entry carrying neither treated
    as the smallest thing on offer.
    """
    best, best_weight = None, -1.0
    for part in srcset.split(","):
        bits = part.strip().split()
        if not bits:
            continue
        url = bits[0]
        weight = 0.0
        for token in bits[1:]:
            match = re.match(r"^(\d+(?:\.\d+)?)([wx])$", token)
            if match:
                value = float(match.group(1))
                # A density is a multiplier rather than a width, so it is scaled into the
                # same range instead of being compared against pixel counts directly.
                weight = value if match.group(2) == "w" else value * 1000.0
        if weight > best_weight:
            best, best_weight = url, weight
    return best


# Address shapes that name a resized copy, paired with what the full-size copy is called.
# Only rules where the mapping is unambiguous: a wrong guess here fetches a 404 and loses
# a picture that would otherwise have arrived, so a thumbnail is worth more than a
# hopeful rewrite. Both forms are kept and tried in order, never swapped blindly.
_UPGRADES = (
    (re.compile(r"/thumb/(.+)/\d+px-[^/]+$"), r"/\1"),          # MediaWiki thumbnails
    (re.compile(r"(_)(?:thumb|small|tn|s)(\.(?:jpe?g|png|webp))$", re.I), r"\2"),
    (re.compile(r"([?&])(?:w|width|h|height|size|resize)=\d+", re.I), r"\1"),
)


def _upgrade(url):
    """A larger form of this address, when one is named unambiguously, else None."""
    for pattern, replacement in _UPGRADES:
        upgraded = pattern.sub(replacement, url)
        if upgraded != url:
            # Removing a query parameter leaves the separators behind it dangling, so
            # "?w=200&x=1" becomes "?&x=1" without this.
            upgraded = re.sub(r"[?&]{2,}", "?", upgraded).replace("?&", "?")
            return upgraded.rstrip("?&")
    return None


def _from_img(html):
    """Picture addresses from the markup, preferring the largest copy each tag offers."""
    out = []
    for tag in re.findall(r"<img\b[^>]*>", html, re.I):
        candidates = []

        srcset = _attr(tag, "srcset") or _attr(tag, "data-srcset")
        if srcset:
            largest = _largest_in_srcset(srcset)
            if largest:
                candidates.append(largest)

        # A lazy-loading page leaves the real address in a data- attribute and a
        # placeholder in src, so those outrank src itself.
        for name in ("data-full", "data-large", "data-original", "data-src", "src"):
            value = _attr(tag, name)
            if value:
                candidates.append(value)

        for candidate in candidates:
            # The upgraded form goes first and the original stays behind it, so a rewrite
            # that turns out to be wrong costs an extra request rather than the picture.
            bigger = _upgrade(candidate)
            if bigger:
                out.append(bigger)
            out.append(candidate)
            break

    return out


# ------------------------------------------------------------------- oembed

# Sites whose oEmbed endpoint has to be known in advance because their pages do not
# advertise one. Kept deliberately short: the discovery path below covers everything that
# follows the standard, and a hard-coded table is a maintenance debt that grows quietly.
OEMBED_ENDPOINTS = (
    (re.compile(r"^https?://(www\.)?instagram\.com/(p|reel|tv)/", re.I),
     "https://www.instagram.com/api/v1/oembed/?url="),
    (re.compile(r"^https?://(www\.)?(twitter|x)\.com/\w+/status/", re.I),
     "https://publish.twitter.com/oembed?url="),
    (re.compile(r"^https?://(www\.)?flickr\.com/photos/", re.I),
     "https://www.flickr.com/services/oembed/?format=json&url="),
    (re.compile(r"^https?://(www\.)?(tiktok)\.com/@", re.I),
     "https://www.tiktok.com/oembed?url="),
)


def _oembed_endpoint(page_url, html):
    """Where this page's oEmbed document lives, or None.

    Discovery first, because it is the standard and needs no list kept up to date: a page
    that follows the spec names its own endpoint in a <link> tag, and one implementation
    then covers every site that does so. The table above is only for the handful of large
    sites that do not.
    """
    if html:
        for tag in re.findall(r"<link\b[^>]*>", html, re.I):
            rel = (_attr(tag, "rel") or "").lower()
            typ = (_attr(tag, "type") or "").lower()
            if "alternate" in rel and "json+oembed" in typ:
                href = _attr(tag, "href")
                if href:
                    return urllib.parse.urljoin(page_url, href)

    for pattern, prefix in OEMBED_ENDPOINTS:
        if pattern.search(page_url):
            return prefix + urllib.parse.quote(page_url, safe="")
    return None


def oembed_pictures(page_url, html=None):
    """Pictures a page publishes through oEmbed.

    This is the link that reaches the places a scraper cannot. Instagram builds its post
    pages in the browser and serves an empty shell to anyone not signed in -- measured at
    616 KB containing no og:image, no .jpg address and a single <img> tag -- so reading
    the HTML finds genuinely nothing. The same post's oEmbed document is 9 KB of plain
    JSON with the caption, the author and a working image address in it.

    Honest about its limit: oEmbed returns the one representative picture, so a carousel
    of fourteen photos comes back as its cover. One picture is worth having; claiming it
    is the whole post would not be.
    """
    endpoint = _oembed_endpoint(page_url, html)
    if not endpoint:
        return []

    body, ctype = _get(endpoint, 15, "application/json", 512 * 1024)
    if not body:
        return []
    # Some endpoints answer with text/plain; the parse is the real check.
    try:
        data = json.loads(body.decode("utf-8", "replace"))
    except (ValueError, UnicodeDecodeError):
        return []

    out = []
    thumb = data.get("thumbnail_url")
    if isinstance(thumb, str) and thumb.startswith(("http://", "https://")):
        out.append(thumb)

    # A few providers put the picture only inside the embed markup they hand back.
    markup = data.get("html")
    if isinstance(markup, str):
        for tag in re.findall(r"<img\b[^>]*>", markup, re.I):
            src = _attr(tag, "src")
            if src and src.startswith(("http://", "https://")) and src not in out:
                out.append(src)

    return out


# The candidates oEmbed contributed on the last collect(). Kept so the handler can say
# where the pictures that survived came from, which is not the same question as where the
# candidates came from: Instagram offers 28 addresses from its own markup and every one
# of them fails, while the single usable picture comes from oEmbed. Reporting "page"
# there would be true of the candidates and false of the result.
_OEMBED_URLS = set()


def _picture_kind(data, ctype):
    """What this actually is, judged on its bytes rather than on what the server said.

    A content-type header is a claim; the magic number is the file. Sites mislabel
    pictures often enough that trusting the header would put a mislabelled thing straight
    into someone's download.
    """
    if data[:3] == b"\xff\xd8\xff":
        return "jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def images_to_zip(images, kinds, stem):
    """The pictures as they came off the wire, in one archive.

    Written with the standard library's zipfile, so this adds no dependency -- the same
    rule the rest of the project keeps.

    Stored rather than deflated: JPEG, PNG and WebP are already compressed, so deflating
    them would spend the function's time budget to save almost nothing.

    Numbered with a fixed width so the order the post used survives an alphabetical
    listing, which is what every file manager shows by default.
    """
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_STORED) as archive:
        width = max(2, len(str(len(images))))
        for index, (data, kind) in enumerate(zip(images, kinds), start=1):
            archive.writestr("%s-%0*d.%s" % (stem, width, index, kind), data)
    return buffer.getvalue()


def _source_of(kept_urls):
    """Where the pictures that survived actually came from.

    Judged on what was kept rather than on what was offered: Instagram supplies 28
    addresses from its own markup, every one of them fails, and the single usable picture
    comes from oEmbed. Reporting "page" there would be true of the candidates and false of
    the result.
    """
    from_oembed = sum(1 for u in kept_urls if u in _OEMBED_URLS)
    if not kept_urls:
        return "none"
    if from_oembed == len(kept_urls):
        return "oembed"
    return "mixed" if from_oembed else "page"


def collect(page_url, limit):
    """Candidate picture URLs from a page, in the order the page most likely meant."""
    # A page that cannot be read is not the end of the attempt. This used to return here,
    # which got the priority exactly backwards: a page the server is refused is precisely
    # the case oEmbed exists for, and Instagram refuses this fetch intermittently -- two
    # runs a minute apart, one returning a megabyte of HTML and the other nothing at all.
    # The early return meant the same link succeeded or failed at random.
    html = None
    html_bytes, ctype = _get(page_url, 20, "text/html,application/xhtml+xml", MAX_HTML_BYTES)
    if html_bytes and "html" in (ctype or ""):
        html = html_bytes.decode("utf-8", "replace")

    # Meta and JSON-LD are what the page nominated for itself; <img> is a guess, so it
    # goes last and only its non-junk entries count.
    candidates = []
    if html:
        candidates = _from_meta(html) + _from_jsonld(html) + [
            u for u in _from_img(html) if not JUNK.search(u)
        ]

    # oEmbed last, and always -- not only when the page yielded nothing.
    #
    # The first version of this ran oEmbed only if the page produced no candidates at
    # all, which never fired: Instagram's shell yields 28 addresses, every one of them
    # interface furniture that fails to fetch as a picture. A page can produce plenty of
    # candidates and still produce no pictures, so the extra source is appended rather
    # than held in reserve, and costs one request only when the ones above it fall away.
    from_oembed = oembed_pictures(page_url, html)
    candidates += from_oembed

    _OEMBED_URLS.clear()
    for u in from_oembed:
        try:
            _OEMBED_URLS.add(urllib.parse.urljoin(page_url, u))
        except ValueError:
            pass

    seen, out = set(), []
    for raw in candidates:
        if not raw or raw.startswith("data:"):
            continue
        try:
            resolved = urllib.parse.urljoin(page_url, raw)
        except ValueError:
            continue
        if resolved in seen:
            continue
        seen.add(resolved)
        out.append(resolved)
        if len(out) >= limit:
            break
    return out


# ------------------------------------------------------------------------ pdf


def _jpeg_size(buf):
    """Pixel dimensions from a JPEG's SOF marker, without decoding a pixel."""
    i = 2
    n = len(buf)
    while i + 9 < n:
        if buf[i] != 0xFF:
            i += 1
            continue
        marker = buf[i + 1]
        # SOF0..SOF15, excluding the four that are not frame headers.
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
            height, width = struct.unpack(">HH", buf[i + 5:i + 9])
            return width, height
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        seg = struct.unpack(">H", buf[i + 2:i + 4])[0]
        i += 2 + seg
    return None


def images_to_pdf(images):
    """One page per picture, each page the size of its picture.

    Pages are sized to the image rather than to A4 so a portrait photo is not given
    letterbox margins it never had. JPEG bytes go in verbatim through DCTDecode, so
    nothing is decoded and nothing is re-encoded: the picture in the PDF is bit for bit
    the picture that came off the site.
    """
    objects = [b""]  # object numbers are 1-based; index 0 is the free-list head

    def add(payload):
        objects.append(payload)
        return len(objects) - 1

    page_ids, kids = [], []
    for data in images:
        size = _jpeg_size(data)
        if not size:
            continue
        width, height = size

        img_id = add(
            b"<< /Type /XObject /Subtype /Image /Width " + str(width).encode()
            + b" /Height " + str(height).encode()
            + b" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "
            + str(len(data)).encode() + b" >>\nstream\n" + data + b"\nendstream"
        )
        content = (
            b"q " + str(width).encode() + b" 0 0 " + str(height).encode()
            + b" 0 0 cm /I0 Do Q"
        )
        content_id = add(
            b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n"
            + content + b"\nendstream"
        )
        page_id = add(None)  # reserved: the page needs the Pages id, which is not known yet
        page_ids.append((page_id, img_id, content_id, width, height))
        kids.append(page_id)

    if not page_ids:
        return None

    pages_id = add(
        b"<< /Type /Pages /Count " + str(len(kids)).encode() + b" /Kids ["
        + b" ".join(str(k).encode() + b" 0 R" for k in kids) + b"] >>"
    )

    for page_id, img_id, content_id, width, height in page_ids:
        objects[page_id] = (
            b"<< /Type /Page /Parent " + str(pages_id).encode()
            + b" 0 R /MediaBox [0 0 " + str(width).encode() + b" " + str(height).encode()
            + b"] /Resources << /XObject << /I0 " + str(img_id).encode()
            + b" 0 R >> >> /Contents " + str(content_id).encode() + b" 0 R >>"
        )

    catalog_id = add(b"<< /Type /Catalog /Pages " + str(pages_id).encode() + b" 0 R >>")

    out = bytearray(b"%PDF-1.4\n")
    offsets = [0] * len(objects)
    for num in range(1, len(objects)):
        offsets[num] = len(out)
        out += str(num).encode() + b" 0 obj\n" + objects[num] + b"\nendobj\n"

    start = len(out)
    out += b"xref\n0 " + str(len(objects)).encode() + b"\n0000000000 65535 f \n"
    for num in range(1, len(objects)):
        out += ("%010d 00000 n \n" % offsets[num]).encode()
    out += (
        b"trailer\n<< /Size " + str(len(objects)).encode()
        + b" /Root " + str(catalog_id).encode() + b" 0 R >>\nstartxref\n"
        + str(start).encode() + b"\n%%EOF\n"
    )
    return bytes(out)


# --------------------------------------------------------------------- handler


class handler(BaseHTTPRequestHandler):
    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        started = time.monotonic()
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            return self._json(400, {"code": "bad_request"})

        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            page_url = str(payload.get("url") or "").strip()
            want = str(payload.get("format") or "pdf").strip().lower()
        except (ValueError, UnicodeDecodeError):
            return self._json(400, {"code": "bad_request"})

        if want not in ("pdf", "zip", "files"):
            return self._json(400, {"code": "bad_request"})

        if not _fetchable(page_url):
            return self._json(400, {"code": "bad_url"})

        urls = collect(page_url, MAX_PAGES * 3)
        if not urls:
            return self._json(422, {"code": "no_image"})

        pages, kept_urls, kinds, total, truncated = [], [], [], 0, False
        # Identical pictures are dropped by their content, not by their address.
        # Upgrading a thumbnail address to its full-size form deliberately keeps the
        # original behind it, so the same photograph can arrive twice under two names --
        # which a reader counting what they got will read as the tool duplicating things.
        seen_digests = set()
        for url in urls:
            if len(pages) >= MAX_PAGES:
                truncated = True
                break
            # A function killed mid-write returns nothing at all, so the budget is
            # checked before each fetch rather than hoped about.
            if time.monotonic() - started > TIME_BUDGET_S:
                truncated = True
                break

            data, ctype = _get(url, 12, "image/*", MAX_IMAGE_BYTES)
            if not data or len(data) < MIN_IMAGE_BYTES:
                continue

            kind = _picture_kind(data, ctype)
            if not kind:
                continue
            # A PDF can only carry JPEG verbatim and there is no encoder here, so PNG and
            # WebP have to be dropped from that format. A zip carries the file as it came
            # off the wire, so those same pictures survive -- which is most of the reason
            # the zip is worth offering at all.
            if want == "pdf" and kind != "jpg":
                continue
            if total + len(data) > MAX_TOTAL_BYTES:
                truncated = True
                break

            digest = hashlib.sha256(data).digest()
            if digest in seen_digests:
                continue
            seen_digests.add(digest)

            pages.append(data)
            kept_urls.append(url)
            kinds.append(kind)
            total += len(data)

        if not pages:
            return self._json(422, {"code": "no_image"})

        name = (urllib.parse.urlparse(page_url).path.rstrip("/").split("/") or ["post"])[-1]
        name = re.sub(r"[^A-Za-z0-9._-]", "_", urllib.parse.unquote(name))[:60] or "post"

        # One picture at a time, for a reader who wants three of the fourteen rather than
        # a bundle of all of them. Returned as JSON with each picture inline, so the page
        # can offer a save button per row without asking the server for them a second
        # time -- and so nothing has to be unpacked from an archive by hand.
        #
        # Inline rather than by address because the addresses are on the origin site,
        # and handing those back would send the reader's browser to fetch from a server
        # this page exists to keep them away from.
        if want == "files":
            import base64
            files = []
            for index, (data, kind) in enumerate(zip(pages, kinds), start=1):
                mime = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}[kind]
                files.append({
                    "name": "%s-%0*d.%s" % (name, max(2, len(str(len(pages)))), index, kind),
                    "type": mime,
                    "bytes": len(data),
                    "data": "data:%s;base64,%s" % (mime, base64.b64encode(data).decode("ascii")),
                })
            return self._json(200, {
                "pictures": files,
                "truncated": truncated,
                "source": _source_of(kept_urls),
            })

        if want == "zip":
            body = images_to_zip(pages, kinds, name)
            ctype_out, ext = "application/zip", "zip"
        else:
            body = images_to_pdf(pages)
            ctype_out, ext = "application/pdf", "pdf"

        if not body:
            return self._json(422, {"code": "no_image"})

        self.send_response(200)
        self.send_header("Content-Type", ctype_out)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Content-Disposition", 'attachment; filename="%s.%s"' % (name, ext))
        self.send_header("Cache-Control", "no-store")
        # So the page can tell the reader what it actually got, rather than leaving them
        # to count the pages and wonder whether something went missing.
        self.send_header("X-Steading-Pages", str(len(pages)))
        self.send_header("X-Steading-Truncated", "1" if truncated else "0")
        # What is actually inside, so a reader choosing the zip is told it holds jpgs and
        # pngs rather than having to open it to find out.
        self.send_header("X-Steading-Kinds", ",".join(sorted(set(kinds))))
        # Judged on what survived, not on what was offered. "oembed" tells the page it
        # is holding the post's cover because the site published nothing else to a
        # reader who is not signed in -- a thin result with a reason, not a failure.
        from_oembed = sum(1 for u in kept_urls if u in _OEMBED_URLS)
        if not kept_urls:
            source = "none"
        elif from_oembed == len(kept_urls):
            source = "oembed"
        elif from_oembed:
            source = "mixed"
        else:
            source = "page"
        self.send_header("X-Steading-Source", source)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._json(405, {"code": "method_not_allowed"})
