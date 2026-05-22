export type JobTransitionConfirmation = {
  body: string[];
  confirmLabel: string;
  confirmVariant: 'default' | 'destructive' | 'outline';
  onConfirm: () => void;
  title: string;
};
