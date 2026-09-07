import { useLocation } from '@tanstack/react-router';
import { AppNavHelp as SharedAppNavHelp } from '@/components/app-shell/AppNavHelp.js';
import { helpTopicForPath } from '@/equipment/lib/help-topics.js';

export function AppNavHelp() {
  const pathname = useLocation({ select: (location) => location.pathname });
  return <SharedAppNavHelp topic={helpTopicForPath(pathname)} />;
}
