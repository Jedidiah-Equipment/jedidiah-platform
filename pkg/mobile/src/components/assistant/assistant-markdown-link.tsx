import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';

import { Text } from '@/components/ui/text';
import { resolveAssistantLink } from '@/lib/assistant-links';

export function AssistantMarkdownLink({ children, href }: { children: ReactNode; href: string }) {
  const router = useRouter();
  const navigate = resolveAssistantLink(href, router);

  return (
    <AssistantMarkdownLinkContent
      navigate={navigate}
      onNavigate={(go) => {
        router.back();
        go();
      }}
    >
      {children}
    </AssistantMarkdownLinkContent>
  );
}

export function AssistantMarkdownLinkContent({
  children,
  navigate,
  onNavigate,
}: {
  children: ReactNode;
  navigate: (() => void) | null;
  onNavigate: (navigate: () => void) => void;
}) {
  if (!navigate) {
    return (
      <Text className="text-foreground" weight="semibold">
        {children}
      </Text>
    );
  }

  return (
    <Text
      accessibilityRole="link"
      className="text-primary underline"
      onPress={() => onNavigate(navigate)}
      weight="semibold"
    >
      {children}
    </Text>
  );
}
