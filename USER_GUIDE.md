# PDFmaster user guide

PDFmaster runs locally in a browser/PWA or the standalone Windows desktop app. There is no sign-in,
no document upload and no PDF server. Closing the app discards the in-memory working document unless
you exported it or autosave recovered it (see *Recovering your work*).

---

## 1. Opening a document

| Action | How |
| --- | --- |
| Open a PDF | **File ▸ Open…**, the **Open PDF** button, `Ctrl+O`, or drag a file onto the window |
| Add pages to the current document | **File ▸ Add pages from file…**, or drag the file onto a specific page |
| Convert something else into PDF | Open any image, `.txt`, `.md`, `.csv`, `.json`, `.xml`, `.html`, `.docx`, `.xlsx` or `.pptx` |
| Start from scratch | **File ▸ New blank document…** (choose A4/Letter/… or a custom size) |
| Reopen a previous session | The recent documents list on the home screen, or `Ctrl+O` for an autosaved session |

Password-protected PDFs prompt for the password. Autosave, when enabled, is stored locally but is not encrypted—see *Recovering your work* before using a shared device.

## 2. Finding your way around the workspace

- **Menu bar** — every command, grouped like Acrobat: File, Edit, View, Document, Comments, Forms,
  Protect, Tools, Help.
- **Toolbar** — tool groups on the left (Select, Edit, Comment, Stamp, Forms, Protect, Tools) with
  fly-outs for the variants, contextual controls in the middle (colour, width, font, opacity), page
  actions and Save/Export on the right.
- **Tool rail** — one click per tool; panels for thumbnails, bookmarks, comments, attachments and
  search sit underneath.
- **Right panel** — Quick tools, Properties (context-sensitive per object), Organise pages, Forms,
  Protect, Export presets, Metadata, Sign, OCR, Optimise.
- **Floating page bar** — first/previous/next/last, jump to a page number, zoom presets, fit
  width/page.
- **Status bar** — active tool hint, selection and page information, autosave state, offline badge.
- **Command palette** — `Ctrl+K`, then type: every command and tool is searchable.

## 3. Editing

**Existing text:** choose **Edit text** (`E`) and click a line. The original font, size and colour
are kept; the replacement is written into the page's content stream. Runs that cannot be mapped back
to Unicode are reported in a toast instead of being silently corrupted.

**New text:** choose **Add text** (`T`), click where you want it, and type. Esc commits. The toolbar
carries font, size, bold/italic, alignment, colour and auto-wrap; the Properties panel lets you fine
tune position, rotation and opacity numerically.

**Images:** **Insert image** (`I`) then click, or drag an image file onto the page. Any browser
renderable format is re-encoded automatically. Use the Properties panel to switch between
*Keep aspect ratio* and *Stretch*, or to replace the picture.

**Shapes:** rectangle, ellipse, line, arrow, polygon and cloud, with fills and dashed strokes.
**Ink:** freehand with optional highlighter mode; strokes are simplified so exports stay light.

**Undo/redo** covers every document change — `Ctrl+Z` / `Ctrl+Shift+Z`. Panels, zoom and selections
never enter the undo stack.

## 4. Commenting and reviewing

Pick a markup tool (**Highlight** `U`, Underline, Strikethrough, Squiggly), drag across the text,
and the highlight follows the real text run — even on rotated pages. Sticky notes (`N`) open the
Comments panel, where each note is a thread you can reply to, resolve or delete.

Stamps ship with Approved / Confidential / Draft and friends, plus custom text. Links and
measurements are in the same toolbar group. On export, comments become real PDF annotations where
possible, so Acrobat and Preview show them in their comment pane.

## 5. Organising pages

- **Thumbnails panel** — drag to reorder, hover for rotate/delete, shift-click to select several and
  use the bulk bar (delete, rotate, duplicate).
- **Organise pages panel** — a compact grid with the same drag/selection behaviour, plus *Move to
  start*, *Reverse*, *Extract* (saves the selected pages as a PDF) and *Split document…*.
- **Document menu** — insert pages from a file, insert a blank page, rotate, delete, crop, watermark,
  header/footer, page numbers, Bates numbering, reverse order.

Products such as watermarks, headers and page numbers are applied when you export, which means they
always match the final page order and can be changed at any time.

## 6. Protecting a document

**Redaction** — choose the redaction tool (`X`), draw over the content, then **Protect ▸ Apply
redactions**. Covered text is deleted from the page content stream on export, so it cannot be
copied out of the file by a recipient.

**Passwords & permissions** — **Protect ▸ Password & permissions…**: set a user password (needed to
open) and an owner password (needed to change permissions), choose AES-256, and allow or deny
printing, copying, modifying, annotating, form filling, accessibility and assembly. Encryption is
applied when the file is exported; the local working copy/autosave is not encrypted by this setting.

**Digital signatures** — **Protect ▸ Digital signature…**: pick a `.p12`/`.pfx` certificate, enter
its passphrase, add a reason/location, and the exported bytes are signed with a detached PKCS#7
(PAdES-style) signature using SHA-256. A signature appearance is placed on the page as well.

**Sanitise** removes metadata, comments, bookmarks and attachments from the working document.

## 7. Forms

**Forms ▸ Text field / Checkbox / Radio button / Dropdown / Button**, then drag on the page. Each
field gets a name, default value and options in the Properties panel. Existing fields in a PDF are
fillable directly on the page (pdf.js renders the widgets). Choose *Flatten forms & comments* in the
Export dialog to bake the values into the page content.

## 8. Recognising text (OCR)

**Tools ▸ Recognise text (OCR)…**, pick one or more languages, choose the pages, and run it. Progress
appears in the overlay; each page reports its confidence in the OCR panel. The invisible text layer
is written on export, so the scan looks untouched but is searchable and copyable. Language data is
cached after the first download, so repeat runs work offline.

## 9. Exporting and printing

**Export** (toolbar, `Ctrl+Shift+E`, or **File ▸ Export as…**) offers:

- **PDF** — optional embedded fonts, PDF/A conformance, flattened forms/comments, OCR text layer.
- **Flattened PDF** and **Compress & optimise** (render scale + image quality, with a size estimate).
- **Images** — PNG, JPEG, WebP, SVG; multi-page results download as a ZIP.
- **Text-like** — plain text, Markdown, HTML, CSV, JSON.
- **Office** — Word, PowerPoint (one slide per page) and Excel.
- **Split exports** — every N pages, custom ranges or one file per page, zipped.

Page ranges accept `1-3, 5, 8-10`. **Print** (`Ctrl+P`) flattens the document into a temporary PDF
and hands it to the browser's print dialog.

## 10. Recovering your work

PDFmaster autosaves the whole session to this app's local IndexedDB a second after your last change
(watch the dot in the status bar). If the app crashes or you accidentally close it, the recent
documents list on the home screen restores it.

**File ▸ Save editable project…** writes a `.pdfmaster.json` containing the structure *and* the
embedded sources, so a project can be moved to another machine and reopened exactly as it was.
**Save a copy** (`Ctrl+S`) writes a real PDF.

## 11. Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl+O` / `Ctrl+S` / `Ctrl+P` | Open / save a copy / print |
| `Ctrl+Shift+E` | Export as… |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl+X` / `Ctrl+C` / `Ctrl+V` / `Ctrl+D` | Cut, copy, paste, duplicate objects |
| `Delete` | Delete the selection |
| `Ctrl+A` | Select everything on the page |
| `Ctrl+F`, `F3`, `Shift+F3` | Find, next hit, previous hit |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+0` / `Ctrl+1` / `Ctrl+2` | Zoom in / out / 100% / fit width / fit page |
| `Ctrl` + mouse wheel | Zoom at the pointer |
| `Page Up` / `Page Down` | Previous / next page |
| Arrow keys (`Shift` for ×10) | Nudge the selection |
| `V` `H` `T` `E` `I` `R` `D` `U` `N` `S` `X` | Select, pan, text, edit text, image, shape, draw, highlight, note, stamp, redact |
| `Esc` | Close dialog → clear selection → back to Select |
| `Ctrl+K` | Command palette |

## 12. Installing it as an app

### Windows desktop

After a Windows release is published, run this in PowerShell to download the latest installer, verify
its SHA-256 checksum, and open the setup wizard:

```powershell
irm https://raw.githubusercontent.com/AfzalAshraf/PDFmaster/main/scripts/install-windows.ps1 | iex
```

Or fetch the installer with `curl.exe` and run it yourself:

```powershell
curl.exe -fL https://github.com/AfzalAshraf/PDFmaster/releases/latest/download/PDFmaster-Setup.exe -o "$env:TEMP\PDFmaster-Setup.exe"
Start-Process -FilePath "$env:TEMP\PDFmaster-Setup.exe" -Wait
```

The direct `curl.exe` route does not verify the checksum. The installer is not code-signed yet, so
Windows SmartScreen may show an unfamiliar-publisher warning. If no release is published yet, build
on a Windows x64 machine with `npm ci` followed by `npm run desktop:win`; find the installer and
portable app in `desktop-dist/`.

### Browser / PWA

Use your browser's *Install* / *Add to Home Screen* action. PDFmaster launches in its own window and
keeps working offline after the app files have been cached.

## 13. Troubleshooting

| Symptom | Explanation |
| --- | --- |
| A text edit reports "could not be rewritten" | The run uses a font encoding that cannot be mapped back to Unicode; nothing was changed. |
| OCR is slow the first time | The language data (~10 MB per language) is being downloaded; later runs are local. |
| A very large PDF opens slowly | Pages render lazily; only visible pages are rasterised. |
| Exported file is larger than expected | Enable *Flatten* or use **Compress**; embedded DejaVu fonts also add ~400 KB. |
| Password lost | Nothing is stored anywhere — the file cannot be recovered. |
