import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type Album = {
  id: string
  album: string
  artist: string
  trackCount: number
  coverDataUrl?: string
}

type Track = {
  id: string
  title: string
  artist: string
  album: string
  albumId: string
  filePath: string
  trackNo: number | null
  durationSeconds: number | null
  coverDataUrl?: string
}

type LibraryResult = {
  rootPath: string
  fileCount: number
  albumCount: number
  albums: Album[]
  tracks: Track[]
  cachePath: string
}

function formatTime(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '0:00'
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function App() {
  const [library, setLibrary] = useState<LibraryResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  const [queue, setQueue] = useState<Track[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.8)

  const audioRef = useRef<HTMLAudioElement>(null)

  const loadLibrary = useCallback(async (options: { pickFolder?: boolean; forceScan?: boolean }) => {
    if (!window.jukeboxApi) {
      setError('Desktop API unavailable. Start the app with Electron.')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const data = await window.jukeboxApi.scanLibrary(options)
      setLibrary(data)

      if (queue.length === 0 && data.tracks.length > 0) {
        setQueue(data.tracks)
        setQueueIndex(0)
      }
    } catch (scanError) {
      setError(
        scanError instanceof Error
          ? scanError.message
          : 'Failed to scan music library.',
      )
    } finally {
      setIsLoading(false)
    }
  }, [queue.length])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadLibrary({ pickFolder: false, forceScan: false })
    }, 0)

    return () => window.clearTimeout(id)
  }, [loadLibrary])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
    }
  }, [volume])

  const filteredAlbums = useMemo(() => {
    if (!library) {
      return []
    }

    const needle = query.trim().toLowerCase()
    if (!needle) {
      return library.albums
    }

    return library.albums.filter((album) => {
      return (
        album.album.toLowerCase().includes(needle) ||
        album.artist.toLowerCase().includes(needle)
      )
    })
  }, [library, query])

  const currentTrack = queue[queueIndex] || null
  const currentTrackId = currentTrack?.id
  const currentTrackFilePath = currentTrack?.filePath
  const totalDuration = Math.max(duration || currentTrack?.durationSeconds || 0, 0)
  const seekMax = Math.max(totalDuration, 1)
  const seekValue = Math.min(currentTime, seekMax)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    const onTimeUpdate = () => setCurrentTime(audio.currentTime)
    const onLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    }
    const onEnded = () => {
      if (queueIndex < queue.length - 1) {
        setQueueIndex((previous) => previous + 1)
      } else {
        setIsPlaying(false)
      }
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('ended', onEnded)

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('ended', onEnded)
    }
  }, [queue.length, queueIndex])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !currentTrackFilePath) {
      return
    }

    const src = `jukebox://track?path=${encodeURIComponent(currentTrackFilePath)}`
    audio.src = src
    audio.load()
    setCurrentTime(0)
    setDuration(currentTrack?.durationSeconds || 0)
  }, [currentTrack?.durationSeconds, currentTrackFilePath])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !currentTrackId) {
      return
    }

    if (isPlaying) {
      void audio.play().catch(() => {
        setIsPlaying(false)
      })
      return
    }

    audio.pause()
  }, [isPlaying, currentTrackId])

  const queueAlbum = (albumId: string) => {
    if (!library) {
      return
    }

    const tracks = library.tracks.filter((track) => track.albumId === albumId)
    if (tracks.length === 0) {
      return
    }

    setQueue(tracks)
    setQueueIndex(0)
    setIsPlaying(true)
  }

  const queueAllVisible = () => {
    if (!library) {
      return
    }

    const visibleAlbumIds = new Set(filteredAlbums.map((album) => album.id))
    const tracks = library.tracks.filter((track) => visibleAlbumIds.has(track.albumId))
    if (tracks.length === 0) {
      return
    }

    setQueue(tracks)
    setQueueIndex(0)
    setIsPlaying(true)
  }

  const playPrevious = () => {
    if (queueIndex > 0) {
      setQueueIndex((previous) => previous - 1)
      setIsPlaying(true)
    }
  }

  const playNext = () => {
    if (queueIndex < queue.length - 1) {
      setQueueIndex((previous) => previous + 1)
      setIsPlaying(true)
    }
  }

  const togglePlayPause = () => {
    if (!currentTrack) {
      return
    }

    setIsPlaying((previous) => !previous)
  }

  const handleSeek = (value: number) => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    audio.currentTime = value
    setCurrentTime(value)
  }

  return (
    <main className="app-shell">
      <audio ref={audioRef} preload="metadata" />

      <header className="title-bar">
        <div>
          <p className="caption">Local Music Dashboard</p>
          <h1>Jukebox</h1>
        </div>
        <div className="toolbar">
          <input
            aria-label="Search albums"
            className="search"
            placeholder="Search album or artist"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            type="button"
            className="accent"
            onClick={() => void loadLibrary({ pickFolder: true, forceScan: true })}
            disabled={isLoading}
          >
            Choose Folder
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => void loadLibrary({ pickFolder: false, forceScan: true })}
            disabled={isLoading}
          >
            Refresh
          </button>
          <button
            type="button"
            className="secondary"
            onClick={queueAllVisible}
            disabled={isLoading || filteredAlbums.length === 0}
          >
            Play Visible
          </button>
        </div>
      </header>

      <section className="stats">
        <article>
          <span>Library Path</span>
          <strong>{library?.rootPath ?? 'Loading default Music folder...'}</strong>
        </article>
        <article>
          <span>Music Files</span>
          <strong>{library?.fileCount ?? 0}</strong>
        </article>
        <article>
          <span>Albums</span>
          <strong>{library?.albumCount ?? 0}</strong>
        </article>
        <article>
          <span>Queue</span>
          <strong>{queue.length} tracks</strong>
        </article>
      </section>

      {error ? <p className="error">{error}</p> : null}

      {isLoading ? <p className="loading">Scanning your music files...</p> : null}

      <section className="content-grid">
        <section className="album-grid" aria-live="polite">
          {filteredAlbums.map((album) => (
            <article
              key={album.id}
              className="album-card"
              onDoubleClick={() => queueAlbum(album.id)}
              title="Double-click to queue and play this album"
            >
              {album.coverDataUrl ? (
                <img src={album.coverDataUrl} alt={`${album.album} cover art`} />
              ) : (
                <div className="placeholder" aria-hidden="true">
                  {album.album.slice(0, 1).toUpperCase()}
                </div>
              )}
              <h2>{album.album}</h2>
              <p>{album.artist}</p>
              <small>
                {album.trackCount} track{album.trackCount === 1 ? '' : 's'}
              </small>
              <button
                type="button"
                className="tiny"
                onClick={(event) => {
                  event.stopPropagation()
                  queueAlbum(album.id)
                }}
              >
                Play Album
              </button>
            </article>
          ))}
        </section>

        <aside className="side-panel">
          <section className="now-playing">
            <h3>Now Playing</h3>
            {currentTrack ? (
              <>
                <div className="track-meta">
                  {currentTrack.coverDataUrl ? (
                    <img src={currentTrack.coverDataUrl} alt={`${currentTrack.album} cover`} />
                  ) : (
                    <div className="placeholder small" aria-hidden="true">
                      {currentTrack.album.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <strong>{currentTrack.title}</strong>
                    <p>{currentTrack.artist}</p>
                    <p>{currentTrack.album}</p>
                  </div>
                </div>

                <div className="controls-row">
                  <button type="button" onClick={playPrevious} disabled={queueIndex === 0}>
                    Previous
                  </button>
                  <button type="button" className="accent" onClick={togglePlayPause}>
                    {isPlaying ? 'Pause' : 'Play'}
                  </button>
                  <button
                    type="button"
                    onClick={playNext}
                    disabled={queueIndex >= queue.length - 1}
                  >
                    Next
                  </button>
                </div>

                <div className="seek-wrap">
                  <span>{formatTime(currentTime)}</span>
                  <input
                    type="range"
                    min={0}
                    max={seekMax}
                    step={1}
                    value={seekValue}
                    onChange={(event) => handleSeek(Number(event.target.value))}
                    disabled={!currentTrack || totalDuration <= 0}
                  />
                  <span>{formatTime(totalDuration)}</span>
                </div>

                <label className="volume">
                  Volume
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={volume}
                    onChange={(event) => setVolume(Number(event.target.value))}
                  />
                </label>
              </>
            ) : (
              <p className="empty">Pick an album to start playback.</p>
            )}
          </section>

          <section className="queue-panel">
            <h3>Playlist Queue</h3>
            <ul>
              {queue.map((track, index) => (
                <li key={track.id}>
                  <button
                    type="button"
                    className={index === queueIndex ? 'queue-item active' : 'queue-item'}
                    onClick={() => {
                      setQueueIndex(index)
                      setIsPlaying(true)
                    }}
                  >
                    <span>{track.title}</span>
                    <small>{track.artist}</small>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </section>

      {!isLoading && library && filteredAlbums.length === 0 ? (
        <p className="empty">No albums found for this search.</p>
      ) : null}
    </main>
  )
}

export default App
