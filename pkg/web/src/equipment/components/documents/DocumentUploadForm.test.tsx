// @vitest-environment jsdom
import { ProductDocumentType } from '@pkg/schema/equipment';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  getReadyProductDocumentUpload,
  uploadJobPurchaseOrder,
  uploadProductDocument,
} from '@/equipment/utils/document.js';
import { DocumentUploadForm } from './DocumentUploadForm.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
const request = vi.fn(() => new Promise<Response>(() => {}));
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.replaceChildren();
  request.mockClear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function Fixture({ ownerType }: { ownerType: 'job' | 'product' }) {
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <DocumentUploadForm
      isPending={pending}
      label="Document"
      ownerType={ownerType}
      selectedFile={file}
      selectedType={type}
      onFileChange={setFile}
      onTypeChange={setType}
      typeOptions={
        ownerType === 'job'
          ? [{ label: 'Purchase Order', value: 'purchase_order' }]
          : [
              { label: 'General', value: 'general' },
              { label: 'Drawing', value: 'drawing' },
            ]
      }
      onSubmit={() => {
        setPending(true);
        if (ownerType === 'product') {
          const upload = getReadyProductDocumentUpload({ file, type: ProductDocumentType.parse(type) });
          if (upload) void uploadProductDocument('00000000-0000-4000-8000-000000000001', upload);
        } else if (file) void uploadJobPurchaseOrder('00000000-0000-4000-8000-000000000001', file);
      }}
    />
  );
}
async function mount(ownerType: 'job' | 'product') {
  window.__APP_CONFIG__ = {
    appEnv: 'test',
    appBaseUrl: 'http://localhost:7201',
    apiBaseUrl: 'http://localhost:7202',
    authBaseUrl: 'http://localhost:7202/api/auth',
    docsBaseUrl: null,
    deploymentVersion: null,
    posthog: { enabled: false, apiHost: '/info', uiHost: 'https://us.posthog.com', release: null },
  };
  vi.stubGlobal('fetch', request);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:document');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Fixture ownerType={ownerType} />));
}
async function select(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type=file]');
  if (!input) throw new Error('Missing selector');
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}
async function chooseType(label: string) {
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Document type"]')?.click());
  const option = [...document.querySelectorAll<HTMLElement>('[role=option]')].find(
    (item) => item.textContent?.trim() === label,
  );
  if (!option) throw new Error(`Missing type: ${label}`);
  await act(async () => option.click());
}
async function submit() {
  await act(async () => document.querySelector<HTMLButtonElement>('button[type=submit]')?.click());
}

it('requires an explicit Job document type and sends the selected replacement only after submit', async () => {
  await mount('job');
  await select(new File(['%PDF-old'], 'old.pdf', { type: 'application/pdf' }));
  await submit();
  expect(document.body.textContent).toContain('Choose a document type.');
  expect(request).not.toHaveBeenCalled();
  await chooseType('Purchase Order');
  const replacement = new File(['%PDF-new'], 'new.pdf', { type: '' });
  await select(replacement);
  await submit();
  await submit();
  expect(request).toHaveBeenCalledOnce();
  const [url, options] = request.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toContain('/api/jobs/');
  expect((options.body as FormData).get('file')).toBe(replacement);
});

it.each(['', 'application/x-zip-compressed'])(
  'applies Drawing ZIP policy and retains metadata for browser MIME %s',
  async (contentType) => {
    await mount('product');
    await select(new File(['%PDF'], 'general.pdf', { type: 'application/pdf' }));
    await chooseType('Drawing');
    expect(document.body.textContent).toContain('Only ZIP documents');
    await submit();
    expect(document.body.textContent).toContain('Only ZIP documents');
    expect(request).not.toHaveBeenCalled();
    const drawing = new File(['zip'], 'drawing.zip', { type: contentType });
    await select(drawing);
    await submit();
    expect(request).toHaveBeenCalledOnce();
    const [, options] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect((options.body as FormData).get('file')).toBe(drawing);
    expect((options.body as FormData).get('type')).toBe('drawing');
  },
);

it('applies the selected Product document type before accepting a draft', async () => {
  await mount('product');
  await chooseType('Drawing');
  await select(new File(['%PDF'], 'wrong.pdf', { type: 'application/pdf' }));
  expect(document.body.textContent).toContain('Only ZIP documents');
  expect(document.body.textContent).not.toContain('wrong.pdf');
  await chooseType('General');
  await select(new File(['zip'], 'wrong.zip', { type: 'application/zip' }));
  expect(document.body.textContent).toContain('Only PDF documents');
  await submit();
  expect(request).not.toHaveBeenCalled();
});

it.each(['job', 'product'] as const)('discards a %s document after rejecting its replacement', async (ownerType) => {
  await mount(ownerType);
  await chooseType(ownerType === 'job' ? 'Purchase Order' : 'General');
  await select(new File(['%PDF'], 'previous.pdf', { type: 'application/pdf' }));
  await select(new File(['image'], 'replacement.png', { type: 'image/png' }));
  expect(document.body.textContent).not.toContain('previous.pdf');
  await submit();
  expect(request).not.toHaveBeenCalled();
});
