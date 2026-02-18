const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build');
const candidates = [
  path.join(buildDir, 'pdf.worker.min.mjs'),
  path.join(buildDir, 'pdf.worker.mjs'),
  path.join(buildDir, 'pdf.worker.min.js'),
  path.join(buildDir, 'pdf.worker.js'),
];

let src = null;
for (const c of candidates) {
  if (fs.existsSync(c)) {
    src = c;
    break;
  }
}
if (!src) {
  console.warn('[copy-pdf-worker] no worker file found in pdfjs-dist build folder');
  process.exit(0);
}
const destDir = path.join(__dirname, '..', 'public');
const dest = path.join(destDir, 'pdf.worker.min.mjs');

try {
  if (!fs.existsSync(src)) {
    console.warn('[copy-pdf-worker] source not found:', src);
    process.exit(0);
  }
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, dest);
  console.log('[copy-pdf-worker] copied worker to public/pdf.worker.min.mjs');
} catch (err) {
  console.error('[copy-pdf-worker] failed to copy worker:', err);
  process.exit(1);
}
