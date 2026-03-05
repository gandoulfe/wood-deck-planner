import * as pdfjs from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

export async function renderPdfPage(
  file: File,
  pageNum = 1,
  renderScale = 2,
): Promise<{ src: string; w: number; h: number }> {
  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: renderScale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d')!;

  await page.render({ canvasContext: ctx, canvas, viewport }).promise;

  return { src: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height };
}
