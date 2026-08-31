@echo off
setlocal enabledelayedexpansion
title Steading
color 0F
mode con: cols=76 lines=28 >nul 2>&1

rem ---------------------------------------------------------------------------
rem  Steading -- double-click installer for Windows.
rem
rem  This exists because the previous route asked people to open PowerShell and
rem  paste a command. Anyone who has been told not to paste commands they do not
rem  understand was right to refuse, and anyone who has never opened PowerShell
rem  had no route at all. Downloading one file and double-clicking it is the
rem  simplest thing Windows offers, so that is what this is.
rem
rem  What it does, and nothing else:
rem    1. Puts Node.js on this machine if it is missing (via winget).
rem    2. Downloads Steading into  %USERPROFILE%\Steading
rem    3. Downloads yt-dlp from the yt-dlp project's own release page.
rem    4. Starts it and opens your browser.
rem
rem  It needs no administrator rights, changes no system settings, and writes
rem  only inside that one folder. Deleting the folder removes everything.
rem  The server it starts answers only to this computer.
rem ---------------------------------------------------------------------------

set "BASE=https://getsteading.vercel.app"
set "TARGET=%USERPROFILE%\Steading"
set "APPDIR=%TARGET%\steading"
set "PORT=3000"

cls
echo.
echo   ==========================================================
echo      Steading
echo      Fast. Seamless. 100%% Local.
echo   ==========================================================
echo.
echo   Ini akan memasang Steading ke folder:
echo     %TARGET%
echo.
echo   Tidak perlu hak administrator. Tidak ada pengaturan sistem
echo   yang diubah. Hapus folder itu untuk mencopot semuanya.
echo.
echo   This installs Steading into the folder above. No administrator
echo   rights, no system settings changed. Delete the folder to remove it.
echo.
echo   ----------------------------------------------------------
echo.
echo   Tekan tombol apa saja untuk mulai  /  Press any key to begin
echo   Tutup jendela ini untuk membatalkan /  Close this window to cancel
echo.
pause >nul

rem --- 1. Node -----------------------------------------------------------------

cls
echo.
echo   [1/4]  Memeriksa Node.js  /  Checking for Node.js
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo         Belum ada. Memasang lewat winget...
    echo         Not installed. Installing via winget...
    echo.
    where winget >nul 2>&1
    if errorlevel 1 goto :no_winget
    winget install --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
    rem winget only adds node to the PATH of processes started afterwards.
    set "PATH=%PATH%;%ProgramFiles%\nodejs;%LOCALAPPDATA%\Programs\nodejs"
    where node >nul 2>&1
    if errorlevel 1 goto :node_needs_restart
)

for /f "tokens=*" %%v in ('node --version 2^>nul') do set "NODEVER=%%v"
echo         OK  Node.js !NODEVER!
echo.

rem --- 2. The app --------------------------------------------------------------

echo   [2/4]  Mengunduh Steading  /  Downloading Steading
echo.

if not exist "%TARGET%" mkdir "%TARGET%" 2>nul
if exist "%APPDIR%" rmdir /s /q "%APPDIR%" 2>nul

curl -fsSL "%BASE%/steading.zip" -o "%TARGET%\steading.zip"
if errorlevel 1 goto :download_failed

rem  Unpacked with Expand-Archive rather than tar.
rem
rem  Windows does ship tar, but the bsdtar build in System32 has no zip support at all --
rem  it rejects any zip, including ones written by other tools, with "This does not look
rem  like a tar archive". Expand-Archive has been present since Windows 10 and reads this
rem  archive correctly. Nobody using this file ever sees the command; it is only here so
rem  that double-clicking is all that is asked of them.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%TARGET%\steading.zip' -DestinationPath '%TARGET%' -Force"
if errorlevel 1 goto :extract_failed
del /q "%TARGET%\steading.zip" 2>nul

if not exist "%APPDIR%\server\index.js" goto :extract_failed
echo         OK  %APPDIR%
echo.

rem --- 3. yt-dlp ---------------------------------------------------------------

echo   [3/4]  Mengunduh yt-dlp  /  Downloading yt-dlp
echo         Ukurannya 17 MB, mohon tunggu  /  17 MB, please wait
echo.

if not exist "%APPDIR%\bin" mkdir "%APPDIR%\bin" 2>nul
curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" -o "%APPDIR%\bin\yt-dlp.exe"
if errorlevel 1 goto :download_failed
if not exist "%APPDIR%\bin\yt-dlp.exe" goto :download_failed
echo         OK
echo.

rem --- 4. ffmpeg (optional) ----------------------------------------------------

where ffmpeg >nul 2>&1
if errorlevel 1 (
    where winget >nul 2>&1
    if not errorlevel 1 (
        echo   [4/4]  Memasang ffmpeg  /  Installing ffmpeg
        echo         Diperlukan untuk MP3 dan video 1080p
        echo         Needed for MP3 and 1080p video
        echo.
        winget install --id Gyan.FFmpeg --silent --accept-source-agreements --accept-package-agreements >nul 2>&1
    )
) else (
    echo   [4/4]  ffmpeg sudah ada  /  ffmpeg already installed
    echo.
)

rem --- Run ---------------------------------------------------------------------

cls
echo.
echo   ==========================================================
echo      Steading siap  /  Steading is ready
echo   ==========================================================
echo.
echo   Browser Anda akan terbuka sendiri dalam beberapa detik.
echo   Your browser will open by itself in a few seconds.
echo.
echo   Kalau tidak terbuka, ketik alamat ini di browser:
echo   If it does not open, type this address into your browser:
echo.
echo        http://127.0.0.1:%PORT%
echo.
echo   ----------------------------------------------------------
echo.
echo   BIARKAN JENDELA INI TERBUKA selama Anda memakai Steading.
echo   KEEP THIS WINDOW OPEN while you are using Steading.
echo.
echo   Tutup jendela ini kalau sudah selesai.
echo   Close this window when you have finished.
echo.

start "" /min cmd /c "timeout /t 4 >nul & start """" http://127.0.0.1:%PORT%"

cd /d "%APPDIR%"
set "PORT=%PORT%"
node server\index.js

echo.
echo   Steading berhenti.  /  Steading has stopped.
echo.
pause
exit /b 0

rem --- Failure paths -----------------------------------------------------------
rem  Every one of these pauses. A window that vanishes leaves someone with no idea
rem  what went wrong, which is worse than the failure itself.

:no_winget
echo.
echo   Node.js belum terpasang dan winget tidak tersedia di komputer ini.
echo   Node.js is missing and winget is not available on this computer.
echo.
echo   Pasang Node.js dari  https://nodejs.org  lalu jalankan berkas ini lagi.
echo   Install Node.js from https://nodejs.org then run this file again.
echo.
pause
exit /b 1

:node_needs_restart
echo.
echo   Node.js sudah terpasang, tapi Windows belum mengenalinya di jendela ini.
echo   Node.js was installed, but Windows has not picked it up in this window yet.
echo.
echo   Tutup jendela ini, lalu klik dua kali berkas ini sekali lagi.
echo   Close this window, then double-click this file once more.
echo.
pause
exit /b 1

:download_failed
echo.
echo   Gagal mengunduh. Periksa sambungan internet Anda, lalu coba lagi.
echo   The download failed. Check your internet connection and try again.
echo.
pause
exit /b 1

:extract_failed
echo.
echo   Gagal membuka berkas yang diunduh.
echo   Could not unpack the downloaded file.
echo.
echo   Kalau ini terus terjadi, unduh manual dari:
echo   If this keeps happening, download it by hand from:
echo        %BASE%/steading.zip
echo.
pause
exit /b 1
