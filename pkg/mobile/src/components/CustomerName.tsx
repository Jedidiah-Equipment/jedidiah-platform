import { statusBadgeColorClassNames } from '@pkg/domain';

import { type AppTextProps, Text } from '@/components/ui/text';

/** The colour a real Customer name carries, chosen by the surface it sits on. */
const NAME_TONE = {
  muted: 'text-muted-foreground',
  surface: 'text-surface-foreground',
} as const;

const STOCK_TONE = statusBadgeColorClassNames.yellow.text;

export type CustomerNameTone = keyof typeof NAME_TONE;

export type CustomerNameProps = Omit<AppTextProps, 'children'> & {
  companyName: string | null;
  tone?: CustomerNameTone;
};

/**
 * Shown wherever a Customer would be, for a Product Unit nobody owns. Stock is a derived state of the
 * machine — we hold it — not a Customer record, so it carries its own accent rather than reading as an
 * empty cell or a placeholder company name. Web says this with a chip (`StockBadge`); mobile shows it
 * inline in single-line card text, so the accent lands on the label itself.
 *
 * `className` carries size and layout only — colour comes from `tone` (or the Stock accent), so the two
 * never compete over which utility wins.
 */
export function CustomerName({ className = '', companyName, tone = 'muted', ...textProps }: CustomerNameProps) {
  return (
    <Text className={`${className} ${companyName ? NAME_TONE[tone] : STOCK_TONE}`} {...textProps}>
      {companyName ?? 'Stock'}
    </Text>
  );
}
