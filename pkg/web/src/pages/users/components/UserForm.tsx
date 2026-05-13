import { AppRole, type UserSummary } from "@pkg/schema";
import { Loader2Icon } from "lucide-react";
import type React from "react";
import { z } from "zod";

import { useAppForm } from "@/components/form/index.js";
import { Button } from "@/components/ui/button.js";
import { DialogFooter } from "@/components/ui/dialog.js";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field.js";
import { UserRoleSelect } from "./UserRoleSelect.js";

export const UserCreateFormValues = z.object({
  email: z.email(),
  emailVerified: z.boolean(),
  name: z.string().trim().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: AppRole,
});

export const UserProfileFormValues = z.object({
  email: z.email(),
  emailVerified: z.boolean(),
  name: z.string().trim().min(1),
});

export const UserRoleFormValues = z.object({
  role: AppRole,
});

export const UserPasswordFormValues = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export type UserCreateFormValues = z.infer<typeof UserCreateFormValues>;
export type UserProfileFormValues = z.infer<typeof UserProfileFormValues>;
export type UserRoleFormValues = z.infer<typeof UserRoleFormValues>;
export type UserPasswordFormValues = z.infer<typeof UserPasswordFormValues>;

type UserCreateFormProps = {
  isPending: boolean;
  onSubmit: (value: UserCreateFormValues) => Promise<unknown>;
};

export const UserCreateForm: React.FC<UserCreateFormProps> = ({ isPending, onSubmit }) => {
  const defaultValues: UserCreateFormValues = {
    email: "",
    emailVerified: false,
    name: "",
    password: "",
    role: "product-viewer",
  };
  const form = useAppForm({
    defaultValues,
    validators: {
      onSubmit: UserCreateFormValues,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(UserCreateFormValues.parse(value));
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
            <RoleField
              disabled={isPending}
              errors={field.state.meta.errors}
              name={field.name}
              onRoleChange={(role) => field.handleChange(role)}
              value={field.state.value}
            />
          )}
        </form.AppField>
        <form.AppField name="emailVerified">
          {(field) => <field.CheckboxField label="Email verified" />}
        </form.AppField>
        <form.AppField name="password">
          {(field) => <field.PasswordField autoComplete="new-password" label="Password" />}
        </form.AppField>
      </FieldGroup>
      <SubmitFooter isPending={isPending} label="Create user" />
    </form>
  );
};

type UserProfileFormProps = {
  initialUser: UserSummary;
  isPending: boolean;
  onSubmit: (value: UserProfileFormValues) => Promise<unknown>;
};

export const UserProfileForm: React.FC<UserProfileFormProps> = ({
  initialUser,
  isPending,
  onSubmit,
}) => {
  const form = useAppForm({
    defaultValues: {
      email: initialUser.email,
      emailVerified: initialUser.emailVerified,
      name: initialUser.name,
    } satisfies UserProfileFormValues,
    validators: {
      onSubmit: UserProfileFormValues,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(UserProfileFormValues.parse(value));
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
        <form.AppField name="emailVerified">
          {(field) => <field.CheckboxField label="Email verified" />}
        </form.AppField>
      </FieldGroup>
      <SubmitFooter isPending={isPending} label="Save profile" />
    </form>
  );
};

type UserRoleFormProps = {
  initialUser: UserSummary;
  isPending: boolean;
  onSubmit: (value: UserRoleFormValues) => Promise<unknown>;
};

export const UserRoleForm: React.FC<UserRoleFormProps> = ({ initialUser, isPending, onSubmit }) => {
  const form = useAppForm({
    defaultValues: {
      role: initialUser.role,
    } satisfies UserRoleFormValues,
    validators: {
      onSubmit: UserRoleFormValues,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(UserRoleFormValues.parse(value));
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
        <form.AppField name="role">
          {(field) => (
            <RoleField
              disabled={isPending}
              errors={field.state.meta.errors}
              name={field.name}
              onRoleChange={(role) => field.handleChange(role)}
              value={field.state.value}
            />
          )}
        </form.AppField>
      </FieldGroup>
      <SubmitFooter isPending={isPending} label="Save role" />
    </form>
  );
};

type UserPasswordFormProps = {
  isPending: boolean;
  onSubmit: (value: UserPasswordFormValues) => Promise<unknown>;
};

export const UserPasswordForm: React.FC<UserPasswordFormProps> = ({ isPending, onSubmit }) => {
  const form = useAppForm({
    defaultValues: {
      newPassword: "",
    } satisfies UserPasswordFormValues,
    validators: {
      onSubmit: UserPasswordFormValues,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(UserPasswordFormValues.parse(value));
      form.reset();
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
        <form.AppField name="newPassword">
          {(field) => <field.PasswordField autoComplete="new-password" label="New password" />}
        </form.AppField>
      </FieldGroup>
      <SubmitFooter isPending={isPending} label="Set password" />
    </form>
  );
};

type RoleFieldProps = {
  disabled: boolean;
  errors: Array<{ message?: string } | undefined>;
  name: string;
  value: UserRoleFormValues["role"];
  onRoleChange: (role: UserRoleFormValues["role"]) => void;
};

const RoleField: React.FC<RoleFieldProps> = ({ disabled, errors, name, onRoleChange, value }) => (
  <Field data-invalid={errors.length > 0}>
    <FieldLabel htmlFor={name}>Role</FieldLabel>
    <UserRoleSelect disabled={disabled} onRoleChange={onRoleChange} value={value} />
    <FieldError errors={errors} />
  </Field>
);

type SubmitFooterProps = {
  isPending: boolean;
  label: string;
};

const SubmitFooter: React.FC<SubmitFooterProps> = ({ isPending, label }) => (
  <DialogFooter className="mt-4" showCloseButton>
    <Button disabled={isPending} type="submit">
      {isPending ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
      {label}
    </Button>
  </DialogFooter>
);
