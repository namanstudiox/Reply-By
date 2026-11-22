// Dev-only verification helper: dumps the text layer of a PDF so a genuine
// document's wording can be compared with what the reader shows.
// Usage: node scripts/pdftext.mjs <file.pdf> [--json]
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pdfjsPath = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
const pdfjs = await import(pdfjsPath);

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/pdftext.mjs <file.pdf>');
  process.exit(1);
}
const data = new Uint8Array(await readFile(file));
const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
const pages = [];
for (let n = 1; n <= doc.numPages; n++) {
  const page = await doc.getPage(n);
  const content = await page.getTextContent();
  let text = '';
  for (const item of content.items) {
    if (!('str' in item)) continue;
    text += item.str + (item.hasEOL ? '\n' : ' ');
  }
  pages.push({ page: n, text: text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() });
}
const out = { pages: doc.numPages, text: pages.map((p) => p.text).join('\n\n'), perPage: pages };
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 2));
else console.log(out.text);
