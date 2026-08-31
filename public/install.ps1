<#
  Steading -- Windows setup.

  What this does, in order, so nothing here is a surprise:

    1. Checks for Node.js. If it is missing it asks winget to install it.
    2. Downloads steading.zip from this site and unpacks it to %USERPROFILE%\Steading.
    3. Downloads yt-dlp.exe from the yt-dlp project's own GitHub release into that
       folder's bin\ directory. Nothing is installed system-wide.
    4. Offers ffmpeg through winget. Optional -- it is only needed for MP3 and for
       merging high-resolution YouTube video with its separate audio track.
    5. Starts the server and opens http://127.0.0.1:3000 in your browser.

  It does not touch your PATH, does not need administrator rights, and writes only
  inside %USERPROFILE%\Steading. To remove it later, delete that one folder.

  The server it starts listens on 127.0.0.1 only, so nothing is exposed to your network.
#>

$ErrorActionPreference = 'Stop'

$Base    = 'https://getsteading.vercel.app'
$Target  = Join-Path $env:USERPROFILE 'Steading'
$AppDir  = Join-Path $Target 'steading'
$Port    = if ($env:PORT) { $env:PORT } else { '3000' }

function Say([string]$text, [string]$colour = 'Gray') { Write-Host "  $text" -ForegroundColor $colour }

Write-Host ''
Write-Host '  Steading' -ForegroundColor Cyan -NoNewline
Write-Host '  ·  Fast. Seamless. 100% Local.'
Write-Host ''

# --- 1. Node -----------------------------------------------------------------

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Say 'Node.js is not installed. Asking winget to install it...' 'Yellow'
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Say 'winget is unavailable on this machine.' 'Red'
        Say 'Install Node.js manually from https://nodejs.org and run this again.' 'Red'
        Write-Host ''
        exit 1
    }
    winget install --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
    # winget puts node on PATH for new processes; refresh this one so the check below works.
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [Environment]::GetEnvironmentVariable('Path', 'User')
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
        Say 'Node.js was installed but is not on PATH yet.' 'Yellow'
        Say 'Close this window, open a new one, and run this command again.' 'Yellow'
        Write-Host ''
        exit 1
    }
}
Say "Node.js  $(& node --version)" 'Green'

# --- 2. The app --------------------------------------------------------------

New-Item -ItemType Directory -Force -Path $Target | Out-Null
$zip = Join-Path $Target 'steading.zip'

Say 'Downloading Steading...'
Invoke-WebRequest -Uri "$Base/steading.zip" -OutFile $zip -UseBasicParsing

if (Test-Path $AppDir) { Remove-Item -Recurse -Force $AppDir }
Expand-Archive -Path $zip -DestinationPath $Target -Force
Remove-Item -Force $zip
Say "Unpacked to  $AppDir" 'Green'

# --- 3. yt-dlp ---------------------------------------------------------------

$bin = Join-Path $AppDir 'bin'
New-Item -ItemType Directory -Force -Path $bin | Out-Null
$ytdlp = Join-Path $bin 'yt-dlp.exe'

Say 'Downloading yt-dlp from its official release...'
Invoke-WebRequest -Uri 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' `
                  -OutFile $ytdlp -UseBasicParsing
Say "yt-dlp   $(& $ytdlp --version)" 'Green'

# --- 4. ffmpeg (optional) ----------------------------------------------------

if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
    Say 'ffmpeg   already installed' 'Green'
} elseif (Get-Command winget -ErrorAction SilentlyContinue) {
    Say 'Installing ffmpeg (needed for MP3 and for merging 1080p video)...'
    try {
        winget install --id Gyan.FFmpeg --silent --accept-source-agreements --accept-package-agreements
        Say 'ffmpeg   installed' 'Green'
    } catch {
        Say 'ffmpeg could not be installed automatically.' 'Yellow'
        Say 'MP4 downloads still work; MP3 and 1080p merging will not.' 'Yellow'
    }
} else {
    Say 'ffmpeg is missing and winget is unavailable.' 'Yellow'
    Say 'MP4 downloads still work; MP3 and 1080p merging will not.' 'Yellow'
}

# --- 5. Run ------------------------------------------------------------------

Write-Host ''
Say 'Starting Steading...' 'Cyan'
Say "Your browser will open at http://127.0.0.1:$Port" 'Cyan'
Say 'Close this window when you are finished.' 'Gray'
Write-Host ''

Start-Job -ScriptBlock {
    param($url)
    Start-Sleep -Seconds 3
    Start-Process $url
} -ArgumentList "http://127.0.0.1:$Port" | Out-Null

Set-Location $AppDir
$env:PORT = $Port
& node server/index.js
