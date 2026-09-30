// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useAppForm } from '../hooks/use-app-form.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Fixture({ save }: { save: (value: string | null) => void }) {
  const form = useAppForm({
    defaultValues: { thumbnail: null as string | null },
    onSubmit: ({ value }) => save(value.thumbnail),
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="thumbnail">
        {(field) => <field.ThumbnailField label="Thumbnail" fallbackLabel="Customer" />}
      </form.AppField>
      <button type="submit">Save</button>
    </form>
  );
}
async function mount() {
  const save = vi.fn();
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Fixture save={save} />));
  return save;
}
async function select(file?: File) {
  const input = document.querySelector<HTMLInputElement>('input[type=file]');
  if (!input) throw new Error('Missing selector');
  Object.defineProperty(input, 'files', { configurable: true, value: file ? [file] : [] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}

it('associates a processing failure with the field without changing the saved thumbnail', async () => {
  const save = await mount();
  await select(new File(['pdf'], 'wrong.pdf', { type: 'application/pdf' }));
  expect(document.querySelector('[role=alert]')?.textContent).toBe('Unsupported thumbnail image type.');
  const input = document.querySelector('input[type=file]');
  expect(input?.getAttribute('aria-describedby')).toBe(document.querySelector('[role=alert]')?.id);
  await act(async () => document.querySelector<HTMLButtonElement>('button[type=submit]')?.click());
  expect(save).toHaveBeenCalledWith(null);
});

it('crops a square WebP thumbnail, blocks processing duplicates and retains cancellation', async () => {
  const save = await mount();
  let finish!: () => void;
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 400;
      naturalHeight = 200;
      decode = () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        });
    },
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:thumbnail');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  const encode = vi
    .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
    .mockReturnValue('data:image/webp;base64,cHJvY2Vzc2Vk');
  await select(new File(['png'], 'customer.png', { type: 'image/png' }));
  expect(document.querySelector('[role=status]')?.textContent).toBe('');
  expect(document.querySelector<HTMLInputElement>('input[type=file]')?.disabled).toBe(true);
  await act(async () => finish());
  expect(drawImage.mock.calls[0]?.slice(1)).toEqual([100, 0, 200, 200, 0, 0, 256, 256]);
  expect(encode).toHaveBeenCalledWith('image/webp', 0.86);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:thumbnail');
  await select();
  await act(async () => document.querySelector<HTMLButtonElement>('button[type=submit]')?.click());
  expect(save).toHaveBeenLastCalledWith('data:image/webp;base64,cHJvY2Vzc2Vk');
  const remove = [...document.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === 'Remove thumbnail',
  );
  if (!remove) throw new Error('Missing removal action');
  await act(async () => remove.click());
  await act(async () => document.querySelector<HTMLButtonElement>('button[type=submit]')?.click());
  expect(save).toHaveBeenLastCalledWith(null);
});
