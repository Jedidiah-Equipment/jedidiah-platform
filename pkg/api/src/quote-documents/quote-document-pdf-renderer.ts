import type { QuoteDocumentPdfRenderer } from '@pkg/core';
import { chromium } from 'playwright';

export const renderQuoteDocumentPdf: QuoteDocumentPdfRenderer = async ({ html }) => {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    const bytes = await page.pdf({
      format: 'A4',
      printBackground: true,
    });

    return new Uint8Array(bytes);
  } finally {
    await browser.close();
  }
};
