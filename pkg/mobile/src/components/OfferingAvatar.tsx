import { quoteKindColorClassNames } from '@pkg/domain';
import type { QuoteKind } from '@pkg/schema';
import type { Icon as TablerIcon } from '@tabler/icons-react-native';
import { IconPackage, IconTools } from '@tabler/icons-react-native';
import type { ReactNode } from 'react';

import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/ui/icon';
import { useColorMode } from '@/theme/use-color-mode';

const offeringKindIcons: Record<QuoteKind, TablerIcon> = {
  custom: IconTools,
  product: IconPackage,
};

/**
 * Tile tint and icon for an offering avatar, for surfaces that build their own `Avatar` — including
 * `CatalogListCard`, which owns its avatar's size and shape. Offerings never fall back to initials.
 *
 * A hook because the icon needs the resolved scheme: native names one half of the palette itself
 * rather than leaving a `dark:` variant to NativeWind's appearance store, which the in-app theme
 * preference cannot drive.
 */
export function useOfferingAvatarProps(kind: QuoteKind, iconSize = 22): { className: string; fallback: ReactNode } {
  const { chip, textByScheme } = quoteKindColorClassNames[kind];
  const { resolved } = useColorMode();

  return {
    className: chip,
    fallback: <Icon className={textByScheme[resolved]} icon={offeringKindIcons[kind]} size={iconSize} />,
  };
}

export function OfferingAvatar({
  className = '',
  iconSize,
  kind,
  name,
  uri,
}: {
  className?: string;
  iconSize?: number;
  kind: QuoteKind;
  name: string;
  uri: string | null | undefined;
}) {
  const offering = useOfferingAvatarProps(kind, iconSize);

  return <Avatar className={`${className} ${offering.className}`} fallback={offering.fallback} name={name} uri={uri} />;
}
