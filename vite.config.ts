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
