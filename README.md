# Steading — versi hosted (Vercel)

**Fast. Seamless. 100% Local.**

Deployment ini punya dua tugas, dan yang kedua lebih penting.

1. **Etalase** — halaman utamanya memperagakan antarmuka lengkap tanpa memasang apa pun.
2. **Pemasang** — halaman `/setup` memasang Steading yang sungguhan ke komputer
   pembaca dengan satu baris perintah yang tinggal disalin.

Unduhan sungguhan hanya jalan dari koneksi pribadi seseorang, jadi tugas kedua itulah
yang membuat aplikasinya benar-benar bisa dinilai.

Steading yang asli ada di folder [`../steading`](../steading). Ia berjalan di
perangkat Anda sendiri dan benar-benar mengunduh video.

## Halaman pemasangan

`/setup` menebak sistem pembaca, lalu menampilkan satu baris untuknya dengan tombol
salin. Tidak ada yang perlu diketik.

| Sistem | Perintah |
| ------ | -------- |
| Windows | `powershell -c "irm https://getsteading.vercel.app/install.ps1 | iex"` |
| macOS, Linux, Termux | `curl -fsSL https://getsteading.vercel.app/install.sh | sh` |

Skripnya memasang Node.js, yt-dlp, dan ffmpeg lewat pengelola paket sistem itu sendiri,
membuka `steading.zip` ke satu folder di direktori rumah, lalu menjalankan server di
`127.0.0.1` saja. Tidak ada yang dipasang ke seluruh sistem; menghapus foldernya sudah
mencopot semuanya. Halaman itu menautkan isi skripnya supaya bisa dibaca dulu.

Setelah mengubah apa pun di `../steading`, kemas ulang arsipnya:

```bash
npm run package
```

Melewatkannya berarti pembaca memasang versi lama. `npm test` gagal kalau itu terjadi.

## Halaman verifikasi

`/verify` mencatat sidik jari SHA-256 setiap berkas yang dilayani, versi alat yang
dipakai saat membangun, ukuran kode yang dikirim, dan langkah untuk memeriksanya
sendiri. Semua angkanya dibaca dari berkas nyata oleh `scripts/lib/evidence.js` saat
`npm run package`, jadi tidak ada yang diketik tangan dan tidak bisa basi — dua tes
gagal kalau sampai melenceng.

Bagian yang paling penting di halaman itu adalah **apa yang TIDAK dibuktikannya**:
bahwa halaman utama alamat ini cuma peraga, bahwa tidak ada klaim soal siapa penulis
kodenya, dan bahwa situs sumber bisa berubah kapan saja. Ada tes yang gagal kalau
bagian itu dipangkas.

Halamannya hanya dua bahasa, bukan 24 seperti aplikasinya. Itu disengaja: ini dokumen
teknis, dan klaim teknis yang salah terjemah lebih berbahaya daripada tidak
diterjemahkan. Halamannya menyatakan alasan itu sendiri.

## Kenapa unduhan asli tidak berjalan di sini

Tiga alasan, semuanya keras dan tidak bisa diakali:

1. **Alamat datacenter diblokir.** Keempat platform menolak IP penyedia hosting, bukan
   hanya YouTube. Diuji langsung dari Vercel: TikTok menjawab "Your IP address is
   blocked from accessing this post", Instagram dan Facebook meminta cookies.
2. **Batas waktu dan penyimpanan.** Fungsi serverless di plan Hobby berhenti pada 60
   detik dan sistem berkasnya sementara. Menggabungkan video dan audio 25 MB dengan
   ffmpeg tidak akan selesai di dalam batas itu.
3. **Ketentuan layanan.** Menghosting pengunduh publik melanggar AUP Vercel dan ToS
   platform sumber. Proyek bisa di-suspend.

Karena itu yang di-deploy adalah antarmukanya, dengan alur unduh yang disimulasikan.

## Tiga lapis yang ada di deployment ini

**Mode demo** — default, dan yang dipakai kalau ada yang menilai aplikasi ini.
Alur lengkap berjalan: cek tautan, pratinjau, pilih format, progres dengan persentase
dan kecepatan dan ETA, tahap penggabungan, lalu berkas benar-benar tersimpan ke
perangkat. Tidak ada satu pun permintaan ke pihak ketiga, jadi tidak ada yang bisa
gagal karena jaringan atau karena situs sumber berubah. Timing-nya tetap sama setiap
kali dijalankan.

**Mode langsung** — tombol "Coba server langsung" di bar mode. Ini benar-benar
memanggil yt-dlp di fungsi Python `api/info.py`. Kalau berhasil, berarti benar-benar
berhasil. Kalau gagal, alasannya diterjemahkan dan ditampilkan apa adanya. Yang bisa
dilayani hanya metadata; unduhan sungguhan sengaja tidak diimplementasikan, karena
gagal di tengah demo lebih buruk daripada tidak menjanjikannya sama sekali.

**Tanpa backend** — kalau fungsi Python mati, aplikasi tetap terpakai penuh di mode
demo. Ini bukan kebetulan, ini yang diuji lewat `npm run dev`, yang sengaja menjawab
501 untuk semua `/api/*`.

## Yang jujur dan yang disimulasikan

| Bagian | Status di sini |
| ------ | -------------- |
| Desain, tata letak, tipografi | asli, sama persis dengan versi lokal |
| Tema terang dan gelap | asli, termasuk transisi dan penyimpanan pilihan |
| 24 bahasa, termasuk RTL | asli, kamus yang sama |
| Penolakan situs di luar daftar putih | **asli** — logika allowlist yang sama berjalan di browser |
| Nama berkas dibersihkan | asli, fungsi yang sama |
| PWA, install ke home screen | asli |
| Metadata video (judul, durasi, thumbnail) | **contoh** di mode demo, asli di mode langsung |
| Angka progres, kecepatan, ETA | **skrip** — tapi jumlah byte-nya ukuran berkas contoh yang sebenarnya |
| Berkas yang tersimpan | **klip contoh asli** yang ikut dalam repo, bukan video dari tautan Anda |

Bar mode di atas halaman menyatakan hal ini ke pengunjung dalam bahasa mereka. Kartu
pratinjau juga memberi catatan bahwa yang ditampilkan adalah klip contoh.

## Menjalankan secara lokal

```bash
npm run dev
```

Buka `http://127.0.0.1:4000`. Fungsi Python tidak ikut berjalan di sini — `/api/*`
menjawab 501, yang memang salah satu kondisi yang perlu diuji.

```bash
npm test
npm run test:py
```

`npm run package` mengemas ulang `../steading` jadi `public/steading.zip` dan
membangun ulang `public/verify.html` dari berkas hasilnya.

`npm test` menguji paritas dengan versi lokal: daftar putih host, hasil validasi URL
untuk 15 masukan, `safeFilename`, kode galat, dan paritas kunci di 24 kamus.

`npm run test:py` menguji fungsi Python-nya: 19 kasus validasi URL dan 11 kasus
pengelompokan galat, tanpa jaringan dan tanpa memuat yt-dlp.

## Deploy

```bash
npm i -g vercel
vercel
```

Atau lewat dashboard Vercel: import repo, lalu biarkan pengaturannya apa adanya.
`vercel.json` sudah menetapkan `outputDirectory: public`, tanpa build command, dan
header keamanan yang sama dengan versi lokal.

Fungsi Python terdeteksi otomatis dari folder `api/` dan memakai `requirements.txt`.
Kalau Anda tidak ingin mode langsung sama sekali, hapus folder `api/` dan
`requirements.txt`; aplikasi tetap berjalan penuh di mode demo.

## Menurunkan kembali (takedown)

Deployment ini dimaksudkan untuk sementara. Setelah sidang selesai, hapus seluruhnya:

```bash
npx vercel remove getsteading --yes
```

Perintah itu menghapus proyek beserta semua deployment-nya, dan URL-nya langsung mati.
Kode di komputer Anda tidak tersentuh.

Lewat dashboard: buka proyeknya, **Settings** lalu **Advanced** lalu **Delete Project**.

Kalau hanya ingin mematikan mode langsung tapi halaman tetap hidup, hapus folder `api/`
dan `requirements.txt` lalu deploy ulang. Aplikasi tetap berfungsi penuh di mode demo,
dan tombol "Coba server langsung" akan menampilkan pesan bahwa server tidak menjawab.

## Struktur

```
steading-vercel/
├── vercel.json          outputDirectory + header keamanan
├── requirements.txt     yt-dlp, untuk fungsi Python
├── api/
│   ├── info.py          metadata sungguhan lewat yt-dlp
│   └── health.py        melaporkan apakah yt-dlp ada
├── public/
│   ├── index.html       sama dengan versi lokal, ditambah bar mode
│   ├── css/style.css    sama, ditambah bagian bar mode
│   ├── js/
│   │   ├── app.js       sama, ditambah lapisan mode
│   │   ├── api.js       memilih demo atau live
│   │   ├── demo.js      mesin demo deterministik
│   │   ├── validate.js  allowlist yang sama, di sisi browser
│   │   ├── i18n.js · theme.js · boot-theme.js
│   ├── i18n/            22 kamus, sama dengan versi lokal
│   └── demo/            klip contoh, dibuat dengan ffmpeg
├── scripts/
│   ├── serve.js         pratinjau lokal dengan header yang sama
│   ├── package.js       mengemas ../steading jadi steading.zip
│   ├── make-verify.js   membangun verify.html dari berkas nyata
│   └── lib/
│       ├── pack.js      pengumpul berkas + penulis ZIP, tanpa efek samping
│       └── evidence.js  digest, versi alat, ukuran kode
└── tests/parity.test.js penjaga agar tidak melenceng dari versi lokal
```

## Catatan

Klip contoh di `public/demo/` dibuat sendiri dengan ffmpeg (`testsrc2` dan nada sinus).
Tidak ada materi berhak cipta milik siapa pun di dalam repo ini.

## Engineering record

The measurements behind every figure on the site, the screenshots, the failure modes and
the stated limits are kept at **https://bryankwandou.github.io/steading/**.

It is written for reviewers rather than for people using Steading, which is why it is not
linked from the product: a list of limits read out of context is misleading to someone who
only wanted to save a photo.
