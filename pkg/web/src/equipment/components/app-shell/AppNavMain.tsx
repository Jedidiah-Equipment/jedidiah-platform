import { NavSections } from '@/components/app-shell/NavSections.js';
import { equipmentNavSections } from './nav-sections.js';

export function AppNavMain() {
  return <NavSections sections={equipmentNavSections} />;
}
