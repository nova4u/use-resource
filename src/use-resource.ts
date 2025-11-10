import { RefObject, useCallback, useRef, useSyncExternalStore } from 'react';
import { MightBePromise, type Resource } from './types';
import { isPromise } from './utils';
import { defaultResourceStore } from './resource-store';
import { successfullResource } from './resource-state';
import { fetchResource, FetchResourceOptions } from './fetch-resource';

/**
 * Hook for fetching and caching data with automatic deduplication and Suspense support.
 *
 * @template T - The type of data returned by the fetcher function
 *
 * @param key - Unique identifier for the resource. Components with the same key share cached data.
 * @param fetcher - Function that returns data synchronously or asynchronously
 * @param options - Optional configuration
 * @param options.suspense - Enable Suspense mode (throws promise while loading). Default: `true`
 * @param options.ttl - Time-to-live in seconds before cache expires. Default: `60`
 *
 * @returns Object containing:
 * - `data` - The fetched data (undefined during initial load or on error)
 * - `error` - Error object if fetch failed (undefined otherwise)
 * - `isLoading` - `true` during initial load when no data exists yet
 * - `isValidating` - `true` during any fetch operation (initial or refetch)
 * - `refetch` - Function to manually trigger a refetch
 *
 * @example
 * ```tsx
 * // With Suspense (default)
 * function User() {
 *   const { data } = useResource('user', () => fetchUser());
 *   return <div>{data.name}</div>;
 * }
 *
 * // Without Suspense
 * function User() {
 *   const { data, isLoading, error } = useResource(
 *     'user',
 *     () => fetchUser(),
 *     { suspense: false }
 *   );
 *   if (isLoading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   return <div>{data.name}</div>;
 * }
 * ```
 */
export default function useResource<T>(
  key: string,
  fetcher: (...args: unknown[]) => MightBePromise<T>,
  options?: FetchResourceOptions
) {
  fetchResource<T, FetchResourceOptions['suspense']>(
    key,
    fetcher,
    options
      ? {
          ttl: options.ttl,
          suspense: options.suspense,
        }
      : undefined
  );

  const initialResource = defaultResourceStore.getResourceByKey<T>(key);
  const lastVersionRef = useRef<number | null>(
    successfullResource(initialResource) ? initialResource.$version : null
  );

  const subscribe = useCallback(
    (listener: () => void) => defaultResourceStore.subscribe(key, listener),
    [key]
  );

  const getSnapshot = useCallback(
    () => readResourceSnapshot<T>(key, lastVersionRef),
    [key]
  );

  const resource = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const refetch = useCallback(() => {
    try {
      fetchResource(key, fetcher, { force: true });
    } catch (thrown) {
      if (isPromise(thrown)) {
        return;
      }
      throw thrown;
    }
  }, [key, fetcher]);

  const status = resource?.status;
  const isValidating = status === 'pending' || status === 'revalidating';
  const isLoading = status === 'pending';
  const hasData = status === 'fulfilled' || status === 'revalidating';
  const hasError = status === 'rejected';

  return {
    data: hasData && resource ? resource.result : undefined,
    error: hasError && resource ? resource.error : undefined,
    isLoading,
    isValidating,
    refetch,
  };
}

function readResourceSnapshot<T>(
  key: string,
  lastVersionRef: RefObject<number | null>
): Resource<T> | undefined {
  const resource = defaultResourceStore.getResourceByKey<T>(key);

  if (!resource) {
    lastVersionRef.current = null;
    return undefined;
  }

  switch (resource.status) {
    case 'fulfilled':
    case 'revalidating': {
      if (resource.$version !== lastVersionRef.current) {
        lastVersionRef.current = resource.$version;
      }
      return resource;
    }
    case 'rejected':
      lastVersionRef.current = null;
      return resource;
    case 'pending':
      return resource;
    default:
      return resource;
  }
}
