import { createSwitch } from '@gluestack-ui/switch';
import { type ComponentProps, type ComponentRef, forwardRef } from 'react';
import { Switch as ReactNativeSwitch, type SwitchProps as ReactNativeSwitchProps } from 'react-native';

import { switchColors } from '@/theme/gluestack-config';
import { useColorMode } from '@/theme/use-color-mode';

type SwitchRootProps = ReactNativeSwitchProps & {
  dataSet?: Record<string, string>;
  states?: Record<string, boolean>;
};

const SwitchRoot = forwardRef<ComponentRef<typeof ReactNativeSwitch>, SwitchRootProps>(function SwitchRoot(
  { dataSet: _dataSet, states: _states, ...props },
  ref,
) {
  const { resolved } = useColorMode();
  const colors = switchColors[resolved];

  return (
    <ReactNativeSwitch
      ios_backgroundColor={colors.offTrack}
      ref={ref}
      thumbColor={colors.thumb}
      trackColor={{ false: colors.offTrack, true: colors.onTrack }}
      {...props}
    />
  );
});

const GluestackSwitch = createSwitch({ Root: SwitchRoot });

export type SwitchProps = ComponentProps<typeof GluestackSwitch>;
export const Switch = GluestackSwitch;
