# Steading — engineering notes

What runs where, which constraint applies to which format, and how every figure quoted
on the site was taken. This is the reference the landing page points at; the page states
the conclusions, this states the working.

Measurements below were taken on 3 September 2026 against the live deployment at
`https://steading.vercel.app`. Every one of them can be taken again with the command
shown beside it.

---

## 1. Two halves, two different machines

Steading is one product with two execution sites, and the split is not arbitrary.

| Format kind | Where it runs | Why there |
| --- | --- | --- |
| Photo → JPG, PNG, WebP, **PDF** | The hosted function, **or** your machine | No merging, no transcoding, a few hundred kilobytes |
| Video → MP4, MKV, WebM | Your machine only | Needs ffmpeg to merge streams, and tens of megabytes of transfer |
| Audio → MP3, M4A, Opus, WAV, FLAC | Your machine only | Same encoder requirement |

### 1.1 What a hosted function genuinely cannot do

A serverless function has no ffmpeg binary, no writable seekable filesystem, and a
response ceiling of a few megabytes. A video download needs all three: yt-dlp fetches the
video and audio streams separately for anything above 720p and hands them to ffmpeg to
mux, ffmpeg needs to seek while writing the container, and the result is routinely
25–200 MB.

That is a hard architectural limit, not a policy choice, and no amount of engineering
removes it from a platform that does not ship an encoder.

### 1.2 What it turns out it can do

The picture path needs none of those three. Nothing is muxed, nothing is re-encoded, and
a post of fourteen photos is a few hundred kilobytes. So `api/pictures.py` performs the
whole job server-side and returns a finished PDF.

**Measured, live:**

```bash
curl -s -D - -o out.pdf -X POST https://steading.vercel.app/api/pictures \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://en.wikipedia.org/wiki/Lighthouse"}'
```

| Reading | Value |
| --- | --- |
| HTTP status | `200 OK` |
| `X-Steading-Pages` | `18` |
| `X-Steading-Truncated` | `0` |
| Response size | 3,084,473 bytes |
| Wall time | ~8.4 s |
| `file out.pdf` | `PDF document, version 1.4, 18 page(s)` |

This matters most for the reader this project was built for: a creator with a phone and
no computer, who cannot install anything. They paste a link and get a file.

### 1.3 A correction worth recording

An earlier version of this project stated, on the front page, that *"the sites block
hosting providers by IP, so a server in a data centre gets refused."* That was too broad
and it was wrong.

`api/info.py` extracts real YouTube metadata from Vercel today — title, uploader,
duration, thumbnail, available heights — which it could not do if the address were
refused:

```bash
curl -s -X POST https://steading.vercel.app/api/info \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

The real constraint was never the IP address. It is ffmpeg, the filesystem, and the
transfer size, exactly as set out in 1.1. Believing the broader version of the claim cost
this project the picture feature for months.

---

## 2. How each figure on the site was taken

### 2.1 “1,752 sites reachable in universal mode”

Read from the installed yt-dlp at server startup, not written into the source:

```bash
yt-dlp --list-extractors | wc -l
```

`probeExtractorCount()` in `server/ytdlp.js` runs this once, caches it, and publishes it
at `/api/health`. It therefore moves when yt-dlp is updated. A number typed into the
source would be a claim with no expiry date; this one is a fact with a version attached.

### 2.2 “22 sites probed by hand”

Each candidate was tested against a live URL discovered by enumerating a channel or board
with `--flat-playlist`, rather than against a sample link that may have rotted.

Thirteen were confirmed working outright. Seven are listed as supported on the strength
of a working extractor where the sample URL had since been deleted. **Three were dropped
on evidence:**

| Dropped | Reason |
| --- | --- |
| Douyin | Requires cookies for anything but the front page |
| Rumble | Returned 403 to every probe attempted |
| Vidio | Manifest resolves, every m3u8 segment 404s |

The number is twenty-two rather than twenty-five because those three failed, and a list
that keeps a broken entry to look longer is worth less than a short list that is true.

### 2.3 “12 formats”

`FORMAT_TABLE` in `server/lib/validate.js`:

```
mp4, mkv, webm | mp3, m4a, opus, wav, flac | jpg, png, webp, pdf
```

`pdf` is the only entry carrying `multi: true`, which routes the job to a different
engine entirely — see §3.

### 2.4 “24 languages”

161 keys, present in every dictionary. The build refuses to write a dictionary that is
missing a key, so the count cannot silently drift.

### 2.5 “0 bytes sent to anyone else”

For the local application this is literal: the browser talks to `127.0.0.1`, and yt-dlp
talks to the source site. No third party is in the path.

For the hosted picture tool this is **not** literal, and the site does not claim it is:
the link you paste is sent to the Steading function, which fetches the pictures on your
behalf. That is the trade for needing nothing installed. Nothing is stored — the PDF is
built in memory and streamed back — but the request does pass through a server, and
anyone for whom that matters should use the local application instead.

---

## 3. A post's pictures

`pdf` carries `multi: true`, and `startDownload` dispatches on that flag to
`startGallery`, which starts no yt-dlp process at all. `jobs.js` is never told which one
it started: both return `{ child, done }`.

Pictures are found by a **chain of providers**, tried in `config.imageProviders` order
until one returns something:

1. **`gallerydl`** — gallery-dl asked for URLs with `-g`, so it downloads nothing. It
   knows a hundred sites' post formats; letting it write files itself would put a second
   downloader with its own naming rules inside the job directory.
2. **`scrape`** — reads the page: `og:image`, then JSON-LD, then `<img>`. This is the one
   that covers an ordinary website or a forum thread, and it needs no extra program. It
   cannot see a page that assembles itself in the browser.
3. **`ytdlp`** — the poster frame. One picture, never a carousel.

**None is required.** A missing gallery-dl is skipped, not an error. That is what keeps
the install short for someone on a phone, and why the order is a preference rather than a
ranking.

### 3.1 Server-side request forgery

Every URL reaching the fetcher was written by whoever controls the page it came from, and
Steading runs on a personal machine with other things listening on it. A post could name
`http://127.0.0.1:8080/admin` and have the server fetch it back as a "photo".

So each address is **resolved** before anything is requested, and refused if any address
the name resolves to is private, loopback, link-local, carrier-NAT or multicast.
Resolved, not pattern-matched: a public-looking hostname is free to have an A record
pointing at 127.0.0.1.

Verified against the live endpoint:

```bash
curl -s -X POST https://steading.vercel.app/api/pictures \
  -H 'Content-Type: application/json' -d '{"url":"http://127.0.0.1:8080/admin"}'
# {"code": "bad_url"}

curl -s -X POST https://steading.vercel.app/api/pictures \
  -H 'Content-Type: application/json' -d '{"url":"http://169.254.169.254/latest/meta-data/"}'
# {"code": "bad_url"}
```

That second address is the cloud metadata endpoint. Reaching it is how hosted credentials
get stolen, which is why it is tested explicitly rather than assumed covered.

### 3.2 Behaviour under throttling

A dead picture is skipped rather than fatal — one expired CDN URL in twenty is normal,
and only an empty result raises `no_image`.

The visible consequence is worth knowing: **a host that throttles a rapid second request
quietly yields a shorter PDF.** Measured on Wikipedia, six pages became one when two jobs
ran back to back; with a twenty-second pause between them, both returned six. The
truncation is reported in `X-Steading-Truncated` so the interface can say so rather than
leaving the reader to count pages.

### 3.3 The PDF writer

Hand-written, no dependency. One page per picture, each page sized to its own image
rather than to A4, so a portrait photo is not given letterbox margins it never had.

JPEG bytes are embedded verbatim through `DCTDecode`: nothing is decoded, nothing is
re-encoded, and the picture inside the PDF is bit-for-bit the picture that came off the
site. Overhead measured at **8,336 bytes for 3 MB of input.**

---

## 4. Picture quality

Five steps, ordered lightest to best, and the order is load-bearing — the slider's index
*is* a position in the array, so adding a step widens the slider with no interface change.

| Step | ffmpeg `-q:v` | Longest edge |
| --- | --- | --- |
| Tiny | 14 | 1080 px |
| Small | 8 | 1440 px |
| Balanced | 5 | 2048 px |
| High | 2 | unchanged |
| Original | not re-encoded | unchanged |

Measured on one six-page article: **2.37 MB at Original, 433 KB at Small** — same pages,
5.5× smaller.

`Original` is the default, because quietly degrading a picture nobody asked to degrade is
the wrong way round, and moving the slider left is one gesture. It re-encodes only what a
PDF cannot carry: a picture that arrived as a JPEG goes in untouched.

---

## 5. Known behaviours

Recorded here rather than on the front page, because they are operating characteristics
rather than headlines.

- **Sites change without warning.** Twenty-two are verified by hand; the remaining 1,730
  extractors are reachable but unverified, and any of them can stop working the week
  after this was written. `npm test` does not catch that — only a live probe does.
- **Steading never signs in as you.** Private, paid and age-restricted material is out of
  reach by design. No account on anyone else's service is ever requested, and no
  credential is ever stored.
- **Live streams are not handled.** A stream has no end, and every part of the job model
  here assumes a file that finishes.
- **The hosted picture tool embeds JPEG only.** PNG and WebP are skipped rather than
  mangled, because there is no encoder in the function. The local application converts
  them.

---

## 6. Reproducing the measurements

```bash
# the app, locally
npm install && npm run check     # reports what is missing
npm run universal                # all 1,752 extractors accepted
npm test                         # 66 tests

# the hosted picture tool
curl -s -D - -o out.pdf -X POST https://steading.vercel.app/api/pictures \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://en.wikipedia.org/wiki/Lighthouse"}'
```

Repositories: [steading](https://github.com/bryankwandou/steading) is this site;
[steading-app](https://github.com/bryankwandou/steading-app) is the application that runs
on your own machine.
