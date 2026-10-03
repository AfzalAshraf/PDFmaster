'use strict';

const { app, BrowserWindow, dialog, ipcMain, protocol, shell } = require('electron');
const { readFile, writeFile, stat } = require('node:fs/promises');
const path = require('node:path');

const APP_SCHEME = 'app';
const APP_HOST = 'pdfmaster';
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
const APP_URL = `${APP_ORIGIN}/index.html`;
const MAX_OPEN_FILES_PER_BATCH = 40;
const OPENABLE_EXTENSIONS = new Set([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
  '.avif',
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.tsv',
  '.log',
  '.json',
  '.xml',
  '.html',
  '.htm',
  '.docx',
  '.xlsx',
  '.xls',
  '.pptx',
]);
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream',
  '.icc': 'application/octet-stream',
};

// Give the private, local-only app origin browser features needed by pdf.js,
// OCR workers, and the PWA cache while keeping Node APIs out of the renderer.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      allowServiceWorkers: true,
      codeCache: true,
    },
  },
]);

const hasSingleInstanceLock = app.requestSingleInstanceLock();
let mainWindow = null;
let pendingOpenPaths = [];

function isOpenablePath(candidate) {
  if (typeof candidate !== 'string' || !path.isAbsolute(candidate)) return false;
  const normalized = candidate.toLowerCase();
  return normalized.endsWith('.pdfmaster.json') || OPENABLE_EXTENSIONS.has(path.extname(normalized));
}

function pathsFromArguments(args) {
  return args.filter((candidate) => isOpenablePath(candidate));
}

function enqueueOpenPaths(paths) {
  const accepted = paths.filter((candidate) => isOpenablePath(candidate));
  if (!accepted.length) return;
  pendingOpenPaths = [...pendingOpenPaths, ...accepted].slice(-MAX_OPEN_FILES_PER_BATCH);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pdfmaster:open-files-available');
  }
}

function trustedRenderer(event) {
  try {
    const senderUrl = new URL(event.senderFrame.url);
    return senderUrl.protocol === `${APP_SCHEME}:` && senderUrl.hostname === APP_HOST;
  } catch {
    return false;
  }
}

function requireTrustedRenderer(event) {
  if (!trustedRenderer(event)) throw new Error('Blocked an IPC request from an untrusted page.');
}

async function registerAppProtocol() {
  const root = path.resolve(app.getAppPath(), 'dist');

  protocol.handle(APP_SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== APP_HOST) return new Response('Not found', { status: 404 });

      const pathname = decodeURIComponent(url.pathname || '/');
      const relativePath = pathname === '/' ? '/index.html' : pathname;
      const filePath = path.resolve(root, `.${relativePath}`);
      if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
        return new Response('Forbidden', { status: 403 });
      }

      const contents = await readFile(filePath);
      const extension = path.extname(filePath).toLowerCase();
      return new Response(contents, {
        headers: {
          'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch (error) {
      if (error && error.code !== 'ENOENT' && error.code !== 'ENOTDIR') {
        console.error('PDFmaster local asset error:', error);
      }
      return new Response('Not found', { status: 404 });
    }
  });
}

function safeDownloadName(filename) {
  const base = path.basename(String(filename || 'document.pdf'));
  const cleaned = base.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim();
  return cleaned || 'document.pdf';
}

function bufferFromPayload(payload) {
  if (payload instanceof ArrayBuffer) return Buffer.from(payload);
  if (ArrayBuffer.isView(payload)) {
    return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
  }
  throw new TypeError('The export data was not a byte buffer.');
}

ipcMain.handle('pdfmaster:version', (event) => {
  requireTrustedRenderer(event);
  return app.getVersion();
});

ipcMain.handle('pdfmaster:take-open-files', async (event) => {
  requireTrustedRenderer(event);
  const paths = pendingOpenPaths.splice(0, MAX_OPEN_FILES_PER_BATCH);
  const files = [];
  for (const filePath of paths) {
    try {
      const details = await stat(filePath);
      if (!details.isFile()) continue;
      const contents = await readFile(filePath);
      files.push({ name: path.basename(filePath), bytes: Uint8Array.from(contents) });
    } catch (error) {
      console.warn(`PDFmaster could not open ${path.basename(filePath)}:`, error);
    }
  }
  return files;
});

ipcMain.handle('pdfmaster:save-file', async (event, request) => {
  requireTrustedRenderer(event);
  const filename = safeDownloadName(request?.filename);
  const contents = bufferFromPayload(request?.bytes);
  const extension = path.extname(filename).replace(/^\./, '') || 'pdf';
  const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
    title: 'Save file',
    defaultPath: path.join(app.getPath('documents'), filename),
    filters: [{ name: `${extension.toUpperCase()} files`, extensions: [extension] }],
  });
  if (result.canceled || !result.filePath) return false;
  await writeFile(result.filePath, contents);
  return true;
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#16171a',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const protocolName = new URL(url).protocol;
      if (protocolName === 'https:' || protocolName === 'http:') void shell.openExternal(url);
    } catch {
      // Reject malformed or non-web links rather than handing them to the OS.
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${APP_ORIGIN}/`)) event.preventDefault();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(APP_URL);
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    enqueueOpenPaths(pathsFromArguments(argv.slice(1)));
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    enqueueOpenPaths([filePath]);
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.pdfmaster.desktop');
    await registerAppProtocol();
    createWindow();
    enqueueOpenPaths(pathsFromArguments(process.argv.slice(1)));

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
