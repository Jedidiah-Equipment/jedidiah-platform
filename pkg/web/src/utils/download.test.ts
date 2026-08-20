import { afterEach, describe, expect, it, vi } from 'vitest';

import { saveBlobAsFile } from './download.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('saveBlobAsFile', () => {
  it('names the saved file and revokes the object URL only after the click is queued', async () => {
    vi.useFakeTimers();
    const link = { click: vi.fn(), download: '', href: '', remove: vi.fn(), style: { display: '' } };
    const append = vi.fn();
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.stubGlobal('window', { document: { body: { append }, createElement: vi.fn(() => link) } });

    saveBlobAsFile({ blob: new Blob(['%PDF-1.7'], { type: 'application/pdf' }), filename: 'PO-00027.pdf' });

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(link).toMatchObject({ download: 'PO-00027.pdf', href: 'blob:preview' });
    // Attached before the click and detached after it: a click on a detached anchor is ignored by some browsers.
    expect(append).toHaveBeenCalledWith(link);
    expect(link.click).toHaveBeenCalledOnce();
    expect(link.remove).toHaveBeenCalledOnce();
    // Revoking inside the same tick would pull the bytes out from under the download the click starts.
    expect(revokeObjectURL).not.toHaveBeenCalled();

    await vi.runOnlyPendingTimersAsync();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });
});
