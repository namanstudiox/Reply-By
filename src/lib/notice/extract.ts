// Local file reading. PDF.js and Tesseract.js are imported only when a file of
// that kind is chosen, so the first paint stays small. Nothing here sends the
// document anywhere; the only network request is for the OCR language data.

export const LIMITS = {
  fileBytes: 20 * 1024 * 1024,
  pdfPages: 30,
  imageSide: 2600,
  maxImagePixels: 40_000_000,
};

export interface ExtractProgress {
  message: string;
  /** 0–1 when the underlying work can report it. */
  ratio?: number;
}

export interface ExtractResult {
  text: string;
  source: 'pdf' | 'ocr';
  fileName: string;
  pages: number;
  warnings: string[];
}

export interface ExtractOptions {
  onProgress?: (progress: ExtractProgress) => void;
  signal?: AbortSignal;
}

export class ExtractError extends Error {
  readonly hint?: string;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = 'ExtractError';
    this.hint = hint;
  }
}

type FileKind = 'pdf' | 'image' | 'heic' | 'unsupported';

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index + 1).toLowerCase();
}

export function detectKind(file: File): FileKind {
  const ext = extensionOf(file.name);
  const type = file.type.toLowerCase();
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
    if (type === 'image/heic' || type === 'image/heif' || ['heic', 'heif'].includes(ext)) return 'heic';
    if (
      type === 'image/png' ||
      type === 'image/jpeg' ||
      type === 'image/jpg' ||
      type === 'image/webp' ||
      ['png', 'jpg', 'jpeg', 'webp'].includes(ext)
    ) {
      return 'image';
    }
    return 'unsupported';
  }
  if (type === 'image/heic' || type === 'image/heif' || ['heic', 'heif'].includes(ext)) return 'heic';
  return 'unsupported';
}

function assertAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
}

function isPasswordError(error: unknown): boolean {
  return error instanceof Error && error.name === 'PasswordException';
}

function friendlyPdfError(error: unknown): ExtractError {
  if (isPasswordError(error)) {
    return new ExtractError(
      'This PDF is password-protected, so its text cannot be read here.',
      'Open it in a PDF reader, save an unlocked copy (or a page image), then try again.',
    );
  }
  return new ExtractError(
    "This PDF couldn't be opened. It may be damaged or use an unsupported format.",
    'Try another copy, take a photo of the page, or paste the text instead.',
  );
}

const PAGE_JOIN = '\n\n';

function joinPageItems(items: Array<{ str: string; hasEOL: boolean }>): string {
  let text = '';
  for (const item of items) {
    text += item.str;
    text += item.hasEOL ? '\n' : ' ';
  }
  return text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractPdf(file: File, options: ExtractOptions): Promise<ExtractResult> {
  const { onProgress, signal } = options;
  onProgress?.({ message: 'Opening the PDF…' });

  let pdfjs: typeof import('pdfjs-dist');
  let workerUrl: string;
  try {
    pdfjs = await import('pdfjs-dist');
    workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  } catch {
    throw new ExtractError(
      'The PDF reader could not be loaded in this browser.',
      'Check your connection and try again, or paste the text instead.',
    );
  }
  assertAborted(signal);
  if (typeof window !== 'undefined') {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  }

  const data = new Uint8Array(await file.arrayBuffer());
  assertAborted(signal);

  const loadingTask = pdfjs.getDocument({ data, isEvalSupported: false });
  let doc: Awaited<typeof loadingTask.promise>;
  try {
    doc = await loadingTask.promise;
  } catch (error) {
    throw friendlyPdfError(error);
  }

  try {
    if (doc.numPages > LIMITS.pdfPages) {
      throw new ExtractError(
        `This PDF has ${doc.numPages} pages. The reader handles up to ${LIMITS.pdfPages}.`,
        'Upload only the pages with the request, or paste the relevant text.',
      );
    }

    const pageTexts: string[] = [];
    const emptyPages: number[] = [];

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      assertAborted(signal);
      onProgress?.({
        message: `Reading page ${pageNumber} of ${doc.numPages}…`,
        ratio: (pageNumber - 1) / doc.numPages,
      });
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items
        .filter((item) => 'str' in item)
        .map((item) => {
          const textItem = item as { str: string; hasEOL?: boolean };
          return { str: textItem.str, hasEOL: Boolean(textItem.hasEOL) };
        });
      const pageText = joinPageItems(items);
      if (pageText.replace(/\s/g, '').length < 20) emptyPages.push(pageNumber);
      pageTexts.push(pageText);
      page.cleanup();
    }

    const text = pageTexts.filter(Boolean).join(PAGE_JOIN).trim();
    if (text.replace(/\s/g, '').length < 40) {
      throw new ExtractError(
        doc.numPages === 1
          ? 'This PDF has no selectable text, so it looks like a scan.'
          : 'None of these PDF pages have selectable text, so the document looks like a scan.',
        'Take a photo or screenshot of each page and upload the images (JPG or PNG), or paste the text.',
      );
    }

    const warnings: string[] = [];
    if (emptyPages.length) {
      const list = emptyPages.join(', ');
      warnings.push(
        `Page${emptyPages.length > 1 ? 's' : ''} ${list} had no selectable text and ${emptyPages.length > 1 ? 'were' : 'was'} not included. If the request is on ${emptyPages.length > 1 ? 'those pages' : 'that page'}, upload an image of ${emptyPages.length > 1 ? 'them' : 'it'} or paste the text.`,
      );
    }

    return { text, source: 'pdf', fileName: file.name, pages: doc.numPages, warnings };
  } finally {
    void loadingTask.destroy();
  }
}

async function prepareImage(file: File, signal?: AbortSignal): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ExtractError(
      "This image couldn't be opened by the browser, so there is nothing to read.",
      'Use a PNG or JPG. HEIC photos from iPhone need to be exported as JPEG (Photos → Share → Save as JPEG) or pasted as text.',
    );
  }
  assertAborted(signal);
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest > LIMITS.maxImagePixels) {
    bitmap.close();
    throw new ExtractError(
      'This image is too large to process in the browser.',
      'Resize it so the longest side is under about 6,000 pixels, or paste the text.',
    );
  }
  const scale = Math.min(1, LIMITS.imageSide / longest);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height });
  const context = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!context) {
    bitmap.close();
    throw new ExtractError('The browser could not prepare this image for reading.');
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: 'image/png' });
  }
  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ExtractError('The browser could not prepare this image.'))),
      'image/png',
    );
  });
}

const OCR_STATUS: Record<string, string> = {
  'loading tesseract core': 'Starting the text reader…',
  'initializing tesseract': 'Starting the text reader…',
  'loading language traineddata': 'Loading English text data (first time only)…',
  'initializing api': 'Preparing the text reader…',
  'recognizing text': 'Reading the image…',
};

async function extractImage(file: File, options: ExtractOptions): Promise<ExtractResult> {
  const { onProgress, signal } = options;
  onProgress?.({ message: 'Preparing the image…' });

  const prepared = await prepareImage(file, signal);
  assertAborted(signal);

  let createWorker: typeof import('tesseract.js').createWorker;
  try {
    ({ createWorker } = await import('tesseract.js'));
  } catch {
    throw new ExtractError(
      'The image text reader could not be loaded.',
      'Check your connection and try again, or paste the text instead.',
    );
  }
  assertAborted(signal);

  onProgress?.({ message: 'Starting the text reader…' });
  const worker = await createWorker('eng', 1, {
    logger: (message: { status?: string; progress?: number }) => {
      const label = (message.status && OCR_STATUS[message.status]) ?? 'Reading the image…';
      onProgress?.({
        message: label,
        ratio: message.status === 'recognizing text' ? message.progress : undefined,
      });
    },
    errorHandler: () => undefined,
  });

  try {
    assertAborted(signal);
    const { data } = await worker.recognize(prepared);
    assertAborted(signal);
    const text = data.text
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (text.replace(/\s/g, '').length < 25) {
      throw new ExtractError(
        'The image was read, but almost no text could be recognised.',
        'Use a sharp, well-lit photo of the whole page, or paste the text instead.',
      );
    }
    return { text, source: 'ocr', fileName: file.name, pages: 1, warnings: [] };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (error instanceof ExtractError) throw error;
    throw new ExtractError(
      'The image text reader stopped before it could finish.',
      'Check your connection (the reader downloads English text data the first time), then try again or paste the text.',
    );
  } finally {
    void worker.terminate();
  }
}

export async function extractFile(file: File, options: ExtractOptions = {}): Promise<ExtractResult> {
  if (file.size === 0) {
    throw new ExtractError('That file is empty.', 'Choose the notice file again, or paste the text.');
  }
  if (file.size > LIMITS.fileBytes) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    throw new ExtractError(
      `This file is ${mb} MB. The reader handles files up to 20 MB.`,
      'Compress the PDF or image, or paste the text.',
    );
  }

  const kind = detectKind(file);
  if (kind === 'heic') {
    throw new ExtractError(
      "HEIC photos aren't supported by browser image readers.",
      'In Photos, share or export the picture as JPEG and upload that, or paste the text.',
    );
  }
  if (kind === 'unsupported') {
    throw new ExtractError(
      `"${file.name}" isn't a PDF or an image this reader can open.`,
      'Upload a PDF, PNG, JPG, or JPEG, or paste the text.',
    );
  }

  return kind === 'pdf' ? extractPdf(file, options) : extractImage(file, options);
}
