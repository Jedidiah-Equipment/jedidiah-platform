// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { useAppForm } from '../hooks/use-app-form.js';
import {
  formatNumberFieldValue,
  hasNumberFieldValueChanged,
  parseNumberFieldValue,
  roundNumberFieldValue,
} from './NumberField.js';

describe('formatNumberFieldValue', () => {
  it('formats empty numeric values as blank text', () => {
    expect(formatNumberFieldValue(NaN)).toBe('');
  });

  it('formats finite numeric values as plain input text', () => {
    expect(formatNumberFieldValue(0)).toBe('0');
    expect(formatNumberFieldValue(1000000)).toBe('1 000 000');
    expect(formatNumberFieldValue(12.5)).toBe('12.5');
    expect(formatNumberFieldValue(0.1 + 0.2)).toBe('0.3');
    expect(formatNumberFieldValue(1e-7)).toBe('0.0000001');
    expect(formatNumberFieldValue(12.5, 2)).toBe('12.50');
  });
});

describe('parseNumberFieldValue', () => {
  it('returns NaN for blank input by default', () => {
    expect(Number.isNaN(parseNumberFieldValue(''))).toBe(true);
    expect(Number.isNaN(parseNumberFieldValue('   '))).toBe(true);
  });

  it('uses a caller-provided blank value when provided', () => {
    expect(parseNumberFieldValue('', 0)).toBe(0);
  });

  it('parses numeric input text', () => {
    expect(parseNumberFieldValue('12')).toBe(12);
    expect(parseNumberFieldValue('12.5')).toBe(12.5);
  });

  it('parses grouped numeric input text', () => {
    expect(parseNumberFieldValue('1 000 000')).toBe(1000000);
    expect(parseNumberFieldValue('1\u00a0000\u00a0000')).toBe(1000000);
    expect(parseNumberFieldValue('1,000,000')).toBe(1000000);
    expect(parseNumberFieldValue('1000,5')).toBe(1000.5);
  });
});

describe('formatNumberFieldValue fraction digits', () => {
  it('formats a value with more fraction digits than Intl accepts', () => {
    // Intl.NumberFormat throws above 100 fraction digits, and `1e-101` parses straight out of the field.
    expect(() => formatNumberFieldValue(1e-101)).not.toThrow();
    expect(formatNumberFieldValue(0.125)).toBe('0.125');
  });
});

describe('hasNumberFieldValueChanged', () => {
  it('treats empty numeric values as unchanged', () => {
    expect(hasNumberFieldValueChanged(NaN, NaN)).toBe(false);
  });

  it('detects finite number changes', () => {
    expect(hasNumberFieldValueChanged(NaN, 0)).toBe(true);
    expect(hasNumberFieldValueChanged(0, 1)).toBe(true);
  });
});

describe('roundNumberFieldValue', () => {
  it('keeps the keyed value when the field declares no decimals', () => {
    expect(roundNumberFieldValue(7.5, undefined)).toBe(7.5);
  });

  it('rounds to the number the field displays', () => {
    expect(roundNumberFieldValue(7.5, 0)).toBe(8);
    expect(roundNumberFieldValue(1.2345, 3)).toBe(1.235);
    expect(roundNumberFieldValue(1234.56, 0)).toBe(1235);
  });

  it('rounds the way the display rounds, not the way Math.round does', () => {
    expect(roundNumberFieldValue(-7.5, 0)).toBe(-8);
    expect(roundNumberFieldValue(1.005, 2)).toBe(1.01);
  });

  it('leaves an empty field empty', () => {
    expect(Number.isNaN(roundNumberFieldValue(NaN, 0))).toBe(true);
  });
});

const mountedRoots: Array<ReturnType<typeof createRoot>> = [];
const mountedContainers: HTMLDivElement[] = [];

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  for (const root of mountedRoots) {
    act(() => root.unmount());
  }
  mountedRoots.length = 0;
  for (const container of mountedContainers) {
    container.remove();
  }
  mountedContainers.length = 0;
});

describe('NumberField', () => {
  it('commits the whole number it displays for a whole-unit field', async () => {
    const { input, readQuantity } = await renderQuantityField(0);

    act(() => {
      keyValue(input, '7.5');
      input.blur();
    });

    expect(input.value).toBe('8');
    expect(readQuantity()).toBe(8);
  });

  it('keeps the keyed decimals when the field declares none', async () => {
    const { input, readQuantity } = await renderQuantityField(undefined);

    act(() => {
      keyValue(input, '7.5');
      input.blur();
    });

    expect(input.value).toBe('7.5');
    expect(readQuantity()).toBe(7.5);
  });

  it('rounds the value it already holds once the caller settles on a precision', async () => {
    const { input, readQuantity, settleDecimals } = await renderQuantityField(undefined);

    act(() => {
      keyValue(input, '7.5');
      input.blur();
    });
    await settleDecimals(0);

    expect(input.value).toBe('8');
    expect(readQuantity()).toBe(8);
  });
});

async function renderQuantityField(decimals: number | undefined) {
  let readQuantity = (): number => NaN;
  const QuantityForm = ({ decimals: fieldDecimals }: { decimals: number | undefined }) => {
    const form = useAppForm({ defaultValues: { quantity: 1 } });
    readQuantity = () => form.state.values.quantity;

    return (
      <form.AppField name="quantity">
        {(field) => <field.NumberField decimals={fieldDecimals} label="Quantity" />}
      </form.AppField>
    );
  };

  const container = document.createElement('div');
  document.body.append(container);
  mountedContainers.push(container);
  const root = createRoot(container);
  mountedRoots.push(root);

  const render = async (nextDecimals: number | undefined) => {
    await act(async () => {
      root.render(<QuantityForm decimals={nextDecimals} />);
    });
  };
  await render(decimals);

  const input = container.querySelector('input');
  if (!input) throw new Error('NumberField rendered no input');

  return { input, readQuantity: () => readQuantity(), settleDecimals: render };
}

function keyValue(input: HTMLInputElement, value: string): void {
  input.focus();
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!valueSetter) throw new Error('HTMLInputElement.value setter is unavailable');
  valueSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
