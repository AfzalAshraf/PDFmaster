import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// Official pdf.js text/annotation layer styles (Apache-2.0) — our own stylesheet
// loads afterwards and only overrides colours and stacking.
import 'pdfjs-dist/web/pdf_viewer.css';
import './styles/index.css';

const container = document.getElementById('root');
if (!container) throw new Error('The #root element is missing from index.html.');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

/* Hide the boot splash once React has painted. */
requestAnimationFrame(() => {
  const splash = document.getElementById('boot-splash');
  if (!splash) return;
  splash.classList.add('hidden');
  window.setTimeout(() => splash.remove(), 400);
});
