# Reply-By

Turn English-language notices from any country into plain-language action cards: what the sender wants, when it's due, and the exact line that says so.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000/app
npm test           # rule + real-document checks
npm run build      # typecheck and production bundle
```

When the dev server is reached through a preview proxy, pass its hostname at start-up instead of writing it into the repo:

```bash
PREVIEW_ALLOWED_HOST=your-preview-host.example npm run dev
```

## The reader

`/app` is the web reader. Both inputs feed the same analyser (`src/lib/notice/analyze.ts`):

- **Upload** a PDF, PNG, JPG, or JPEG. PDF.js reads the text layer; Tesseract.js reads images. Both load only when needed, and neither leaves the browser. The extracted text is editable before it is analysed.
- **Paste** the wording and press **Read this text**.

The result names the request, the deadline, and the supporting sentence, quoted from the text currently on screen. **See source** highlights that sentence in the reviewed text, or expands it inline on a narrow screen. Dates are handled conservatively: a printed date is not a deadline, ambiguous numeric dates and business-day counts are reported as unconfirmed, and calendar days counted from receipt ask for the receipt date before doing date-only arithmetic.

Limits: 20 MB per file, 30 PDF pages, 30 MB file cap for images before downscaling. Scanned PDFs and HEIC photos get specific guidance instead of a guess.

## Verification material

`verification/notices/` holds genuinely public documents used to check the reader, with no personal data:

- `federal-register-comment-notice.pdf` — Federal Register notice with an explicit comment deadline.
- `fda-warning-letter-ido-pharm.txt` — FDA warning letter that counts business days.
- `eoir-notice-of-appeal.pdf` — EOIR appeal instructions with day counts tied to a decision date.
- `nea-sample-notice.pdf` — Singapore NEA sample notice.
- `federal-register-page1.png` / `federal-register-page1-scan.pdf` — a page image and an image-only PDF for the OCR and unreadable-file paths.

`scripts/pdftext.mjs` dumps a PDF's text layer for comparing what the reader extracted against the document.
