import { useRouter } from 'expo-router';

import { ForgotPasswordScreen } from '@/components/ForgotPasswordScreen';
import { requestPasswordReset } from '@/lib/auth';

export default function ForgotPasswordRoute() {
  const router = useRouter();

  return <ForgotPasswordScreen onBack={() => router.replace('/login')} requestReset={requestPasswordReset} />;
}
