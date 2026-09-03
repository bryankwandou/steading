/**
 * Localization.
 *
 * Two languages ship inline -- English as the fallback every other language falls back
 * to, and Indonesian as the primary audience. Everything else lives in
 * /i18n/<code>.json and is fetched the first time it is selected, so the app shell
 * stays small on a phone. A missing key falls through to English rather than showing a
 * raw identifier; a missing file leaves the current language in place.
 *
 * Server error codes are keys here too. The backend sends `download_failed`, never a
 * sentence, which is why adding a language never touches server code.
 */

const STORAGE_KEY = 'steading.lang';

/**
 * The picker's contents. `name` is written in the language itself -- a user looking for
 * their language scans for the word they know, not its English exonym.
 */
export const LANGUAGES = [
  { code: 'id',    name: 'Bahasa Indonesia', dir: 'ltr' },
  { code: 'en',    name: 'English',          dir: 'ltr' },
  { code: 'ms',    name: 'Bahasa Melayu',    dir: 'ltr' },
  { code: 'ar',    name: 'العربية',           dir: 'rtl' },
  { code: 'bn',    name: 'বাংলা',              dir: 'ltr' },
  { code: 'de',    name: 'Deutsch',          dir: 'ltr' },
  { code: 'es',    name: 'Español',          dir: 'ltr' },
  { code: 'fa',    name: 'فارسی',             dir: 'rtl' },
  { code: 'fil',   name: 'Filipino',         dir: 'ltr' },
  { code: 'fr',    name: 'Français',         dir: 'ltr' },
  { code: 'hi',    name: 'हिन्दी',              dir: 'ltr' },
  { code: 'it',    name: 'Italiano',         dir: 'ltr' },
  { code: 'ja',    name: '日本語',             dir: 'ltr' },
  { code: 'ko',    name: '한국어',             dir: 'ltr' },
  { code: 'nl',    name: 'Nederlands',       dir: 'ltr' },
  { code: 'pl',    name: 'Polski',           dir: 'ltr' },
  { code: 'pt',    name: 'Português',        dir: 'ltr' },
  { code: 'ru',    name: 'Русский',          dir: 'ltr' },
  { code: 'th',    name: 'ไทย',               dir: 'ltr' },
  { code: 'tr',    name: 'Türkçe',           dir: 'ltr' },
  { code: 'uk',    name: 'Українська',       dir: 'ltr' },
  { code: 'vi',    name: 'Tiếng Việt',       dir: 'ltr' },
  { code: 'zh-CN', name: '简体中文',           dir: 'ltr' },
  { code: 'zh-TW', name: '繁體中文',           dir: 'ltr' },
];

const KNOWN = new Set(LANGUAGES.map((l) => l.code));

const en = {
  'app.description': 'A video and audio downloader that runs entirely on your own device.',

  'nav.language': 'Language',
  'nav.theme': 'Theme',
  'nav.theme.light': 'Switch to light theme',
  'nav.theme.dark': 'Switch to dark theme',

  'url.label': 'Video link',
  'url.placeholder': 'Paste a YouTube, TikTok, Instagram or Facebook link',
  'url.hint': 'The server runs on this device. Nothing is sent anywhere.',
  'url.supports': "Works with {list}.",
  'landing.what': "Save video and audio from YouTube, TikTok, Instagram and Facebook — onto your own computer.",
  'landing.why': "It runs on your machine, not ours. Nothing you paste is sent anywhere, there is no account, and the download comes straight from the source site to you. That is also the only way it can work: these platforms refuse requests from hosting providers, so a website cannot do this for you.",
  'landing.get': "Download for {system}",
  'landing.getNote': "One file. Double-click it, and it sets itself up.",
  'live.cta': "Use it now, in this browser",
  'live.note': "Nothing to download and nothing to install. It opens straight away and works exactly like the installed copy, because it is one — running on the presenter’s computer.",
  'live.or': "Or put it on your own computer",
  'live.closed': "The live session is not open at the moment. It runs during a demonstration; when it is open, a button appears here that needs no installation.",
  'live.paste': 'Pictures work on this page. Video and audio need the app on your own machine, so their paste box lives there rather than here.',
  'local.found': "Steading is already running on this computer.",
  'local.open': "Open Steading",
  'local.openNote': "This takes you to the copy on your machine, where downloading actually works.",
  'after.title': "The file is in this browser now",
  'after.where': "You do not need to look for it on your computer. It is in the download list of this browser — the arrow at the top-right of this window.",
  'after.do': "Chrome calls it dangerous. Choose Keep.",
  'after.then': "Then click Steading.cmd in that same list. It runs from there; there is no folder to open.",
  'after.warn': "Windows then shows a blue screen saying it protected your PC. Choose “More info”, then “Run anyway”. Both warnings appear because the file is new and unsigned, not because anything is wrong with it.",
  'after.keepOpen': "A black window opens and sets everything up. When it finishes, your browser opens the app by itself — paste the video link there. Leave the black window open while you use it.",
  'after.again': "Lost the file? Download it again",
  'after.hard': "That is three warnings to click through, which is a lot to ask. If you would rather not, ask whoever is presenting to open it for you, or use the address they can give you that needs no installation at all.",
  'landing.other': "Other systems, or install it by hand",
  'landing.tryTitle': "Or look around first",
  'landing.tryNote': "The interface below is the real one, running here as a demonstration. It shows exactly what the installed app does, using a sample clip instead of a real download.",
  'flow.title': "Why a website cannot do this for you",
  'flow.site': "The video site",
  'flow.server': "A website’s server",
  'flow.yours': "Your own computer",
  'flow.blocked': "Refused",
  'flow.allowed': "Allowed",
  'flow.blockedWhy': "Requests from hosting providers are turned away. Tested from this very address: TikTok answers “Your IP address is blocked”.",
  'flow.allowedWhy': "Your connection is an ordinary one, so the file comes straight to you — which is why Steading runs on your machine instead.",
  'url.paste': 'Paste from clipboard',
  'url.clipboardDenied': 'Could not read the clipboard. Long-press the field and paste manually.',

  'action.check': 'Check link',
  'action.checking': 'Checking',
  'action.download': 'Download',
  'action.starting': 'Starting',
  'action.cancel': 'Cancel',

  'format.label': 'Format',
  'format.mp4': 'Video MP4',
  'format.mp3': 'Audio MP3',
  'quality.label': 'Quality',
  'quality.best': 'Best available',

  'media.untitled': 'Untitled',

  'phase.extracting': 'Reading the link',
  'phase.downloading': 'Downloading',
  'phase.merging': 'Merging video and audio',
  'phase.converting': 'Converting to MP3',
  'phase.finishing': 'Finishing up',
  'phase.ready': 'Done',

  'progress.remaining': '{time} left',
  'progress.canceled': 'Download canceled.',
  'progress.saved': 'Saved to your device: {name}',
  'progress.savedSize': 'Saved to your device: {name} ({size})',

  'server.checking': 'checking the local server',
  'server.ok': 'local server running · yt-dlp {ytdlp}',
  'server.okFfmpeg': 'local server running · yt-dlp {ytdlp} · ffmpeg {ffmpeg}',
  'server.missing': 'yt-dlp is not installed — run: npm run check',
  'server.missingLong': 'yt-dlp is not installed on this device, so downloads cannot run yet. Run "npm run check" in a terminal for instructions.',
  'server.down': 'the local server is not responding',

  'error.body_too_large': 'That request was too large.',
  'error.bad_json': 'The request was malformed.',
  'error.bad_request_url': 'That request address was malformed.',
  'error.origin_rejected': 'That request came from somewhere this server does not trust.',
  'error.unknown_endpoint': 'Unknown endpoint.',
  'error.url_not_text': 'The link must be text.',
  'error.url_empty': 'Paste a link first.',
  'error.url_too_long': 'That link is too long.',
  'error.url_bad_chars': 'That link contains characters that are not valid.',
  'error.url_malformed': 'That does not look like a link.',
  'error.url_bad_scheme': 'Only http and https links are supported.',
  'error.url_unsupported_site': 'That site is not supported. Steading handles YouTube, TikTok, Instagram and Facebook.',
  'error.url_site_locked': "{site} builds its posts in the browser and hides most of them behind a login, so a downloader is handed nothing to fetch. If the same video is also on YouTube, TikTok, Instagram or Facebook, paste that link instead.",
  'error.bad_format': 'The format must be MP4 or MP3.',
  'error.bad_quality': 'That quality is not available.',
  'error.bad_job_id': 'Invalid job id.',
  'error.no_binary': 'yt-dlp is not installed. Run "npm run check" for instructions.',
  'error.info_timeout': 'The site took too long to answer.',
  'error.info_unreadable': 'Could not read any details from that link.',
  'error.is_live': 'Live streams are not supported yet.',
  'error.private_content': 'This is private or needs a login, so it cannot be downloaded.',
  'error.content_gone': 'Not found. It may have been removed, or the link may be wrong.',
  'error.geo_blocked': 'This is restricted to certain regions.',
  'error.network': 'Connection problem. Check your network and try again.',
  'error.download_failed': 'yt-dlp could not process this link.',
  'error.download_timeout': 'The download ran past its time limit.',
  'error.no_output_file': 'The download finished but the file could not be found.',
  'error.too_many_jobs': 'Up to {n} downloads can run at once. Wait for one to finish.',
  'error.job_not_found': 'That download is no longer available.',
  'error.file_not_ready': 'The file is not ready yet.',
  'error.canceled': 'Download canceled.',
  'error.client_gone': 'The browser disconnected, so the download was stopped.',
  'error.file_expired': 'The file expired because it was never downloaded.',
  'error.job_expired': 'The download expired.',
  'error.server_error': 'Something went wrong on the local server.',
  'error.http': 'The server answered {status}.',
  'error.detail': 'Details: {detail}',

  'mode.demo': 'Demo',
  'mode.live': 'Live',
  'mode.explainDemo': 'Demo mode. The download engine runs on your own device, not on this server. Here the flow is simulated with a sample clip bundled into the app.',
  'mode.explainLive': 'Live mode. This really calls yt-dlp on the server. Hosted addresses are frequently blocked by the source sites, so a failure here is expected rather than a defect.',
  'mode.toLive': 'Try the live server',
  'mode.toDemo': 'Back to demo',
  'demo.sampleTitle': 'Steading demo clip',
  'demo.sampleNote': 'Sample clip bundled with the app, not the video you linked.',
  'error.live_unreachable': 'The live server did not answer.',
  'error.live_blocked': 'The source site refused the server. Hosted addresses are commonly blocked; the local build does not have this problem.',

  'nav.setup': "Run it on your computer",
  'setup.title': "Run Steading on your own computer",
  'setup.lead': "Downloading only works from your own connection: YouTube, TikTok, Instagram and Facebook all refuse requests coming from hosting providers. This page gets Steading onto your machine in one line, and nothing is left behind but a single folder.",
  'setup.pickOs': "Choose your system",
  'setup.step1': "Copy the line for your system.",
  'setup.step2': "Open {shell}, paste it, press Enter.",
  'setup.step3': "Your browser opens by itself when it is ready. Paste a video link and download.",
  'setup.copy': "Copy",
  'setup.copied': "Copied",
  'setup.copyFailed': "Select it",
  'setup.whatItDoes': "What that line actually does",
  'setup.does1': "Installs Node.js, yt-dlp and ffmpeg if they are missing, using your system’s own package manager.",
  'setup.does2': "Unpacks Steading into a folder called Steading in your home directory. Nothing is installed system-wide.",
  'setup.does3': "Starts the server on 127.0.0.1 only, so it is never reachable from your network. Delete the folder to remove it.",
  'setup.viewSource': "Read the script before running it",
  'setup.verify': "Check the file digests",
  'setup.manual': "Would rather not run a script?",
  'setup.manualLink': "Download the folder instead",
  'setup.back': "Back to the preview",
  'setup.footNote': "Everything runs on your device. Nothing is uploaded.",
  'setup.noteWindows': "Works on Windows 10 and 11. No administrator rights needed.",
  'setup.noteMac': "Needs Homebrew. If you do not have it, the script says so and stops.",
  'setup.noteLinux': "Works with apt, dnf or pacman. You will be asked for your password.",
  'setup.noteAndroid': "Install Termux from F-Droid first, not the Play Store version.",
  'url.supportsSome': "Works with {list} and {n} more.",
  'url.supportsShowAll': "See all",
  'url.supportsShowLess': "See fewer",
  'url.universalOn': "Universal mode is on, so any other link is tried too.",
  'url.universalCount': "Universal mode is on, so all {n} sites yt-dlp knows are accepted.",
  'format.video': "Video",
  'format.audio': "Audio",
  'format.image': "Photo",
  'format.pictureOnly': "This link is not a video or a track, so only its pictures can be saved.",
  'format.type': "Type",
  'picture.label': "Picture quality",
  'picture.lighter': "Smaller file",
  'picture.fuller': "Original",
  'picture.tiny': "Tiny",
  'picture.small': "Small",
  'picture.balanced': "Balanced",
  'picture.high': "High",
  'picture.original': "Original",
  'error.video_not_available': "This link has no video track, only audio. Switch to MP3 to save it.",
  'error.no_image': "That link has no picture to save.",
  'sites.link': "See every site it supports",
};

const id = {
  'app.description': 'Pengunduh video dan audio yang berjalan sepenuhnya di perangkat sendiri.',

  'nav.language': 'Bahasa',
  'nav.theme': 'Tema',
  'nav.theme.light': 'Ganti ke tema terang',
  'nav.theme.dark': 'Ganti ke tema gelap',

  'url.label': 'Tautan video',
  'url.placeholder': 'Tempel tautan YouTube, TikTok, Instagram, atau Facebook',
  'url.hint': 'Server berjalan di perangkat ini. Tidak ada data yang dikirim ke mana pun.',
  'url.supports': "Mendukung {list}.",
  'landing.what': "Simpan video dan audio dari YouTube, TikTok, Instagram, dan Facebook — ke komputer Anda sendiri.",
  'landing.why': "Berjalan di mesin Anda, bukan mesin kami. Apa pun yang Anda tempel tidak dikirim ke mana-mana, tidak perlu akun, dan unduhannya langsung dari situs sumber ke Anda. Itu juga satu-satunya cara ia bisa bekerja: platform-platform itu menolak permintaan dari penyedia hosting, jadi sebuah situs web tidak bisa melakukannya untuk Anda.",
  'landing.get': "Unduh untuk {system}",
  'landing.getNote': "Satu berkas. Klik dua kali, ia memasang dirinya sendiri.",
  'live.cta': "Pakai sekarang, di browser ini",
  'live.note': "Tidak ada yang perlu diunduh dan tidak ada yang perlu dipasang. Langsung terbuka dan bekerja persis seperti salinan terpasang, karena memang salinan itu — berjalan di komputer penyaji.",
  'live.or': "Atau pasang di komputer Anda sendiri",
  'live.closed': "Sesi langsung sedang tidak dibuka. Sesi itu berjalan saat peragaan; ketika dibuka, tombol yang tidak butuh pemasangan akan muncul di sini.",
  'live.paste': 'Gambar bisa langsung di halaman ini. Video dan suara butuh aplikasinya di mesin Anda sendiri, jadi kotak tempelnya ada di sana, bukan di sini.',
  'local.found': "Steading sudah berjalan di komputer ini.",
  'local.open': "Buka Steading",
  'local.openNote': "Ini membawa Anda ke salinan di mesin Anda, tempat pengunduhan benar-benar bekerja.",
  'after.title': "Berkasnya ada di browser ini sekarang",
  'after.where': "Anda tidak perlu mencarinya di komputer. Berkasnya ada di daftar unduhan browser ini — ikon panah di pojok kanan atas jendela.",
  'after.do': "Chrome menyebutnya berbahaya. Pilih Simpan (Keep).",
  'after.then': "Lalu klik Steading.cmd di daftar yang sama itu. Ia berjalan dari sana; tidak ada folder yang perlu dibuka.",
  'after.warn': "Setelah itu Windows menampilkan layar biru bertuliskan telah melindungi PC Anda. Pilih “Info selengkapnya”, lalu “Tetap jalankan”. Kedua peringatan itu muncul karena berkasnya baru dan tidak bertanda tangan, bukan karena ada yang salah padanya.",
  'after.keepOpen': "Akan muncul jendela hitam yang menyiapkan semuanya. Setelah selesai, browser membuka aplikasinya sendiri — tempel tautan videonya di sana. Biarkan jendela hitam itu terbuka selama Anda memakainya.",
  'after.again': "Berkasnya hilang? Unduh sekali lagi",
  'after.hard': "Itu tiga peringatan yang harus dilewati, dan itu memang banyak. Kalau Anda lebih suka tidak, mintalah penyaji membukakannya, atau pakai alamat yang bisa beliau berikan — alamat itu tidak butuh pemasangan sama sekali.",
  'landing.other': "Sistem lain, atau pasang secara manual",
  'landing.tryTitle': "Atau lihat-lihat dulu",
  'landing.tryNote': "Antarmuka di bawah ini yang sebenarnya, berjalan di sini sebagai peraga. Ia menunjukkan persis apa yang dilakukan aplikasi terpasang, memakai klip contoh alih-alih unduhan sungguhan.",
  'flow.title': "Kenapa sebuah situs web tidak bisa melakukannya untuk Anda",
  'flow.site': "Situs videonya",
  'flow.server': "Server sebuah situs web",
  'flow.yours': "Komputer Anda sendiri",
  'flow.blocked': "Ditolak",
  'flow.allowed': "Diizinkan",
  'flow.blockedWhy': "Permintaan dari penyedia hosting ditolak. Diuji langsung dari alamat ini: TikTok menjawab “Your IP address is blocked”.",
  'flow.allowedWhy': "Sambungan Anda sambungan biasa, jadi berkasnya langsung sampai ke Anda — dan itulah sebabnya Steading berjalan di mesin Anda.",
  'url.paste': 'Tempel dari papan klip',
  'url.clipboardDenied': 'Tidak bisa membaca papan klip. Tekan lama kolom tautan lalu tempel manual.',

  'action.check': 'Cek tautan',
  'action.checking': 'Memeriksa',
  'action.download': 'Unduh',
  'action.starting': 'Memulai',
  'action.cancel': 'Batalkan',

  'format.label': 'Format',
  'format.mp4': 'Video MP4',
  'format.mp3': 'Audio MP3',
  'quality.label': 'Kualitas',
  'quality.best': 'Terbaik yang tersedia',

  'media.untitled': 'Tanpa judul',

  'phase.extracting': 'Membaca tautan',
  'phase.downloading': 'Mengunduh',
  'phase.merging': 'Menggabungkan video dan audio',
  'phase.converting': 'Mengonversi ke MP3',
  'phase.finishing': 'Merapikan berkas',
  'phase.ready': 'Selesai',

  'progress.remaining': 'sisa {time}',
  'progress.canceled': 'Unduhan dibatalkan.',
  'progress.saved': 'Tersimpan ke perangkat: {name}',
  'progress.savedSize': 'Tersimpan ke perangkat: {name} ({size})',

  'server.checking': 'memeriksa server lokal',
  'server.ok': 'server lokal aktif · yt-dlp {ytdlp}',
  'server.okFfmpeg': 'server lokal aktif · yt-dlp {ytdlp} · ffmpeg {ffmpeg}',
  'server.missing': 'yt-dlp belum terpasang — jalankan: npm run check',
  'server.missingLong': 'yt-dlp belum terpasang di perangkat ini, jadi unduhan belum bisa dijalankan. Jalankan "npm run check" di terminal untuk petunjuknya.',
  'server.down': 'server lokal tidak merespons',

  'error.body_too_large': 'Permintaan terlalu besar.',
  'error.bad_json': 'Permintaan tidak berbentuk benar.',
  'error.bad_request_url': 'Alamat permintaan tidak valid.',
  'error.origin_rejected': 'Permintaan datang dari asal yang tidak dipercaya server ini.',
  'error.unknown_endpoint': 'Endpoint tidak dikenal.',
  'error.url_not_text': 'Tautan harus berupa teks.',
  'error.url_empty': 'Tempel tautannya dulu.',
  'error.url_too_long': 'Tautannya terlalu panjang.',
  'error.url_bad_chars': 'Tautan mengandung karakter yang tidak valid.',
  'error.url_malformed': 'Itu sepertinya bukan tautan.',
  'error.url_bad_scheme': 'Hanya tautan http dan https yang didukung.',
  'error.url_unsupported_site': 'Situs ini belum didukung. Steading mendukung YouTube, TikTok, Instagram, dan Facebook.',
  'error.url_site_locked': "{site} menyusun postingannya di dalam browser dan menyembunyikan sebagian besar di balik login, jadi tidak ada yang bisa diambil pengunduh. Kalau video yang sama juga ada di YouTube, TikTok, Instagram, atau Facebook, tempel tautan itu saja.",
  'error.bad_format': 'Format harus MP4 atau MP3.',
  'error.bad_quality': 'Kualitas itu tidak tersedia.',
  'error.bad_job_id': 'ID tugas tidak valid.',
  'error.no_binary': 'yt-dlp belum terpasang. Jalankan "npm run check" untuk petunjuknya.',
  'error.info_timeout': 'Situsnya terlalu lama merespons.',
  'error.info_unreadable': 'Tidak bisa membaca detail dari tautan ini.',
  'error.is_live': 'Siaran langsung belum didukung.',
  'error.private_content': 'Konten ini privat atau butuh login, jadi tidak bisa diunduh.',
  'error.content_gone': 'Tidak ditemukan. Mungkin sudah dihapus, atau tautannya salah.',
  'error.geo_blocked': 'Konten ini dibatasi untuk wilayah tertentu.',
  'error.network': 'Koneksi bermasalah. Periksa jaringan lalu coba lagi.',
  'error.download_failed': 'yt-dlp tidak bisa memproses tautan ini.',
  'error.download_timeout': 'Unduhan melebihi batas waktu.',
  'error.no_output_file': 'Unduhan selesai tetapi berkasnya tidak ditemukan.',
  'error.too_many_jobs': 'Maksimal {n} unduhan berjalan bersamaan. Tunggu salah satunya selesai.',
  'error.job_not_found': 'Unduhan itu sudah tidak tersedia.',
  'error.file_not_ready': 'Berkasnya belum siap.',
  'error.canceled': 'Unduhan dibatalkan.',
  'error.client_gone': 'Browser terputus, jadi unduhan dihentikan.',
  'error.file_expired': 'Berkas kedaluwarsa karena tidak pernah diunduh.',
  'error.job_expired': 'Unduhan kedaluwarsa.',
  'error.server_error': 'Terjadi kesalahan di server lokal.',
  'error.http': 'Server menjawab {status}.',
  'error.detail': 'Detail: {detail}',

  'mode.demo': 'Demo',
  'mode.live': 'Langsung',
  'mode.explainDemo': 'Mode demo. Mesin pengunduh berjalan di perangkat Anda sendiri, bukan di server ini. Di sini alurnya disimulasikan memakai klip contoh yang ikut dalam aplikasi.',
  'mode.explainLive': 'Mode langsung. Ini benar-benar memanggil yt-dlp di server. Alamat hosting sering diblokir oleh situs sumber, jadi kegagalan di sini wajar, bukan cacat program.',
  'mode.toLive': 'Coba server langsung',
  'mode.toDemo': 'Kembali ke demo',
  'demo.sampleTitle': 'Klip demo Steading',
  'demo.sampleNote': 'Klip contoh bawaan aplikasi, bukan video dari tautan Anda.',
  'error.live_unreachable': 'Server langsung tidak menjawab.',
  'error.live_blocked': 'Situs sumber menolak server ini. Alamat hosting memang lazim diblokir; versi lokal tidak punya masalah ini.',

  'nav.setup': "Jalankan di komputer Anda",
  'setup.title': "Jalankan Steading di komputer Anda sendiri",
  'setup.lead': "Pengunduhan hanya bisa lewat koneksi Anda sendiri: YouTube, TikTok, Instagram, dan Facebook sama-sama menolak permintaan yang datang dari penyedia hosting. Halaman ini memasang Steading ke mesin Anda dengan satu baris, dan tidak meninggalkan apa pun selain satu folder.",
  'setup.pickOs': "Pilih sistem Anda",
  'setup.step1': "Salin baris untuk sistem Anda.",
  'setup.step2': "Buka {shell}, tempel, tekan Enter.",
  'setup.step3': "Browser terbuka sendiri begitu siap. Tempel tautan video lalu unduh.",
  'setup.copy': "Salin",
  'setup.copied': "Tersalin",
  'setup.copyFailed': "Pilih manual",
  'setup.whatItDoes': "Apa yang sebenarnya dikerjakan baris itu",
  'setup.does1': "Memasang Node.js, yt-dlp, dan ffmpeg kalau belum ada, memakai pengelola paket bawaan sistem Anda.",
  'setup.does2': "Membuka Steading ke folder bernama Steading di direktori rumah Anda. Tidak ada yang dipasang ke seluruh sistem.",
  'setup.does3': "Menjalankan server hanya di 127.0.0.1, jadi tidak pernah bisa dijangkau dari jaringan Anda. Hapus foldernya untuk mencopotnya.",
  'setup.viewSource': "Baca dulu isi skripnya sebelum dijalankan",
  'setup.verify': "Periksa sidik jari berkasnya",
  'setup.manual': "Tidak mau menjalankan skrip?",
  'setup.manualLink': "Unduh foldernya langsung",
  'setup.back': "Kembali ke pratinjau",
  'setup.footNote': "Semuanya berjalan di perangkat Anda. Tidak ada yang diunggah.",
  'setup.noteWindows': "Berjalan di Windows 10 dan 11. Tidak perlu hak administrator.",
  'setup.noteMac': "Perlu Homebrew. Kalau belum ada, skripnya memberi tahu lalu berhenti.",
  'setup.noteLinux': "Mendukung apt, dnf, atau pacman. Anda akan diminta kata sandi.",
  'setup.noteAndroid': "Pasang Termux dari F-Droid dulu, bukan versi Play Store.",
  'url.supportsSome': "Mendukung {list} dan {n} situs lainnya.",
  'url.supportsShowAll': "Lihat semua",
  'url.supportsShowLess': "Ringkas",
  'url.universalOn': "Mode universal aktif, jadi tautan lain pun tetap dicoba.",
  'url.universalCount': "Mode universal aktif, jadi seluruh {n} situs yang dikenal yt-dlp diterima.",
  'format.video': "Video",
  'format.audio': "Audio",
  'format.image': "Foto",
  'format.pictureOnly': "Tautan ini bukan video atau lagu, jadi hanya gambarnya yang bisa disimpan.",
  'format.type': "Tipe",
  'picture.label': "Kualitas gambar",
  'picture.lighter': "Berkas kecil",
  'picture.fuller': "Asli",
  'picture.tiny': "Sangat ringan",
  'picture.small': "Ringan",
  'picture.balanced': "Seimbang",
  'picture.high': "Tinggi",
  'picture.original': "Asli",
  'error.video_not_available': "Tautan ini tidak punya jalur video, hanya audio. Pilih MP3 untuk menyimpannya.",
  'error.no_image': "Tautan itu tidak punya gambar untuk disimpan.",
  'sites.link': "Lihat semua situs yang didukung",
};

/**
 * The two inline tables, exposed for the integrity test in tests/i18n.test.js.
 * English is the reference every other dictionary is checked against.
 */
export const BASE = { en, id };

/** Loaded dictionaries, keyed by language code. */
const loaded = new Map([['en', en], ['id', id]]);

const listeners = new Set();

let current = 'en';
let dict = en;

/** Best match for a browser tag: exact, then region-stripped, then a regional variant. */
function normalize(tag) {
  if (!tag) return null;
  if (KNOWN.has(tag)) return tag;

  const lower = String(tag).toLowerCase();
  for (const { code } of LANGUAGES) if (code.toLowerCase() === lower) return code;

  const base = lower.split('-')[0];
  if (KNOWN.has(base)) return base;

  // zh-HK and zh-MO read traditional; anything else Chinese gets simplified.
  if (base === 'zh') return /hant|tw|hk|mo/.test(lower) ? 'zh-TW' : 'zh-CN';
  if (base === 'in') return 'id'; // the pre-1989 code for Indonesian, still emitted
  if (base === 'tl') return 'fil';

  for (const { code } of LANGUAGES) if (code.split('-')[0] === base) return code;
  return null;
}

/** Stored choice, else the browser's preference order, else English. */
export function detectLanguage() {
  try {
    const saved = normalize(localStorage.getItem(STORAGE_KEY));
    if (saved) return saved;
  } catch { /* private mode -- fall through to the browser preference */ }

  for (const tag of navigator.languages ?? [navigator.language]) {
    const match = normalize(tag);
    if (match) return match;
  }
  return 'en';
}

async function load(code) {
  if (loaded.has(code)) return loaded.get(code);
  const res = await fetch(`/i18n/${encodeURIComponent(code)}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`missing dictionary: ${code}`);
  const table = await res.json();
  loaded.set(code, table);
  return table;
}

/**
 * Switch language. Resolves once the dictionary is in place and listeners have run, so
 * a caller can await it and know the DOM is consistent.
 */
export async function setLanguage(code) {
  const target = normalize(code) || 'en';
  let table;
  try {
    table = await load(target);
  } catch {
    return current; // keep what is on screen rather than flashing to English
  }

  current = target;
  dict = table;

  try { localStorage.setItem(STORAGE_KEY, target); } catch { /* not fatal */ }

  const meta = LANGUAGES.find((l) => l.code === target);
  document.documentElement.lang = target;
  document.documentElement.dir = meta?.dir ?? 'ltr';

  for (const fn of listeners) fn(target);
  return target;
}

export function getLanguage() {
  return current;
}

export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Translate. `{name}` placeholders are filled from `vars`.
 *
 * Substitution is plain string replacement and every call site assigns the result to
 * `textContent`, never `innerHTML` -- a video title from a remote site passes through
 * here, so it must never be able to become markup.
 */
export function t(key, vars) {
  let out = dict[key] ?? en[key];
  if (out === undefined) return key;
  if (!vars) return out;
  for (const [name, value] of Object.entries(vars)) {
    out = out.split(`{${name}}`).join(String(value));
  }
  return out;
}

/** Translate a server error code, appending raw detail only when it adds something. */
export function tError(code, detail) {
  const key = `error.${code}`;
  const known = dict[key] ?? en[key];

  if (code === 'too_many_jobs') return t(key, { n: detail ?? 2 });
  // The site name comes from the validator's own table, never from user input.
  if (code === 'url_site_locked') return t(key, { site: detail ?? '' });
  if (known) return known;

  // An unrecognised code should still say something true rather than nothing.
  return detail ? t('error.detail', { detail }) : t('error.server_error');
}

/** Apply the current dictionary to every element carrying a data-i18n* attribute. */
export function applyStatic(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of root.querySelectorAll('[data-i18n-attr]')) {
    // Format: "placeholder:url.placeholder, aria-label:url.paste"
    for (const pair of node.dataset.i18nAttr.split(',')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) node.setAttribute(attr, t(key));
    }
  }
}
