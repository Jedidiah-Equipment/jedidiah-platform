import { Button } from '@/components/ui/button.js';
import { useFormContext } from './hooks/form-context.js';

/**
 * The submit button of an explicit-save form (`useSaveForm`): disabled while the draft still equals the saved values
 * or a save is in flight, and reading `Saving…` during one. Edit pages autosave and have no Save button; this is the
 * sanctioned exception for thresholds and rates, which must not apply mid-keystroke.
 */
export function SaveButton() {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => ({ isDefaultValue: state.isDefaultValue, isSubmitting: state.isSubmitting })}>
      {({ isDefaultValue, isSubmitting }) => (
        <Button type="submit" disabled={isDefaultValue || isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save'}
        </Button>
      )}
    </form.Subscribe>
  );
}
