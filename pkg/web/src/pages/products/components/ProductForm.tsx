import { ProductCreateInput } from "@pkg/schema";
import { Loader2Icon } from "lucide-react";
import type React from "react";
import { useAppForm } from "@/components/form/index.js";
import { Button } from "@/components/ui/button.js";
import { DialogFooter } from "@/components/ui/dialog.js";
import { FieldGroup } from "@/components/ui/field.js";

type ProductFormProps = {
  initialName?: string;
  isPending: boolean;
  submitLabel: string;
  onSubmit: (value: ProductCreateInput) => Promise<unknown>;
};

export const ProductForm: React.FC<ProductFormProps> = ({
  initialName = "",
  isPending,
  submitLabel,
  onSubmit,
}) => {
  const form = useAppForm({
    defaultValues: {
      name: initialName,
    } satisfies ProductCreateInput,
    validators: {
      onSubmit: ProductCreateInput,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.AppField name="name">
          {(field) => <field.TextField autoComplete="off" label="Name" />}
        </form.AppField>
      </FieldGroup>
      <DialogFooter className="mt-4" showCloseButton>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button disabled={isSubmitting || isPending} type="submit">
              {isSubmitting || isPending ? (
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
              ) : null}
              {submitLabel}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
};
