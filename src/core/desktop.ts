export interface DesktopFile {
  name: string;
  bytes: Uint8Array;
}

/** Narrow, optional bridge exposed by the Electron preload in the desktop build. */
export interface PdfmasterDesktopBridge {
  getVersion: () => Promise<string>;
  takePendingFiles: () => Promise<DesktopFile[]>;
  saveFile: (filename: string, bytes: ArrayBuffer) => Promise<boolean>;
  onFilesAvailable: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    pdfmasterDesktop?: PdfmasterDesktopBridge;
  }
}

export function getDesktopBridge(): PdfmasterDesktopBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.pdfmasterDesktop;
}
