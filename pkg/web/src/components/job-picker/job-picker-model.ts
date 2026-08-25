import { parseJobCodeSearch } from '@pkg/domain';
import { formatJobCode, type JobPickerOption, type JobPickerTab } from '@pkg/schema';

export const JOB_PICKER_TABS = [
  { label: 'Last updated', tab: 'updated' },
  { label: 'Last created', tab: 'created' },
  { label: 'Not complete', tab: 'incomplete' },
] as const satisfies readonly { label: string; tab: JobPickerTab }[];

export const DEFAULT_JOB_PICKER_TAB: JobPickerTab = 'updated';

/**
 * What the search matches, said out loud. A reader who cannot see which fields a search reaches
 * types the one thing they remember and reads an empty list as "no such Job".
 */
export const JOB_PICKER_SEARCH_PLACEHOLDER = 'Search by Job code, Product, work title, or Customer';

/** How many rows a tab paints before the reader asks for more. */
export const JOB_PICKER_PAGE_SIZE = 25;

export type JobPickerModel = {
  /** Whether the tab holds Jobs beyond the rendered window; never a silent truncation. */
  hasMore: boolean;
  rows: JobPickerOption[];
  /** Every Job matching the tab and the search, not just the rendered ones. */
  total: number;
};

/**
 * The rows one tab of the picker shows, for a caller that already holds every Job. Search runs
 * across the whole set before the tab narrows it, so a Job that is only reachable under a different
 * tab still disappears rather than misleading — the tab is the list, and search narrows that list.
 */
export function buildJobPickerModel({
  limit = JOB_PICKER_PAGE_SIZE,
  options,
  search,
  tab,
}: {
  limit?: number;
  options: readonly JobPickerOption[];
  search: string;
  tab: JobPickerTab;
}): JobPickerModel {
  const matching = options
    .filter((option) => (tab === 'incomplete' ? option.completedOn === null : true))
    .filter((option) => matchesJobPickerSearch(option, search))
    .sort((left, right) => compareJobPickerOptions(left, right, tab));

  return {
    hasMore: matching.length > limit,
    rows: matching.slice(0, limit),
    total: matching.length,
  };
}

/**
 * The picker's global search: the four facts a reader remembers a Job by. A bare or shortened code
 * is resolved through the Job Code parser rather than matched as text, so `JOB-42` finds the Job the
 * list calls `JOB-00042`.
 */
export function matchesJobPickerSearch(option: JobPickerOption, search: string): boolean {
  const normalized = search.trim().toLocaleLowerCase();
  if (!normalized) return true;

  const parsedCode = parseJobCodeSearch(search);
  if (parsedCode !== undefined && formatJobCode(parsedCode) === option.code) return true;

  return [option.code, option.productName, option.workTitle, option.customerCompanyName].some((field) =>
    field?.toLocaleLowerCase().includes(normalized),
  );
}

/**
 * Newest first on the tab's own date, with the Job id breaking ties — the same order the server-paged
 * picker reads, so the two never disagree about which Job leads a list.
 */
function compareJobPickerOptions(left: JobPickerOption, right: JobPickerOption, tab: JobPickerTab): number {
  const date = (option: JobPickerOption) => (tab === 'created' ? option.createdAt : option.updatedAt);

  return date(right).localeCompare(date(left)) || left.id.localeCompare(right.id);
}
