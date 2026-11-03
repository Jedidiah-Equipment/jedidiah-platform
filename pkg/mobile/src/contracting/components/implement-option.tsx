import { onJobNote } from '@pkg/domain/contracting';
import type { FieldImplement } from '@pkg/schema/contracting';
import type { SearchSelectFieldOption } from '@/components/form/fields/SearchSelectField';
import { CategoryIcon } from './CategoryIcon';

/** An Implement as a picker row, naming the Job it is on site at when it is busy elsewhere. */
export function implementOption(implement: FieldImplement): SearchSelectFieldOption {
  return {
    value: implement.id,
    label: implement.code,
    description: [implement.categoryName, onJobNote(implement)].filter(Boolean).join(' · '),
    icon: <CategoryIcon icon={implement.categoryIcon} colour={implement.categoryColour} size={16} />,
  };
}
