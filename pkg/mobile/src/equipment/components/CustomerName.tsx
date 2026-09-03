import { StockBadge } from '@/components/StockBadge';
import { type AppTextProps, Text } from '@/components/ui/text';

/** The colour a real Customer name carries, chosen by the surface it sits on. */
const NAME_TONE = {
  muted: 'text-muted-foreground',
  surface: 'text-surface-foreground',
} as const;

export type CustomerNameTone = keyof typeof NAME_TONE;

export type CustomerNameProps = Pick<AppTextProps, 'numberOfLines' | 'weight'> & {
  className?: string;
  companyName: string | null;
  tone?: CustomerNameTone;
};

/**
 * Shown wherever a Customer would be, for a Product Unit nobody owns. Stock is a derived state of the
 * machine — we hold it — not a Customer record, so it carries its own accent rather than reading as an
 * empty cell or a placeholder company name. Both apps say this with the shared Stock chip.
 *
 * `className` carries size and layout for a real Customer only; the Stock state owns its badge styling.
 */
export function CustomerName({ className = '', companyName, tone = 'muted', ...textProps }: CustomerNameProps) {
  if (companyName === null) return <StockBadge />;

  return (
    <Text className={`${className} ${NAME_TONE[tone]}`} {...textProps}>
      {companyName}
    </Text>
  );
}
