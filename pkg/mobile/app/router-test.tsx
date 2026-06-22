import { Text, View } from 'react-native';

import { apiBaseUrl } from '@/lib/api-base-url';

export default function RouterTestScreen() {
  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: '#0a0a0b',
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 28,
      }}
    >
      <Text style={{ color: '#fff000', fontSize: 30, fontWeight: '800', marginBottom: 12, textAlign: 'center' }}>
        Router Test
      </Text>
      <Text style={{ color: '#fafafa', fontSize: 16, lineHeight: 24, marginBottom: 8, textAlign: 'center' }}>
        Expo Router rendered a public route after fonts and providers mounted.
      </Text>
      <Text style={{ color: '#7a7a82', fontSize: 13, lineHeight: 20, textAlign: 'center' }}>
        API base: {apiBaseUrl}
      </Text>
    </View>
  );
}
