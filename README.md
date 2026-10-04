# PDFmaster

**A local-first PDF editor for the browser and Windows desktop.**

PDFmaster is an Acrobat-style workspace for reading, editing, annotating, signing, protecting,
OCRing and converting PDFs. Use it in a browser/PWA or install the same React interface as a
standalone Windows app. There is no document server or upload step: files are processed on your
computer, making it suitable for confidential work and offline use. PDFmaster is an independent,
MIT-licensed project—not an Adobe product or a promise of complete Acrobat feature parity.

```
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production bundle in dist/
npm test         # unit + UI smoke tests
```

## Windows desktop app

The Windows build packages the existing interface in a hardened Electron shell; no HTML editing,
separate backend, C++ toolchain or Python runtime is needed. It offers a per-user setup wizard and a
portable x64 `.exe`. The app uses its own local origin, native save dialogs, opens PDFs from Explorer,
and keeps documents on the device.

After a Windows release has been published, the easiest verified installer is:

```powershell
irm https://raw.githubusercontent.com/AfzalAshraf/PDFmaster/main/scripts/install-windows.ps1 | iex
```

The script downloads the latest GitHub Release installer, checks its published SHA-256 checksum,
then opens the setup wizard. To download and run the installer directly with `curl.exe` instead:

```powershell
curl.exe -fL https://github.com/AfzalAshraf/PDFmaster/releases/latest/download/PDFmaster-Setup.exe -o "$env:TEMP\PDFmaster-Setup.exe"
Start-Process -FilePath "$env:TEMP\PDFmaster-Setup.exe" -Wait
```

Direct download skips the script's checksum verification. Windows builds are not code-signed yet, so
SmartScreen may show an unfamiliar-publisher warning. Merging a new version of `package.json` to
`main` automatically builds and publishes that version's installer; pushing a matching `v*` tag also
works. After the first successful release, the curl installer link will work. To build locally on
Windows, run `npm ci` then `npm run desktop:win`; outputs go to `desktop-dist/`. `npm run desktop`
builds the web assets and launches the desktop shell.

---

## What it does

### Read & navigate
- Continuous page view with lazy rendering, real pdf.js text layer (selectable + searchable text).
- Page thumbnails, bookmarks (plus import of the PDF's own outline), attachments, comments and
  a full search panel with case/whole-word options and hit navigation (F3 / Shift+F3).
- Fit width, fit page, zoom presets, Ctrl+scroll zoom, space-drag panning, command palette (Ctrl+K).

### Edit
- **Edit existing text** in place: click a line of text, type the replacement. The original font,
  size, colour and position are preserved because the run is rewritten inside the content stream.
  Editing also works on PDFs that already carry an *invisible* OCR text layer (scans, including files
  exported by PDFmaster's own OCR): the replacement covers the scanned word with a background box and
  re-draws it as visible, searchable text, and the export resets any inherited invisible
  text-rendering state so the replacement cannot be hidden. Re-editing a line repeatedly stays
  active (the newest replacement wins), and the replacement font is matched from the original
  font's metadata on a best-effort basis.
- **Add text boxes** with the standard-14 fonts or DejaVu (auto-embedded for non-Latin text),
  bold/italic/alignment/auto-wrap controls, and inline editing directly on the page.
- **Images**: insert, replace, move, resize, rotate; WebP/GIF/SVG/BMP are re-encoded automatically.
- **Shapes**: rectangles, ellipses, lines, arrows, polygons and clouds, with dashed strokes and fills.
- **Freehand ink**, including a translucent highlighter pen; strokes are simplified for clean output.
- **Undo/redo** for every document change (80 steps), with `Ctrl+Z` / `Ctrl+Shift+Z`.

### Annotate & comment
- Highlights, underlines, strikethrough and squiggly underlines that snap to real text runs
  (quadrilaterals, so rotated text still highlights correctly).
- Sticky notes with threaded replies, statuses (open/resolved) and a comments panel.
- Stamps (Approved / Confidential / Draft / … plus custom text), signatures, links and measurements.
- Markup is exported as **real PDF annotations** where the format allows it, so Acrobat/Preview
  readers show them in their comment pane.

### Organise
- Reorder by drag-and-drop, rotate, duplicate, delete/restore, extract, split (every N pages,
  custom ranges or one file per page) and merge — page entries are an indirection over the source
  documents, so all of this is instant and non-destructive.
- Crop, reverse order, insert blank pages, insert pages from other files, documents with mixed
  source sizes and rotations.

### Protect
- **True redaction**: draw boxes, press *Apply*, and the covered text is removed from the content
  stream (not merely painted over) when the PDF is exported.
- AES-256 (also AES-128 / RC4) encryption with separate user and owner passwords and granular
  permissions (printing, copying, modifying, annotating, forms, accessibility, assembly).
- **Digital signatures**: sign the exported bytes with a PKCS#12 certificate (PAdES-style detached
  PKCS#7 signature, SHA-256) and optionally draw a signature appearance on the page.
- Metadata sanitising (title/author/subject/keywords, comments, bookmarks, attachments).

### Forms
- Create text fields, checkboxes, radio groups, dropdown lists and push buttons by dragging on the
  page; exported as native AcroForm widgets with names, defaults, required flags and choices.
- Fill existing fields (pdf.js renders widget annotations), flatten on export when you want them
  baked in.

### OCR
- Recognise text in scans with tesseract.js — 18 languages, progress in the status bar.
- The recognised words are converted to PDF space and written as an **invisible text layer** on
  export, so the page looks identical but becomes searchable and copyable. Language data is cached
  by the service worker for offline reuse.
- **Replace recognised words** directly from the OCR panel: on export each matching word is covered
  with a box sampled from the surrounding background and re-drawn as visible, searchable text (the
  replaced word is skipped in the invisible layer). This is a *visual overlay* — the original image
  pixels remain in the file, so it is not secure redaction; use the redaction tool to delete content.

### Convert & export
- PDF, PDF/A-2b (metadata + embedded fonts), flattened PDF.
- PNG, JPEG, WebP, SVG (raster-in-vector) — multi-page exports arrive as a ZIP.
- Text, Markdown, HTML, CSV, JSON.
- Word (.docx), PowerPoint (.pptx) and Excel (.xlsx) — written as minimal OOXML through JSZip, so
  there is no heavyweight Office dependency in the bundle.
- Split exports (multi-file ZIP) and print via a temporary PDF fed to the browser's print dialog.
- The export dialog's **file name is editable**, and after exporting a status banner reports applied
  vs failed text edits (with per-page reasons), redacted runs and replaced OCR words. A failed save
  (blocked download / cancelled save dialog) keeps the dialog open with the error.

### Platform
- Installable PWA for the browser plus a Windows x64 desktop installer and portable `.exe` built
  from the same interface; the desktop installer is created by GitHub Actions on version tags.
- Native desktop save dialogs, PDF file association/open-from-Explorer support, and a minimal,
  context-isolated Electron bridge. The renderer has no Node.js access.
- Autosave to IndexedDB with crash/first-run recovery, recent documents list, editable project
  files (`.pdfmaster.json`) that survive a reload with all sources embedded.
- Dark and light themes, keyboard shortcuts for everything, accessible focus states.

---

## Architecture

```
src/
  core/            framework-free engine (no React, no DOM assumptions where avoidable)
    types.ts       domain model: pages, objects, assets, settings
    geometry.ts    matrix maths, rotation, hit-testing, colour parsing
    pdfjs.ts       pdf.js loading + runtime asset URLs (cmaps, fonts, wasm, iccs)
    pdflib.ts      pdf-lib wrapper: font resolution, standard-14 helpers, wrapping
    draw.ts        every annotation/image/shape is painted here into a pdf-lib page
    engine.ts      buildPdf(): pages + edits + overlays + forms + security -> PDF bytes
    annotations.ts real /Annots dictionaries, document JavaScript, signature fields
    textedit.ts    content-stream parsing: text replacement (incl. invisible OCR
                   text layers + repeated edits) and redaction
    fonts.ts       lazy DejaVu loading/embedding for Unicode and PDF/A output
    ocr.ts         tesseract.js worker, word rectangles in PDF space, word
                   replacement + background sampling
    signing.ts     PKCS#12 inspection and PAdES signing
    exporter.ts    every export format (raster, text, OOXML, JSON, split ZIP)
    importers.ts   any file -> PDF source (Office/text/HTML/images/PDF)
    assets.ts      image normalisation (canvas re-encode) and sizing
    registry.ts    pdf.js document/page cache, text extraction, search, thumbnails
    security.ts    URL sanitising, escaping, password strength
    storage.ts     IndexedDB session, recent files and preferences
  state/           zustand stores: document (undo/redo) and UI (panels, tools, dialogs)
  ui/              the Acrobat-style workspace: menu bar, toolbar, rails, panels, dialogs
  hooks/           keyboard shortcuts, theme
desktop/
  main.cjs         hardened Electron window, app:// asset origin, native open/save and PDF file handling
  preload.cjs      small, allow-listed desktop bridge (no renderer Node access)
  build/icon.ico   Windows application/installer icon
scripts/
  install-windows.ps1  downloads the latest release and verifies its SHA-256 before setup
```

### Design decisions worth knowing

| Decision | Why |
| --- | --- |
| Pages are an **indirection** (`PageEntry` → source page) instead of eagerly rebuilt PDFs | Reorder, rotate, delete, duplicate and mixed-source merges are O(1) and instantly undoable |
| Objects live in **PDF user space** (y-up) and are transformed by the pdf.js viewport | Rotation, cropping and arbitrary zoom work without special cases |
| Binary payloads live in a separate **asset table** | Undo snapshots stay small and cheap to clone |
| One built PDF feeds every export format | The on-screen document and the exported file can never disagree |
| Standard-14 fonts by default, DejaVu on demand | Small files, but full Unicode and PDF/A when required |
| Office formats are hand-written OOXML | No 1 MB+ dependency, predictable output |
| Redaction rewrites the content stream | Removing pixels-only would leave the text extractable |

### Limits (honest ones)

- Editing text inside a PDF works on the Unicode text layer: runs whose glyph encoding cannot be
  mapped back to Unicode are reported as failed rather than corrupted.
- Encryption protects the **exported** file; the in-memory working copy and local autosave are not encrypted by that setting.
- Digital signatures are applied to the exported bytes — the in-app copy keeps changing until you
  export.
- Office exports reproduce text and page structure, not pixel-perfect layout.

---

## Privacy

No accounts, telemetry, document-upload endpoint or PDF server: editing and exports run on your
computer. The UI, pdf.js assets and fonts ship with the app. OCR downloads the selected Tesseract
language data the first time it is used; Tesseract caches it locally for later use. Regular PDF
editing does not need a network connection.

## License

MIT — see `LICENSE`. Bundled assets keep their own licences: DejaVu fonts (Bitstream Vera/DejaVu),
pdf.js (Apache-2.0), pdf-lib (MIT), tesseract.js (Apache-2.0), @signpdf (MIT), node-forge
(BSD-3-Clause), JSZip (MIT), lucide (ISC).
