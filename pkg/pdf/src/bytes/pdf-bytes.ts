import { PDFDocument } from 'pdf-lib';

export async function mergePdfBytes(parts: Uint8Array[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();

  for (const part of parts) {
    const source = await PDFDocument.load(part);
    const pages = await merged.copyPages(source, source.getPageIndices());

    for (const page of pages) {
      merged.addPage(page);
    }
  }

  return await merged.save();
}

export async function createPdfBytesWithPageSizes(pageSizes: Array<[number, number]>): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();

  for (const [width, height] of pageSizes) {
    pdf.addPage([width, height]);
  }

  return await pdf.save();
}

export async function getPdfPageSizes(bytes: Uint8Array): Promise<Array<{ height: number; width: number }>> {
  const pdf = await PDFDocument.load(bytes);

  return pdf.getPages().map((page) => page.getSize());
}
