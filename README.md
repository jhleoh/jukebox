# Jukebox (Windows Desktop Music Dashboard)

Jukebox is a local desktop app for Windows that scans your music folder and shows albums in an iTunes-style grid.

## Features

- Standalone Windows desktop app (Electron)
- Scans your default Music folder automatically
- Optional folder picker to scan any music library location
- Album dashboard with cover art, artist, and track counts
- Search by album or artist

## Run in development

1. Install dependencies:

   npm install

2. Start desktop app with live reload:

   npm run electron:dev

## Build standalone Windows installer

1. Build renderer + package app:

   npm run dist

2. Output files are in the dist folder, including:

   - Jukebox Setup 0.0.0.exe
   - win-unpacked/Jukebox.exe

## Supported audio extensions

.mp3, .m4a, .flac, .wav, .ogg, .aac, .wma, .aiff, .alac
