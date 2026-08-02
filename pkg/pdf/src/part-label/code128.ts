import bwipjs from 'bwip-js';

const CODE_128_OPTIONS = {
  bcid: 'code128',
  includetext: false,
  scale: 4,
} as const;

const CODE_128_MODULE_WIDTH_MM = 0.254;
const CODE_128_QUIET_ZONE_MODULES = 10;
const POINTS_PER_MILLIMETRE = 72 / 25.4;

export function getCode128BarPattern(text: string): string {
  const [encoding] = bwipjs.raw({ ...CODE_128_OPTIONS, text });

  if (!encoding || !('sbs' in encoding)) {
    throw new Error('Code 128 encoder did not return a linear bar pattern');
  }

  return encoding.sbs.join('');
}

export async function renderCode128Barcode(text: string): Promise<{ dataUri: string; width: number }> {
  const moduleCount = [...getCode128BarPattern(text)].reduce((total, width) => total + Number(width), 0);
  const png = await bwipjs.toBuffer({
    ...CODE_128_OPTIONS,
    backgroundcolor: 'FFFFFF',
    barcolor: '000000',
    height: 14,
    paddingwidth: CODE_128_QUIET_ZONE_MODULES,
    text,
  });

  return {
    dataUri: `data:image/png;base64,${png.toString('base64')}`,
    width: (moduleCount + 2 * CODE_128_QUIET_ZONE_MODULES) * CODE_128_MODULE_WIDTH_MM * POINTS_PER_MILLIMETRE,
  };
}
