import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { useSession } from '../lib/auth';
import { theme } from '../src/theme';

export default function RootLayout() {
  return (
    <>
      <AuthRedirect />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: theme.colors.background },
          headerShown: false,
        }}
      />
      <StatusBar style="dark" />
    </>
  );
}

function AuthRedirect() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (isPending) return;

    const isLoginRoute = pathname === '/login';

    if (!session && !isLoginRoute) {
      router.replace('/login');
      return;
    }

    if (session && isLoginRoute) {
      router.replace('/');
    }
  }, [isPending, pathname, router, session]);

  return null;
}
