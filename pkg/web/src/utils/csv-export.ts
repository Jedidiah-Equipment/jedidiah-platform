import { downloadFile } from './download.js';

export function downloadCsv(contents: string, filename: string): void {
  downloadFile(contents, filename, 'text/csv;charset=utf-8');
}
