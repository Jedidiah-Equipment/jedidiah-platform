import { forwardRef } from 'react';
import { TextInput as RNTextInput, type TextInput as RNTextInputType, type TextInputProps } from 'react-native';

import { useColorMode } from '@/theme/use-color-mode';

// `placeholderTextColor` is a native-only prop RN can't read from a NativeWind
// class, so resolve the muted-foreground triplet per scheme (mirrors
// `--color-muted-foreground` in theme/gluestack-config.ts).
const PLACEHOLDER_COLOR = { dark: 'rgb(122, 122, 130)', light: 'rgb(115, 115, 115)' } as const;

// Font size only — no line height. iOS bottom-aligns TextInput glyphs inside any
// lineHeight taller than the font, so single-line inputs must not set one; multiline
// inputs get their leading back below since they are top-aligned anyway.
const TEXT_SIZE_CLASS_NAMES = {
  default: 'text-[14px]',
  toolbar: 'text-toolbar',
} as const;

export type AppTextInputProps = TextInputProps & {
  className?: string;
  textSize?: keyof typeof TEXT_SIZE_CLASS_NAMES;
};

/**
 * App text input primitive — the first input surface in the mobile app. Defaults
 * to the Geist body font and the semantic border/surface tokens so callers never
 * repeat them, and resolves the placeholder colour from the active scheme.
 */
export const TextInput = forwardRef<RNTextInputType, AppTextInputProps>(function TextInput(
  { className, textSize = 'default', ...props },
  ref,
) {
  const { resolved } = useColorMode();

  return (
    <RNTextInput
      className={`rounded-xl border border-border bg-surface px-3 py-2.5 font-sans text-surface-foreground ${TEXT_SIZE_CLASS_NAMES[textSize]} ${props.multiline ? 'leading-5' : ''} ${className ?? ''}`}
      placeholderTextColor={PLACEHOLDER_COLOR[resolved]}
      ref={ref}
      {...props}
    />
  );
});
