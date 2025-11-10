import { isPromise } from './utils';
import {
  MightBePromise,
  Resource,
  ResourceStatus,
  RevalidatingResource,
  PendingResource,
} from './types';
import { ResourceStore, defaultResourceStore } from './resource-store';
import { isStale } from './resource-state';

export type FetchResourceOptions = {
  ttl?: number;
  suspense?: boolean;
};

type FetchResourceInternal = {
  force?: boolean;
};

/**
 * Creates a resource fetcher function with caching, deduplication, and TTL support.
 *
 * @param store - The resource store instance for caching and subscriptions
 * @returns A configured fetchResource function
 */
export function createFetchResource(store: ResourceStore) {
  /**
   * Fetches and caches data with automatic deduplication and TTL-based revalidation.
   *
   * @template Result - The type of data returned by the fetcher function
   * @template S - Whether Suspense mode is enabled (boolean | undefined)
   *
   * @param key - Unique identifier for the resource. Used for caching and deduplication.
   * @param fn - Function that returns data synchronously or asynchronously
   * @param options - Optional configuration
   * @param options.ttl - Time-to-live in seconds before cache expires. Default: `60`
   * @param options.suspense - Enable Suspense mode (throws promise while loading). Default: `true`
   * @param options.force - Force refetch, bypassing cache. Default: `false`
   *
   * @returns
   * - When `suspense: false`: Returns `Result | Error | undefined`
   *   - `undefined` during initial load
   *   - `Error` if fetch failed
   *   - `Result` if successful
   * - When `suspense: true` (default): Returns `Result | Error` or throws Promise
   *   - Throws Promise during initial load (caught by Suspense)
   *   - Returns `Error` if fetch failed
   *   - Returns `Result` if successful
   *
   * @throws {Promise} When in Suspense mode and resource is pending
   *
   * @internal This is an internal function. Use `useResource` hook instead.
   */
  return function fetchResource<
    Result,
    S extends boolean | undefined = undefined,
  >(
    key: string,
    fn: (...args: unknown[]) => MightBePromise<Result>,
    options?: Omit<FetchResourceOptions, 'suspense'> & {
      suspense?: S;
    } & FetchResourceInternal
  ): S extends false ? Result | Error | undefined : Result | Error {
    let resource = store.cache.get(key) as Resource<Result>;
    const ttl = options?.ttl ?? 60;
    const suspense = options?.suspense ?? true;
    const shouldRevalidate = isStale(ttl, resource) || options?.force;
    let result: Result;
    let error: Error;
    let status: ResourceStatus;

    /**
     * Executes the fetcher function and updates the cache.
     * Handles both synchronous and asynchronous fetchers.
     * Sets up promise suspender for async operations.
     */
    function handleOperation() {
      // Increment version for cache invalidation tracking
      const nextVersion = store.isSettled(resource) ? resource.$version + 1 : 0;
      let mightBePromise;
      try {
        mightBePromise = fn();

        // Synchronous fetcher: immediately update cache and return
        if (!isPromise(mightBePromise)) {
          resource = {
            status: 'fulfilled',
            result: mightBePromise,
            timestamp: Date.now(),
            $version: nextVersion,
          };

          store.cache.set(key, resource);
          store.notifySubscribers(key);
          return;
        }
      } catch (error) {
        // Synchronous error: cache the error immediately
        resource = {
          status: 'rejected',
          error: error as Error,
          timestamp: Date.now(),
          $version: nextVersion,
        };

        store.cache.set(key, resource);
        return;
      }

      // Async fetcher: create suspender promise
      const suspender = mightBePromise
        .then(r => {
          status = 'fulfilled';
          result = r;
        })
        .catch(e => {
          status = 'rejected';
          error = e instanceof Error ? e : new Error(String(e));
          return e;
        })
        .finally(() => {
          // Update cache with final result/error when promise resolves
          resource = {
            status,
            result,
            error,
            suspender,
            timestamp: Date.now(),
            $version: nextVersion,
          };
          store.cache.set(key, resource);
          store.notifySubscribers(key);
        });

      // Immediately cache the pending/revalidating resource with suspender
      const newResource = {
        ...resource,
        suspender,
        status,
      } as RevalidatingResource<Result> | PendingResource<Result>;
      resource = newResource;
      store.cache.set(key, newResource);
      store.notifySubscribers(key);
    }

    // Initial fetch: no cached resource exists
    if (!resource) {
      status = 'pending';
      handleOperation();
    }

    // Revalidation: cache exists but is stale (TTL expired) or force refetch
    if (shouldRevalidate) {
      status = 'revalidating';
      handleOperation();
    }

    // Resource is still loading
    if (resource.status === 'pending') {
      if (suspense) throw resource.suspender; // Throw for Suspense to catch
      return undefined as ReturnType<typeof fetchResource<Result, S>>; // Return undefined in non-Suspense mode
    }

    // Fetch failed, return error
    if (resource.status === 'rejected') {
      return resource.error;
    }

    // Success: return the cached result
    return resource.result;
  };
}

export const fetchResource = createFetchResource(defaultResourceStore);
