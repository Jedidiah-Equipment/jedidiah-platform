import bwipjs from 'bwip-js';

const CODE_128_OPTIONS = {
  bcid: 'code128',
  includetext: false,
  scale: 4,
} as const;

export function getCode128BarPattern(text: string): string {
  const [encoding] = bwipjs.raw({ ...CODE_128_OPTIONS, text });

  if (!encoding || !('sbs' in encoding)) {
    throw new Error('Code 128 encoder did not return a linear bar pattern');
  }

  return encoding.sbs.join('');
}

export async function renderCode128DataUri(text: string): Promise<string> {
  const png = await bwipjs.toBuffer({
    ...CODE_128_OPTIONS,
    backgroundcolor: 'FFFFFF',
    barcolor: '000000',
    height: 14,
    text,
  });

  return `data:image/png;base64,${png.toString('base64')}`;
}
