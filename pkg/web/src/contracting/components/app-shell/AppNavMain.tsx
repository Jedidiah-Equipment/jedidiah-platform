import { NavSections } from '@/components/app-shell/NavSections.js';
import { contractingNavSections } from './nav-sections.js';

export function AppNavMain() {
  return <NavSections sections={contractingNavSections} closeMobileOnNavigate />;
}
