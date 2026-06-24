const { app, BrowserWindow, dialog, ipcMain, protocol } = require('electron')
const path = require('path')
const fs = require('fs/promises')
const fsSync = require('fs')
const { existsSync } = fsSync
const os = require('os')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'jukebox',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
])

const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.m4a',
  '.flac',
  '.wav',
  '.ogg',
  '.aac',
  '.wma',
  '.aiff',
  '.alac',
])

const DEFAULT_COVER = null
const playableTrackPaths = new Set()

function syncPlayableTrackPaths(tracks) {
  playableTrackPaths.clear()

  for (const track of tracks) {
    if (track?.filePath) {
      playableTrackPaths.add(path.resolve(track.filePath))
    }
  }
}

function createProtocolResponse(statusCode, message) {
  return new Response(message, {
    status: statusCode,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
    },
  })
}

function getAudioContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  const types = {
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.aac': 'audio/aac',
    '.wma': 'audio/x-ms-wma',
    '.aiff': 'audio/aiff',
    '.alac': 'audio/mp4',
  }

  return types[extension] || 'application/octet-stream'
}

function createTrackStreamResponse(request, resolvedPath) {
  const stats = fsSync.statSync(resolvedPath)
  const totalSize = stats.size
  const rangeHeader = request.headers.get('range')
  const contentType = getAudioContentType(resolvedPath)

  if (!rangeHeader) {
    return new Response(fsSync.createReadStream(resolvedPath), {
      status: 200,
      headers: {
        'content-type': contentType,
        'content-length': String(totalSize),
        'accept-ranges': 'bytes',
        'cache-control': 'no-store',
      },
    })
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim())
  if (!match) {
    return createProtocolResponse(416, 'Invalid range header')
  }

  let start = match[1] ? Number(match[1]) : 0
  let end = match[2] ? Number(match[2]) : totalSize - 1

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return createProtocolResponse(416, 'Invalid byte range')
  }

  if (!match[1] && match[2]) {
    const suffixLength = Number(match[2])
    start = Math.max(totalSize - suffixLength, 0)
    end = totalSize - 1
  }

  start = Math.max(0, Math.floor(start))
  end = Math.min(totalSize - 1, Math.floor(end))

  if (start > end || start >= totalSize) {
    return new Response('Range not satisfiable', {
      status: 416,
      headers: {
        'content-range': `bytes */${totalSize}`,
        'accept-ranges': 'bytes',
      },
    })
  }

  const chunkSize = end - start + 1
  return new Response(fsSync.createReadStream(resolvedPath, { start, end }), {
    status: 206,
    headers: {
      'content-type': contentType,
      'content-length': String(chunkSize),
      'content-range': `bytes ${start}-${end}/${totalSize}`,
      'accept-ranges': 'bytes',
      'cache-control': 'no-store',
    },
  })
}

function getCacheFilePath() {
  return path.join(app.getPath('userData'), 'library-cache.json')
}

async function readLibraryCache() {
  try {
    const filePath = getCacheFilePath()
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw)

    if (!parsed || !parsed.data || !parsed.rootPath) {
      return null
    }

    if (!Array.isArray(parsed.data.albums) || !Array.isArray(parsed.data.tracks)) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

async function writeLibraryCache(rootPath, data) {
  const payload = {
    rootPath,
    scannedAt: new Date().toISOString(),
    data,
  }

  const filePath = getCacheFilePath()
  await fs.writeFile(filePath, JSON.stringify(payload), 'utf8')
}

function getDefaultMusicPath() {
  const windowsMusic = path.join(os.homedir(), 'Music')
  if (existsSync(windowsMusic)) {
    return windowsMusic
  }

  return os.homedir()
}

async function collectAudioFiles(rootDir) {
  const files = []
  const stack = [rootDir]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) {
      continue
    }

    let entries = []
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }

      if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath)
      }
    }
  }

  return files
}

function toDataUrl(picture) {
  if (!picture || !picture.data) {
    return DEFAULT_COVER
  }

  const mime = picture.format || 'image/jpeg'
  const base64 = Buffer.from(picture.data).toString('base64')
  return `data:${mime};base64,${base64}`
}

function formatRating(ratingValue) {
  if (Array.isArray(ratingValue)) {
    return formatRating(ratingValue[0])
  }

  if (typeof ratingValue === 'number' && Number.isFinite(ratingValue)) {
    return `${Math.max(0, Math.min(5, ratingValue))}/5`
  }

  if (typeof ratingValue === 'string') {
    const trimmed = ratingValue.trim()
    if (!trimmed) {
      return null
    }

    if (/^\d+(\.\d+)?(\/\d+)?$/.test(trimmed)) {
      return trimmed.includes('/') ? trimmed : `${trimmed}/5`
    }

    return trimmed
  }

  if (ratingValue && typeof ratingValue === 'object') {
    if (typeof ratingValue.rating === 'number') {
      return `${Math.max(0, Math.min(5, ratingValue.rating))}/5`
    }

    if (typeof ratingValue.value === 'number') {
      return `${Math.max(0, Math.min(5, ratingValue.value))}/5`
    }

    if (typeof ratingValue.rating === 'string') {
      return ratingValue.rating
    }

    if (typeof ratingValue.value === 'string') {
      return ratingValue.value
    }
  }

  return null
}

async function scanMusicDirectory(rootPath) {
  const { parseFile } = await import('music-metadata')
  const audioFiles = await collectAudioFiles(rootPath)
  const albumMap = new Map()
  const tracks = []

  for (const filePath of audioFiles) {
    try {
      const metadata = await parseFile(filePath, { duration: true })
      const album = metadata.common.album || 'Unknown Album'
      const artist = metadata.common.albumartist || metadata.common.artist || 'Unknown Artist'
      const title = metadata.common.title || path.basename(filePath, path.extname(filePath))
      const key = `${artist}__${album}`
      const coverDataUrl = toDataUrl(metadata.common.picture?.[0])
      const trackNo = metadata.common.track?.no || null
      const rating = formatRating(metadata.common.rating)
      const durationSeconds = Number.isFinite(metadata.format.duration)
        ? Math.round(metadata.format.duration)
        : null

      if (!albumMap.has(key)) {
        albumMap.set(key, {
          id: key,
          album,
          artist,
          trackCount: 0,
          coverDataUrl,
        })
      }

      const entry = albumMap.get(key)
      entry.trackCount += 1
      if (!entry.coverDataUrl) {
        entry.coverDataUrl = coverDataUrl
      }

      tracks.push({
        id: filePath,
        title,
        artist,
        album,
        albumId: key,
        filePath,
        trackNo,
        durationSeconds,
        rating,
        coverDataUrl: coverDataUrl || entry.coverDataUrl || DEFAULT_COVER,
      })
    } catch {
      // Skip unreadable files and continue scanning.
    }
  }

  const albums = Array.from(albumMap.values()).sort((a, b) => {
    if (a.artist !== b.artist) {
      return a.artist.localeCompare(b.artist)
    }

    return a.album.localeCompare(b.album)
  })

  tracks.sort((a, b) => {
    if (a.artist !== b.artist) {
      return a.artist.localeCompare(b.artist)
    }

    if (a.album !== b.album) {
      return a.album.localeCompare(b.album)
    }

    const trackA = a.trackNo || Number.MAX_SAFE_INTEGER
    const trackB = b.trackNo || Number.MAX_SAFE_INTEGER
    if (trackA !== trackB) {
      return trackA - trackB
    }

    return a.title.localeCompare(b.title)
  })

  return {
    rootPath,
    fileCount: audioFiles.length,
    albumCount: albums.length,
    albums,
    tracks,
    cachePath: getCacheFilePath(),
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    title: 'Jukebox',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (process.argv.includes('--dev')) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

ipcMain.handle('jukebox:scanLibrary', async (_event, options = {}) => {
  const pickFolder = Boolean(options.pickFolder)
  const forceScan = Boolean(options.forceScan)
  const cached = await readLibraryCache()
  let rootPath = cached?.rootPath || getDefaultMusicPath()

  if (pickFolder) {
    const result = await dialog.showOpenDialog({
      title: 'Choose music folder',
      properties: ['openDirectory'],
      defaultPath: rootPath,
    })

    if (result.canceled || result.filePaths.length === 0) {
      if (cached?.data) {
        syncPlayableTrackPaths(cached.data.tracks)
        return {
          ...cached.data,
          cachePath: getCacheFilePath(),
        }
      }

      const fallback = await scanMusicDirectory(rootPath)
      await writeLibraryCache(rootPath, fallback)
      syncPlayableTrackPaths(fallback.tracks)
      return fallback
    }

    rootPath = result.filePaths[0]
  }

  if (!pickFolder && !forceScan && cached?.data) {
    syncPlayableTrackPaths(cached.data.tracks)
    return {
      ...cached.data,
      cachePath: getCacheFilePath(),
    }
  }

  const scanned = await scanMusicDirectory(rootPath)
  await writeLibraryCache(rootPath, scanned)
  syncPlayableTrackPaths(scanned.tracks)
  return scanned
})

app.whenReady().then(() => {
  protocol.handle('jukebox', async (request) => {
    try {
      const requestUrl = new URL(request.url)
      if (requestUrl.hostname !== 'track') {
        return createProtocolResponse(404, 'Resource not found')
      }

      const trackPath = requestUrl.searchParams.get('path')
      if (!trackPath) {
        return createProtocolResponse(400, 'Missing track path')
      }

      const resolvedPath = path.resolve(trackPath)
      if (!playableTrackPaths.has(resolvedPath)) {
        return createProtocolResponse(403, 'Track not allowed')
      }

      if (!existsSync(resolvedPath)) {
        return createProtocolResponse(404, 'Track file missing')
      }

      return createTrackStreamResponse(request, resolvedPath)
    } catch {
      return createProtocolResponse(500, 'Failed to read track')
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
