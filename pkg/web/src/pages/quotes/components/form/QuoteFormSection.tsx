import type React from 'react';

type QuoteFormSectionProps = {
  children: React.ReactNode;
  description?: string;
  title: string;
};

export const QuoteFormSection: React.FC<QuoteFormSectionProps> = ({ children, description, title }) => (
  <section className="grid gap-4 border-t pt-6 first:border-t-0 first:pt-0">
    <div className="grid gap-1.5">
      <h3 className="flex items-center gap-2 font-heading font-medium text-base leading-tight">
        <span aria-hidden className="h-5 w-1 shrink-0 rounded-full bg-primary" />
        <span>{title}</span>
      </h3>
      {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
    </div>
    {children}
  </section>
);
