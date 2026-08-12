import { quoteKindColorClassNames } from '@pkg/domain';
import type { Icon as TablerIcon } from '@tabler/icons-react-native';
import { IconPackage, IconTools } from '@tabler/icons-react-native';
import type { ReactNode } from 'react';

import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/ui/icon';

/** What a Quote or Job sells, when there is no Product photo to show for it. */
type OfferingKind = 'custom' | 'product';

const offeringKindIcons: Record<OfferingKind, TablerIcon> = {
  custom: IconTools,
  product: IconPackage,
};

/**
 * Tile tint and icon for an offering avatar, for surfaces that build their own `Avatar` — including
 * `CatalogListCard`, which owns its avatar's size and shape. Offerings never fall back to initials.
 */
export function offeringAvatarChrome(kind: OfferingKind, iconSize = 22): { className: string; fallback: ReactNode } {
  const { chip, text } = quoteKindColorClassNames[kind];

  return {
    className: chip,
    fallback: <Icon className={text} icon={offeringKindIcons[kind]} size={iconSize} />,
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
  kind: OfferingKind;
  name: string;
  uri: string | null | undefined;
}) {
  const chrome = offeringAvatarChrome(kind, iconSize);

  return <Avatar className={`${className} ${chrome.className}`} fallback={chrome.fallback} name={name} uri={uri} />;
}
