import type { FieldImplement } from '@pkg/schema/contracting';
import type { SearchSelectFieldOption } from '@/components/form/fields/SearchSelectField';
import { CategoryIcon } from './CategoryIcon';

/** An Implement as a picker row, naming the Job it is on site at when it is busy elsewhere. */
export function implementOption(implement: FieldImplement, onJob: string | null): SearchSelectFieldOption {
  return {
    value: implement.id,
    label: implement.code,
    description: onJob ? `${implement.categoryName} · On Job ${onJob}` : implement.categoryName,
    icon: <CategoryIcon icon={implement.categoryIcon} colour={implement.categoryColour} size={16} />,
  };
}
