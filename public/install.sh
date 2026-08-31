#!/bin/sh
#
# Steading -- setup for Termux, macOS and Linux.
#
# What this does, in order, so nothing here is a surprise:
#
#   1. Works out which of the three it is running on.
#   2. Installs Node.js, yt-dlp and ffmpeg using that system's own package manager
#      (pkg on Termux, Homebrew on macOS, apt/dnf/pacman on Linux).
#   3. Downloads steading.zip from this site and unpacks it to ~/Steading.
#   4. Starts the server on http://127.0.0.1:3000.
#
# It writes only inside ~/Steading. To remove it later, delete that one folder.
# The server listens on 127.0.0.1 only, so nothing is exposed to your network.

set -eu

BASE="https://getsteading.vercel.app"
TARGET="$HOME/Steading"
APPDIR="$TARGET/steading"
PORT="${PORT:-3000}"

say()  { printf '  %s\n' "$1"; }
warn() { printf '  %s\n' "$1" >&2; }
die()  { printf '\n  %s\n\n' "$1" >&2; exit 1; }

printf '\n  Steading  ·  Fast. Seamless. 100%% Local.\n\n'

# --- 1. Which system? --------------------------------------------------------

if [ -n "${PREFIX:-}" ] && [ -d "${PREFIX}" ] && command -v pkg >/dev/null 2>&1; then
  SYSTEM="termux"
elif [ "$(uname -s)" = "Darwin" ]; then
  SYSTEM="macos"
else
  SYSTEM="linux"
fi
say "System   $SYSTEM"

have() { command -v "$1" >/dev/null 2>&1; }

# --- 2. Dependencies ---------------------------------------------------------

install_termux() {
  say 'Installing Node.js, ffmpeg and yt-dlp through pkg...'
  pkg install -y nodejs ffmpeg python >/dev/null
  pip install --upgrade yt-dlp >/dev/null
}

install_macos() {
  have brew || die 'Homebrew is required. Install it from https://brew.sh and run this again.'
  say 'Installing Node.js, ffmpeg and yt-dlp through Homebrew...'
  brew install node ffmpeg yt-dlp >/dev/null
}

install_linux() {
  if have apt-get; then
    say 'Installing through apt...'
    sudo apt-get update -qq
    sudo apt-get install -y nodejs ffmpeg python3-pip >/dev/null
    pip3 install --user --upgrade yt-dlp >/dev/null
  elif have dnf; then
    say 'Installing through dnf...'
    sudo dnf install -y nodejs ffmpeg python3-pip >/dev/null
    pip3 install --user --upgrade yt-dlp >/dev/null
  elif have pacman; then
    say 'Installing through pacman...'
    sudo pacman -Sy --noconfirm nodejs ffmpeg yt-dlp >/dev/null
  else
    die 'No supported package manager found. Install nodejs, ffmpeg and yt-dlp, then run this again.'
  fi
}

case "$SYSTEM" in
  termux) install_termux ;;
  macos)  install_macos ;;
  linux)  install_linux ;;
esac

have node || die 'Node.js is still not on PATH. Open a new terminal and run this again.'
say "Node.js  $(node --version)"
if have yt-dlp; then say "yt-dlp   $(yt-dlp --version)"; else warn 'yt-dlp is not on PATH -- downloads will fail.'; fi
if have ffmpeg; then say 'ffmpeg   installed'; else warn 'ffmpeg is missing -- MP3 and 1080p merging will not work.'; fi

# --- 3. The app --------------------------------------------------------------

mkdir -p "$TARGET"
say 'Downloading Steading...'

if have curl; then
  curl -fsSL "$BASE/steading.zip" -o "$TARGET/steading.zip"
elif have wget; then
  wget -qO "$TARGET/steading.zip" "$BASE/steading.zip"
else
  die 'Neither curl nor wget is available.'
fi

rm -rf "$APPDIR"
if have unzip; then
  unzip -q -o "$TARGET/steading.zip" -d "$TARGET"
else
  # Termux sometimes ships without unzip, but Python is already there.
  python -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" \
    "$TARGET/steading.zip" "$TARGET"
fi
rm -f "$TARGET/steading.zip"
say "Unpacked to  $APPDIR"

# --- 4. Run ------------------------------------------------------------------

printf '\n  Starting Steading...\n'
printf '  Open  http://127.0.0.1:%s  in your browser.\n' "$PORT"
printf '  Press Ctrl-C when you are finished.\n\n'

if [ "$SYSTEM" = "termux" ] && have termux-open-url; then
  (sleep 3; termux-open-url "http://127.0.0.1:$PORT") >/dev/null 2>&1 &
elif [ "$SYSTEM" = "macos" ]; then
  (sleep 3; open "http://127.0.0.1:$PORT") >/dev/null 2>&1 &
elif have xdg-open; then
  (sleep 3; xdg-open "http://127.0.0.1:$PORT") >/dev/null 2>&1 &
fi

cd "$APPDIR"
PORT="$PORT" exec node server/index.js
