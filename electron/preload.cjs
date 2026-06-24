const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('jukeboxApi', {
  scanLibrary: (options = {}) => ipcRenderer.invoke('jukebox:scanLibrary', options),
})
