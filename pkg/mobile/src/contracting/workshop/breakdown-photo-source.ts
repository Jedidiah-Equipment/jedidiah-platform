import { breakdownPhotoPath } from '@pkg/domain/contracting';
import { Directory, File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/authed-fetch';
import { captureSanitizedException } from '@/lib/observability';

export type BreakdownPhotoSource = { kind: 'failed' | 'loading' } | { kind: 'ready'; uri: string };

const inFlight = new Map<string, Promise<string>>();

/** A Breakdown photo never changes once stored, so its cache file is keyed by its id alone. */
export function useBreakdownPhotoSource(breakdownId: string, photoId: string): BreakdownPhotoSource {
  const [source, setSource] = useState<BreakdownPhotoSource>({ kind: 'loading' });
  useEffect(() => {
    let active = true;
    resolvePhotoUri(breakdownId, photoId)
      .then((uri) => {
        if (active) setSource({ kind: 'ready', uri });
      })
      .catch((error) => {
        captureSanitizedException(error, 'Breakdown photo loading failed', { source: 'breakdown_photo' });
        if (active) setSource({ kind: 'failed' });
      });
    return () => {
      active = false;
    };
  }, [breakdownId, photoId]);
  return source;
}

async function resolvePhotoUri(breakdownId: string, photoId: string): Promise<string> {
  const directory = new Directory(Paths.cache, 'breakdown-photos');
  const target = new File(directory, `${photoId}.img`);
  if (target.exists) return target.uri;
  const pending = inFlight.get(photoId);
  if (pending) return pending;
  const request = (async () => {
    directory.create({ idempotent: true, intermediates: true });
    const response = await authedFetch(breakdownPhotoPath(breakdownId, photoId));
    if (!response.ok) throw new Error(`Couldn’t download the Breakdown photo (${response.status}).`);
    const temporary = new File(directory, `${photoId}.${Date.now()}.tmp`);
    try {
      temporary.create({ intermediates: true, overwrite: true });
      temporary.write(new Uint8Array(await response.arrayBuffer()));
      await temporary.move(target);
      return target.uri;
    } catch (error) {
      if (temporary.exists) temporary.delete();
      if (target.exists) return target.uri;
      throw error;
    }
  })().finally(() => inFlight.delete(photoId));
  inFlight.set(photoId, request);
  return request;
}
