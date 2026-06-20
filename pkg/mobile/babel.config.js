// babel-preset-expo auto-adds the Reanimated/worklets plugin when
// react-native-worklets is installed, so it must not be listed here.
// NativeWind needs the `nativewind` JSX runtime plus its babel preset.
module.exports = (api) => {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
