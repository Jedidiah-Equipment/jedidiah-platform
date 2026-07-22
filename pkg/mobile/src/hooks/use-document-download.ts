import { useState } from 'react';
import { Alert } from 'react-native';

import { type DocumentAction, saveDocument } from '@/lib/document-actions';

export function useDocumentDownload(action: DocumentAction): { download: () => Promise<void>; isDownloading: boolean } {
  const [isDownloading, setIsDownloading] = useState(false);

  const download = async () => {
    if (isDownloading) return;

    setIsDownloading(true);
    try {
      await saveDocument(action);
    } catch (error) {
      Alert.alert('Couldn’t download document', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  return { download, isDownloading };
}
