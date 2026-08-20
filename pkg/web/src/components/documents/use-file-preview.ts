import { useCallback, useState } from 'react';

/**
 * The state every `FilePreviewSheet` caller keeps: which file is being previewed, whether the sheet
 * is open, and how many times it has been asked for.
 *
 * The request count is what a *generated* preview puts in its query key — a PDF the API renders per
 * request has to be re-rendered each time the sheet opens, or an edit made since the last look would
 * not show. A caller previewing a filed document ignores it and keys on the document instead.
 */
export function useFilePreview<TFile = never>() {
  const [file, setFile] = useState<TFile | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [request, setRequest] = useState(0);

  const open = useCallback((next?: TFile) => {
    if (next !== undefined) setFile(next);
    setRequest((current) => current + 1);
    setIsOpen(true);
  }, []);

  return { file, isOpen, onOpenChange: setIsOpen, open, request };
}
