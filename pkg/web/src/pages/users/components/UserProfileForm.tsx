import { UserSummary, type UserSummary as UserSummaryType } from "@pkg/schema";
import type React from "react";
import { z } from "zod";

import { useAppForm } from "@/components/form/index.js";
import { FieldGroup } from "@/components/ui/field.js";
import { SubmitFooter } from "./UserFormFooter.js";

export type UserProfileFormValues = z.infer<typeof UserProfileFormValues>;
export const UserProfileFormValues = UserSummary.pick({ email: true, emailVerified: true, name: true });

type UserProfileFormProps = {
  initialUser: UserSummaryType;
  isPending: boolean;
  onSubmit: (value: UserProfileFormValues) => Promise<unknown>;
};

export const UserProfileForm: React.FC<UserProfileFormProps> = ({ initialUser, isPending, onSubmit }) => {
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
