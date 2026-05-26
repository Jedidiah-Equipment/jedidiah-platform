import type React from 'react';

export type FormFieldComponent = React.ElementType;

export type FieldApi<TValue> = {
  handleBlur: () => void;
  handleChange: (value: TValue) => void;
  state: {
    meta: {
      errors: unknown[];
    };
    value: TValue;
  };
};

export type ArrayFieldApi<TValue> = {
  pushValue: (value: TValue) => void;
  removeValue: (index: number) => void;
  state: {
    value: TValue[];
  };
};
