import type { JobPickerOption, JobPickerTab } from '@pkg/schema/equipment';
import { useCallback, useMemo, useState } from 'react';

import {
  buildJobPickerModel,
  DEFAULT_JOB_PICKER_TAB,
  JOB_PICKER_PAGE_SIZE,
  type JobPickerModel,
} from './job-picker-model.js';

/**
 * What `JobPicker` reads, whichever end owns the list. A caller holding every Job answers it from
 * memory through {@link useJobPicker}; one that cannot answers it a page at a time from the server.
 * Same contract either way, so the popup never has to know which it is talking to.
 */
export type JobPickerController = {
  activeTab: JobPickerTab;
  error: unknown;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onOpen: () => void;
  rows: readonly JobPickerOption[];
  search: string;
  setActiveTab: (tab: JobPickerTab) => void;
  setSearch: (search: string) => void;
  total: number;
};

/**
 * The picker over a list the caller already holds — the Board's own Jobs, the Jobs a dialog loaded.
 * Keeping it in the browser preserves what those surfaces mean by their list: the Board filters the
 * Jobs it is showing, and a picker that could reach past them would filter the Board down to nothing.
 */
export function useJobPicker({
  defaultTab = DEFAULT_JOB_PICKER_TAB,
  isLoading = false,
  options,
}: {
  defaultTab?: JobPickerTab;
  isLoading?: boolean;
  options: readonly JobPickerOption[];
}): JobPickerController {
  const [activeTab, setActiveTab] = useState<JobPickerTab>(defaultTab);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(JOB_PICKER_PAGE_SIZE);
  const model: JobPickerModel = useMemo(
    () => buildJobPickerModel({ limit, options, search, tab: activeTab }),
    [activeTab, limit, options, search],
  );
  // A new tab or a new search is a new list, so the window it paints starts over — otherwise a
  // reader who once pressed Load more carries that depth into every later search.
  const restart = useCallback(() => setLimit(JOB_PICKER_PAGE_SIZE), []);

  return {
    activeTab,
    error: null,
    hasMore: model.hasMore,
    isLoading,
    isLoadingMore: false,
    onLoadMore: () => setLimit((current) => current + JOB_PICKER_PAGE_SIZE),
    onOpen: useCallback(() => {
      setSearch('');
      restart();
    }, [restart]),
    rows: model.rows,
    search,
    setActiveTab: useCallback(
      (tab: JobPickerTab) => {
        setActiveTab(tab);
        restart();
      },
      [restart],
    ),
    setSearch: useCallback(
      (next: string) => {
        setSearch(next);
        restart();
      },
      [restart],
    ),
    total: model.total,
  };
}
