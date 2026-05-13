import { type UserCreateInput, type UserSummary, UserUpdateInput } from "@pkg/schema";
import { Loader2Icon } from "lucide-react";
import type React from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form/index.js";
import { Button } from "@/components/ui/button.js";
import { DialogFooter } from "@/components/ui/dialog.js";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field.js";
import { UserRoleSelect } from "./UserRoleSelect.js";

const UserCreateFormValues = z.object({
  email: UserUpdateInput.shape.email,
  emailVerified: UserUpdateInput.shape.emailVerified,
  name: UserUpdateInput.shape.name,
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: UserUpdateInput.shape.role,
});

const UserUpdateFormValues = UserCreateFormValues.extend({
  password: z.string().refine((value) => value.length === 0 || value.length >= 8, {
    message: "Password must be at least 8 characters",
  }),
});

type UserFormValues = z.infer<typeof UserUpdateFormValues>;

type UserFormProps = {
  initialUser?: UserSummary;
  isPending: boolean;
  submitLabel: string;
  onSubmit: (value: UserCreateInput | UserUpdateInput) => Promise<unknown>;
};

export const UserForm: React.FC<UserFormProps> = ({
  initialUser,
  isPending,
  submitLabel,
  onSubmit,
}) => {
  const mode = initialUser ? "edit" : "create";
  const form = useAppForm({
    defaultValues: {
      email: initialUser?.email ?? "",
      emailVerified: initialUser?.emailVerified ?? false,
      name: initialUser?.name ?? "",
      password: "",
      role: initialUser?.role ?? "product-viewer",
    } satisfies UserFormValues,
    validators: {
      onSubmit: mode === "create" ? UserCreateFormValues : UserUpdateFormValues,
    },
    onSubmit: async ({ value }) => {
      if (mode === "create") {
        await onSubmit(UserCreateFormValues.parse(value));
        return;
      }

      if (!initialUser) {
        return;
      }

      await onSubmit(
        UserUpdateInput.parse({
          email: value.email,
          emailVerified: value.emailVerified,
          name: value.name,
          password: value.password || undefined,
          role: value.role,
          userId: initialUser.id,
        }),
      );
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
          {(field) => <field.TextField autoComplete="name" label="Full Name" />}
        </form.AppField>
        <form.AppField name="email">
          {(field) => <field.TextField autoComplete="email" label="Email" type="email" />}
        </form.AppField>
        <form.AppField name="role">
          {(field) => (
            <Field data-invalid={field.state.meta.errors.length > 0}>
              <FieldLabel htmlFor={field.name}>Role</FieldLabel>
              <UserRoleSelect
                disabled={isPending}
                onRoleChange={(role) => field.handleChange(role)}
                value={field.state.value}
              />
              <FieldError errors={field.state.meta.errors} />
            </Field>
          )}
        </form.AppField>
        <form.AppField name="emailVerified">
          {(field) => <field.CheckboxField label="Email verified" />}
        </form.AppField>
        <form.AppField name="password">
          {(field) => (
            <field.PasswordField
              autoComplete={mode === "create" ? "new-password" : "off"}
              description={mode === "edit" ? "Leave blank to keep current password" : undefined}
              label={mode === "create" ? "Password" : "New password"}
            />
          )}
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
