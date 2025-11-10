import { Resource, SuccessfullResource } from './types';

export interface ResourceStore {
  cache: Map<string, Resource<unknown>>;
  subscribers: Map<string, Set<() => void>>;
  subscribe: (key: string, listener: () => void) => () => void;
  notifySubscribers: (key: string) => void;
  mutate: <T>(key: string, data: T) => boolean;
  getResourceByKey: <T>(key: string) => Resource<T> | undefined;
  isSettled: <T>(
    resource: Resource<T> | undefined
  ) => resource is Extract<Resource<T>, { $version: number }>;
}

export function createResourceStore(): ResourceStore {
  const cache = new Map<string, Resource<unknown>>();
  const subscribers = new Map<string, Set<() => void>>();

  function subscribe(key: string, listener: () => void) {
    subscribers.set(
      key,
      subscribers.get(key)?.add(listener) ?? new Set([listener])
    );

    return () => subscribers.get(key)?.delete(listener);
  }

  function notifySubscribers(key: string) {
    const _subscribers = subscribers.get(key);
    if (_subscribers) {
      _subscribers.forEach(sub => sub());
    }
  }

  function mutate<T>(key: string, data: T): boolean {
    const resource = cache.get(key) as Resource<T>;
    if (
      resource &&
      resource.status !== 'pending' &&
      resource.status !== 'revalidating'
    ) {
      const newResource: SuccessfullResource<T> = {
        status: 'fulfilled',
        result: data,
        timestamp: Date.now(),
        $version: resource.$version + 1,
      };

      cache.set(key, newResource);
      notifySubscribers(key);
      return true;
    }
    return false;
  }

  function getResourceByKey<T>(key: string): Resource<T> | undefined {
    return cache.get(key) as Resource<T> | undefined;
  }

  function isSettled<T>(
    resource: Resource<T> | undefined
  ): resource is Extract<Resource<T>, { $version: number }> {
    return !!resource && 'timestamp' in resource;
  }

  return {
    cache,
    subscribers,
    subscribe,
    notifySubscribers,
    mutate,
    getResourceByKey,
    isSettled,
  };
}

export const defaultResourceStore = createResourceStore();

// function makeGlobal(n: string, t: unknown) {
//   (globalThis as any)[`__USE_RESOURCE_INTERNAL_${n.toLocaleUpperCase()}`] = t;
// }

// makeGlobal('cache', defaultResourceStore.cache);
// makeGlobal('subscribers', defaultResourceStore.subscribers);

export const cache = defaultResourceStore.cache;
export const subscribers = defaultResourceStore.subscribers;
export const mutate = defaultResourceStore.mutate;
