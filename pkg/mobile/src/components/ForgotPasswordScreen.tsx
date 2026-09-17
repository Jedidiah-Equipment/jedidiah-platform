import { EmailAddress } from '@pkg/schema';
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
import { addBreadcrumb } from '@/lib/observability';
import { BrandHeader } from './BrandHeader';
import { Text } from './ui/text';

type ForgotPasswordScreenProps = {
  onBack: () => void;
  requestReset: (email: string) => Promise<void>;
};

export function ForgotPasswordScreen({ onBack, requestReset }: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    if (isSubmitting) return;

    const emailResult = EmailAddress.safeParse(email);

    if (!emailResult.success) {
      setError('Enter a valid email address.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await requestReset(emailResult.data);
    } catch {
      // Use the same response when the request fails so this public screen does
      // not disclose whether the server recognized the submitted address.
      addBreadcrumb('auth', 'password reset request failed');
    } finally {
      setSubmitted(true);
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView
          contentContainerClassName="grow justify-center px-7 py-10"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="w-full">
            <BrandHeader centered subtitle="Reset your password" />

            {submitted ? (
              <View className="gap-5">
                <View accessibilityRole="alert" className="rounded-lg border border-border bg-surface p-4">
                  <Text className="text-base leading-6 text-foreground" weight="semibold">
                    Check your email
                  </Text>
                  <Text className="mt-1 text-sm leading-5 text-muted-foreground">
                    If that email address is associated with an account, you will receive a password reset link shortly.
                  </Text>
                </View>

                <Pressable
                  accessibilityLabel="Back to sign in"
                  accessibilityRole="button"
                  className="min-h-[52px] items-center justify-center rounded-lg border border-border bg-surface px-4"
                  onPress={onBack}
                >
                  <Text className="text-base leading-6 text-foreground" weight="semibold">
                    Back to sign in
                  </Text>
                </Pressable>
              </View>
            ) : (
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
                    onSubmitEditing={handleSubmit}
                    placeholder="name@jedidiahequipment.co.za"
                    returnKeyType="send"
                    textContentType="emailAddress"
                    value={email}
                  />
                </View>

                {error ? (
                  <View accessibilityRole="alert" className="rounded-lg border border-danger bg-surface p-4">
                    <Text className="text-sm leading-5 text-danger">{error}</Text>
                  </View>
                ) : null}

                <Pressable
                  accessibilityLabel="Send reset link"
                  accessibilityRole="button"
                  className={`min-h-[52px] flex-row items-center justify-center gap-2 rounded-lg bg-primary px-4 ${
                    isSubmitting ? 'opacity-60' : ''
                  }`}
                  disabled={isSubmitting}
                  onPress={handleSubmit}
                >
                  {isSubmitting ? <ActivityIndicator className="text-primary-foreground" size="small" /> : null}
                  <Text className="text-base leading-6 text-primary-foreground" weight="bold">
                    {isSubmitting ? 'Sending' : 'Send reset link'}
                  </Text>
                </Pressable>

                <Pressable accessibilityLabel="Back to sign in" accessibilityRole="link" onPress={onBack}>
                  <Text className="text-center text-sm leading-5 text-muted-foreground">Back to sign in</Text>
                </Pressable>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
