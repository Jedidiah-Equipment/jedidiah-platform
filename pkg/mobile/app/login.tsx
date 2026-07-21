import { EmailAddress } from '@pkg/schema';
import { IconEye, IconEyeOff } from '@tabler/icons-react-native';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandHeader } from '@/components/BrandHeader';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { signIn, useSession } from '@/lib/auth';

export default function LoginScreen() {
  const { data: session } = useSession();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function handleSignIn() {
    if (isSubmitting) return;

    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }

    const emailResult = EmailAddress.safeParse(email);

    if (!emailResult.success) {
      setError('Enter a valid email address.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const result = await signIn({ email: emailResult.data, password });

    if (!result.ok) {
      setError(result.message);
      setIsSubmitting(false);
      return;
    }

    // On success the session updates and the redirect below sends us to `/`; keep
    // the button in its submitting state until this screen unmounts.
  }

  // Already signed in (including right after a successful sign-in): leave /login.
  if (session) {
    return <Redirect href="/" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView
          contentContainerClassName="grow items-center justify-center px-7 py-10"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="w-full max-w-[430px]">
            <BrandHeader centered subtitle="Sign in to continue" />

            <View className="gap-5">
              <View className="gap-1.5">
                <Text className="text-sm leading-5 text-foreground" weight="semibold">
                  Email
                </Text>
                <TextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  className="min-h-[52px] rounded-lg border border-border bg-surface px-4 font-sans text-[16px] text-foreground placeholder:text-muted-foreground"
                  editable={!isSubmitting}
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  placeholder="name@jedidiahequipment.co.za"
                  returnKeyType="next"
                  textContentType="emailAddress"
                  value={email}
                />
              </View>

              <View className="gap-1.5">
                <Text className="text-sm leading-5 text-foreground" weight="semibold">
                  Password
                </Text>
                {/* Fixed height + clip: iOS's native secureTextEntry field ignores the height set
                    on the TextInput and grows the row, so cap it on the wrapper to match Email. */}
                <View
                  className="flex-row items-center overflow-hidden rounded-lg border border-border bg-surface"
                  style={{ height: 52 }}
                >
                  <TextInput
                    autoCapitalize="none"
                    autoComplete="password"
                    className="flex-1 px-4 font-sans text-[16px] text-foreground placeholder:text-muted-foreground"
                    editable={!isSubmitting}
                    onChangeText={setPassword}
                    onSubmitEditing={handleSignIn}
                    placeholder="Enter your password"
                    returnKeyType="go"
                    secureTextEntry={!showPassword}
                    // Inline height (not a NativeWind class): iOS secureTextEntry renders the custom
                    // font with larger metrics and grows the field; pin it to match the email input.
                    style={{ height: 52 }}
                    textContentType="password"
                    value={password}
                  />
                  <Pressable
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    accessibilityRole="button"
                    className="h-full justify-center px-4"
                    hitSlop={8}
                    onPress={() => setShowPassword((shown) => !shown)}
                  >
                    <Icon className="text-muted-foreground" icon={showPassword ? IconEyeOff : IconEye} size={20} />
                  </Pressable>
                </View>
              </View>

              {error ? (
                <View accessibilityRole="alert" className="rounded-lg border border-danger bg-surface p-4">
                  <Text className="text-sm leading-5 text-danger">{error}</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                className={`mt-2 min-h-[52px] flex-row items-center justify-center gap-2 rounded-lg bg-primary px-4 ${
                  isSubmitting ? 'opacity-60' : ''
                }`}
                disabled={isSubmitting}
                onPress={handleSignIn}
              >
                {isSubmitting ? <ActivityIndicator className="text-primary-foreground" size="small" /> : null}
                <Text className="text-base leading-6 text-primary-foreground" weight="bold">
                  {isSubmitting ? 'Signing in' : 'Sign in'}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
