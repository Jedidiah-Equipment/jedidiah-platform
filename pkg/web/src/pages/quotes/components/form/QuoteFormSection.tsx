import type { TablerIcon } from '@tabler/icons-react';
import type React from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardSeparator, CardTitle } from '@/components/ui/card.js';

type QuoteFormSectionProps = {
  children: React.ReactNode;
  description?: string;
  icon?: TablerIcon;
  title: string;
};

export const QuoteFormSection: React.FC<QuoteFormSectionProps> = ({ children, description, icon: Icon, title }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {Icon ? <Icon aria-hidden className="size-5 shrink-0 text-muted-foreground" /> : null}
          <span>{title}</span>
        </CardTitle>
        {description ? <CardDescription className="font-mono">{description}</CardDescription> : null}
      </CardHeader>
      <CardSeparator />
      <CardContent>{children}</CardContent>
    </Card>
  );
};
