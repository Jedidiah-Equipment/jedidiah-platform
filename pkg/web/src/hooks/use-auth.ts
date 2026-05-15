import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { authClient } from '@/lib/auth-client.js';
import { clearReactQueryCache } from '@/lib/trpc-cache.js';

export function useAuth() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session, isPending } = authClient.useSession();
  const userName = session?.user.name || 'Signed in';
  const userEmail = session?.user.email || 'Account active';

  async function onSignOut() {
    await authClient.signOut();
    clearReactQueryCache(queryClient);
    await navigate({ to: '/login' });
  }

  return {
    isPending,
    onSignOut,
    session,
    user: {
      name: userName,
      email: userEmail,
      initials: getInitials(userName, userEmail),
    },
  };
}

function getInitials(name: string, email: string) {
  const source = name === 'Signed in' ? email : name;
  const parts = source
    .replace(/@.*$/, '')
    .split(/[\s._-]+/)
    .filter(Boolean);

  return (parts[0]?.[0] ?? 'J').concat(parts[1]?.[0] ?? 'E').toUpperCase();
}
