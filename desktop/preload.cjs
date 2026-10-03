'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const desktopBridge = Object.freeze({
  getVersion: () => ipcRenderer.invoke('pdfmaster:version'),
  takePendingFiles: () => ipcRenderer.invoke('pdfmaster:take-open-files'),
  saveFile: (filename, bytes) => ipcRenderer.invoke('pdfmaster:save-file', { filename, bytes }),
  onFilesAvailable: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('A file-open callback is required.');
    const listener = () => callback();
    ipcRenderer.on('pdfmaster:open-files-available', listener);
    return () => ipcRenderer.removeListener('pdfmaster:open-files-available', listener);
  },
});

contextBridge.exposeInMainWorld('pdfmasterDesktop', desktopBridge);
