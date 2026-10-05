import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'node:path';
import fs from 'node:fs';
import type { ServerResponse } from 'node:http';

const PDFJS_DIR = path.resolve(__dirname, 'node_modules/pdfjs-dist');

/**
 * pdf.js ships a worker, character maps, standard-font data, ICC profiles and
 * wasm image decoders as runtime assets. They are copied verbatim into the
 * build so the editor works fully offline (and inside the offline PWA cache).
 */
const pdfjsAssets = [
  { src: 'node_modules/pdfjs-dist/cmaps', dest: 'pdfjs/cmaps' },
  { src: 'node_modules/pdfjs-dist/standard_fonts', dest: 'pdfjs/standard_fonts' },
  { src: 'node_modules/pdfjs-dist/wasm', dest: 'pdfjs/wasm' },
  { src: 'node_modules/pdfjs-dist/iccs', dest: 'pdfjs/iccs' },
  { src: 'node_modules/pdfjs-dist/image_decoders', dest: 'pdfjs/image_decoders' },
  {
    // Embedded fallback fonts (DejaVu) used for Unicode text and PDF/A output.
    src: 'node_modules/dejavu-fonts-ttf/ttf/*.ttf',
    dest: 'fonts',
  },
];

const MIME: Record<string, string> = {
  '.bcmap': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.pfb': 'application/octet-stream',
  '.icc': 'application/octet-stream',
  '.json': 'application/json',
};

/**
 * In dev the pdf.js runtime assets live in node_modules; serve them under the
 * same `/pdfjs/*` paths the production build uses so dev and prod behave
 * identically without duplicating multi-megabyte files into the repo.
 */
function uniqueExportName(raw: string): string {
  const base = path
    .basename(raw)
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return base || 'document.pdf';
}

/** Dev-only save target. Preview iframes often swallow blob downloads; a same-origin file does not. */
function saveCopyDevServer(): Plugin {
  const dir = path.resolve(__dirname, 'exports');
  return {
    name: 'pdfmaster:save-copy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/save-copy', (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        req.on('end', () => {
          try {
            const body = Buffer.concat(chunks);
            const header = req.headers['x-filename'];
            const requested = (Array.isArray(header) ? header[0] : header) || 'document.pdf';
            const name = uniqueExportName(requested);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, name), body);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ url: `/exports/${encodeURIComponent(name)}`, filename: name, bytes: body.length }));
          } catch {
            res.statusCode = 500;
            res.end('could not store the file');
          }
        });
        req.on('error', () => {
          if (!res.headersSent) {
            res.statusCode = 400;
            res.end('bad upload');
          }
        });
      });
      server.middlewares.use('/exports', (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          next();
          return;
        }
        const rel = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '');
        const name = path.basename(rel);
        const file = path.resolve(dir, name);
        if (name !== rel || !file.startsWith(dir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.statusCode = 404;
          res.end('not found');
          return;
        }
        const ext = path.extname(file).toLowerCase();
        const type =
          ext === '.pdf'
            ? 'application/pdf'
            : ext === '.json'
              ? 'application/json'
              : ext === '.zip'
                ? 'application/zip'
                : 'application/octet-stream';
        res.setHeader('Content-Type', type);
        res.setHeader('Cache-Control', 'no-store');
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

function pdfjsDevAssets(): Plugin {
  return {
    name: 'pdfmaster:pdfjs-dev-assets',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res: ServerResponse, next) => {
        const rel = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '');
        const file = path.resolve(PDFJS_DIR, rel);
        if (!file.startsWith(PDFJS_DIR)) {
          res.statusCode = 403;
          res.end('forbidden');
          return;
        }
        fs.stat(file, (err, stat) => {
          if (err || !stat.isFile()) {
            next();
            return;
          }
          res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
          res.setHeader('Cache-Control', 'public, max-age=3600');
          fs.createReadStream(file).pipe(res);
        });
      });
    },
  };
}

export default defineConfig({
  // Keep generated asset URLs relative so the same Vite build works from the
  // desktop app's private `app://` origin as well as a normal web server.
  base: './',
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['pdfjs-dist'] },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // Order matters: react must not be pulled into `vendor`, otherwise
          // rollup reports a circular chunk graph (vendor -> react -> vendor).
          if (id.includes('react-dom') || /node_modules[\\/](react|scheduler|use-sync-external-store)[\\/]/.test(id)) return 'react';
          if (id.includes('pdfjs-dist')) return 'pdfjs';
          if (id.includes('@cantoo') || id.includes('fontkit')) return 'pdf-lib';
          if (id.includes('tesseract')) return 'ocr';
          if (id.includes('node-forge') || id.includes('@signpdf')) return 'signing';
          return 'vendor';
        },
      },
    },
  },
  plugins: [
    react(),
    pdfjsDevAssets(),
    saveCopyDevServer(),
    viteStaticCopy({ targets: pdfjsAssets }),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'PDFmaster — PDF Editor',
        short_name: 'PDFmaster',
        description:
          'Professional client-side PDF editor: annotate, edit, sign, protect, OCR, organize and convert PDFs. Nothing ever leaves your device.',
        theme_color: '#202124',
        background_color: '#16171a',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,bcmap,wasm}'],
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /\/fonts\/.*\.(ttf|otf)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'embedded-fonts',
              expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /\.traineddata(\.gz)?$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ocr-language-data',
              expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
