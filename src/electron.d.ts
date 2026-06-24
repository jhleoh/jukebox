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

type ScanOptions = {
  pickFolder?: boolean
  forceScan?: boolean
}

type JukeboxApi = {
  scanLibrary: (options?: ScanOptions) => Promise<LibraryResult>
}

declare global {
  interface Window {
    jukeboxApi?: JukeboxApi
  }
}

export {}
