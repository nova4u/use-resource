import {
  fetchResource,
  type FetchResourceOptions,
} from '../src/fetch-resource';
import { cache, mutate } from '../src/resource-store';
import { successfullResource, failedResource } from '../src/resource-state';

import {
  PendingResource,
  type ErroredResult,
  type FullfiledResult,
  type Resource,
} from '../src/types';
import { isPromise } from '../src/utils';

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

function syncFetcher<T>(data: T, ms: number = 500): Promise<T> {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(data);
    }, ms);
  });
}

function suspenseWrappedFetchResource<T>(
  fetcher: () => Promise<T>,
  options?: FetchResourceOptions
): Promise<T | Error> {
  return new Promise((resolve, reject) => {
    try {
      const data = fetchResource<T, FetchResourceOptions['suspense']>(
        'test',
        fetcher,
        options
      );
      if (data instanceof Error) {
        return reject(data.message);
      }
      resolve(data as T);
    } catch (thrown) {
      if (isPromise(thrown)) {
        thrown.then(data => {
          const resource = cache.get('test') as Resource<T>;
          if (successfullResource<T>(resource)) {
            resolve(resource.result);
          }

          if (failedResource<T>(resource)) {
            resolve(resource.error);
          }
        });
      }
    }
  });
}

function getResourceByKey<T>(key: string): Resource<T> | undefined {
  return cache.get(key) as Resource<T>;
}

describe('fetchResource - sync operations', () => {
  beforeEach(() => {
    cache.clear();
  });

  it('should work with a sync function', () => {
    const result = fetchResource('test', () => 'Hello World');
    const resource = getResourceByKey('test');
    expect(result).toBe('Hello World');
    expect(resource?.status).toBe('fulfilled');
  });

  it('should return an error if the function throws an error', () => {
    const result = fetchResource('test', () => {
      throw new Error('Hello World');
    });

    expect(result).toBeInstanceOf(Error);
    const error = result as Error;
    const resource = getResourceByKey('test') as ErroredResult<string>;
    expect(error.message).toBe('Hello World');
    expect(resource.status).toBe('rejected');
    expect(resource.error).toBe(error);
    // @ts-expect-error - result is not defined on errored resource
    expect(resource.result).toBeUndefined();
  });
});

describe('fetchResource - async operations', () => {
  beforeEach(() => {
    cache.clear();
  });

  it('should work with a async function', async () => {
    const result = await suspenseWrappedFetchResource(() =>
      syncFetcher('Hello World', 20)
    );
    expect(result).toBe('Hello World');
    const resource = getResourceByKey('test') as FullfiledResult<string>;
    expect(cache.size).toBe(1);
    expect(resource.status).toBe('fulfilled');
    expect(resource.result).toBe('Hello World');
  });

  it('should return an error if the async function throws an error', async () => {
    const result = await suspenseWrappedFetchResource(() =>
      Promise.reject(new Error('wtf'))
    );
    expect(result).toBeInstanceOf(Error);
    const error = result as Error;
    expect(error.message).toBe('wtf');
    const resource = getResourceByKey('test') as ErroredResult<string>;
    expect(resource.status).toBe('rejected');
    expect(resource.error).toBe(error);
    // @ts-expect-error - result is not defined on errored resource
    expect(resource.result).toBeUndefined();
  });

  it('should throw a suspender if the resource is pending and then resolve', async () => {
    const shouldBeCalledOnThrow = vi.fn();
    try {
      fetchResource(
        'test',
        () =>
          new Promise(resolve => setTimeout(() => resolve('Hello World'), 20))
      );
      expect.fail('Should have thrown a promise');
    } catch (thrown) {
      shouldBeCalledOnThrow();
      const resource = getResourceByKey('test') as PendingResource<string>;
      expect(thrown).toBeInstanceOf(Promise);
      expect(thrown).toBe(resource?.suspender);
      expect(resource?.status).toBe('pending');
    }

    expect(shouldBeCalledOnThrow).toHaveBeenCalledTimes(1);

    const suspender = (getResourceByKey('test') as PendingResource<string>)
      ?.suspender;
    await suspender;
    const resource = getResourceByKey('test') as FullfiledResult<string>;
    expect(resource?.status).toBe('fulfilled');
    expect(resource?.result).toBe('Hello World');
  });
});

describe('fetchResource - ttl operations', () => {
  beforeEach(() => {
    cache.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should revalidate the resource if the ttl is expired', async () => {
    const mockedFn = vi.fn(() => Promise.resolve('hoho'));
    let result = await suspenseWrappedFetchResource(mockedFn, { ttl: 0.3 });
    expect(result).toBe('hoho');
    expect(mockedFn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(310);

    result = await suspenseWrappedFetchResource(mockedFn, {
      ttl: 0.3,
    });
    expect(result).toBe('hoho');
    expect(mockedFn).toHaveBeenCalledTimes(2);
  });

  it('should return the cached resource if the ttl is not expired', async () => {
    const mockedFn = vi.fn(() => Promise.resolve('hoho'));
    let result = await suspenseWrappedFetchResource(mockedFn, {
      ttl: 10,
    });
    expect(result).toBe('hoho');
    result = await suspenseWrappedFetchResource(mockedFn, {
      ttl: 10,
    });
    expect(mockedFn).toHaveBeenCalledTimes(1);
  });
});

describe('fetchResource - race conditions', () => {
  beforeEach(() => {
    cache.clear();
  });

  it('should reuse the same suspender when called multiple times with same key while pending', async () => {
    const mockedFn = vi.fn(() => syncFetcher('Hello World', 20));
    let suspender1: Promise<unknown> | undefined;
    let suspender2: Promise<unknown> | undefined;

    try {
      fetchResource('race-test', mockedFn);
      expect.fail('Should have thrown');
    } catch (thrown1) {
      suspender1 = thrown1 as Promise<unknown>;
      expect(thrown1).toBeInstanceOf(Promise);
    }

    try {
      fetchResource('race-test', mockedFn);
      expect.fail('Should have thrown');
    } catch (thrown2) {
      suspender2 = thrown2 as Promise<unknown>;
      expect(thrown2).toBeInstanceOf(Promise);
    }

    expect(suspender1).toBe(suspender2);
    expect(mockedFn).toHaveBeenCalledTimes(1);

    await suspender1;
    const resource = getResourceByKey('race-test') as FullfiledResult<string>;
    expect(resource.status).toBe('fulfilled');
    expect(resource.result).toBe('Hello World');
  });

  it('should not create duplicate fetches on rapid successive calls', async () => {
    const mockedFn = vi.fn(() => syncFetcher('data', 20));
    const promises: Promise<unknown>[] = [];

    for (let i = 0; i < 5; i++) {
      try {
        fetchResource('rapid-test', mockedFn);
        expect.fail('Should have thrown');
      } catch (thrown) {
        promises.push(thrown as Promise<unknown>);
      }
    }

    expect(mockedFn).toHaveBeenCalledTimes(1);
    expect(promises.length).toBe(5);
    expect(promises[0]).toBe(promises[1]);
    expect(promises[0]).toBe(promises[2]);

    await Promise.all(promises);
    const resource = getResourceByKey('rapid-test') as FullfiledResult<string>;
    expect(resource.status).toBe('fulfilled');
  });

  it('should handle concurrent calls with different keys independently', async () => {
    const fn1 = vi.fn(() => syncFetcher('key1', 50));
    const fn2 = vi.fn(() => syncFetcher('key2', 50));

    let suspender1: Promise<unknown> | undefined;
    let suspender2: Promise<unknown> | undefined;

    try {
      fetchResource('key1', fn1);
      expect.fail('Should have thrown');
    } catch (thrown) {
      suspender1 = thrown as Promise<unknown>;
    }

    try {
      fetchResource('key2', fn2);
      expect.fail('Should have thrown');
    } catch (thrown) {
      suspender2 = thrown as Promise<unknown>;
    }

    expect(suspender1).not.toBe(suspender2);
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);

    await Promise.all([suspender1, suspender2]);
    expect(getResourceByKey('key1')?.status).toBe('fulfilled');
    expect(getResourceByKey('key2')?.status).toBe('fulfilled');
  });
});

describe('fetchResource - pending state behavior', () => {
  beforeEach(() => {
    cache.clear();
  });

  it('should throw the same suspender when called while resource is pending', async () => {
    const fetcher = () => syncFetcher('pending-test', 20);
    let firstSuspender: Promise<unknown> | undefined;
    let secondSuspender: Promise<unknown> | undefined;

    try {
      fetchResource('pending-key', fetcher);
      expect.fail('Should have thrown');
    } catch (thrown) {
      firstSuspender = thrown as Promise<unknown>;
    }

    const resourceBeforeSecondCall = getResourceByKey(
      'pending-key'
    ) as PendingResource<string>;
    expect(resourceBeforeSecondCall?.status).toBe('pending');
    expect(resourceBeforeSecondCall?.suspender).toBe(firstSuspender);

    try {
      fetchResource('pending-key', fetcher);
      expect.fail('Should have thrown');
    } catch (thrown) {
      secondSuspender = thrown as Promise<unknown>;
    }

    expect(firstSuspender).toBe(secondSuspender);
    expect(firstSuspender).toBe(resourceBeforeSecondCall?.suspender);

    await firstSuspender;
    const resourceAfter = getResourceByKey(
      'pending-key'
    ) as FullfiledResult<string>;
    expect(resourceAfter.status).toBe('fulfilled');
  });

  it('should maintain pending status until promise resolves', async () => {
    const fetcher = () => syncFetcher('status-test', 20);
    let suspender: Promise<unknown> | undefined;

    try {
      fetchResource('status-key', fetcher);
      expect.fail('Should have thrown');
    } catch (thrown) {
      suspender = thrown as Promise<unknown>;
    }

    const resource = getResourceByKey('status-key');
    expect(resource?.status).toBe('pending');

    await suspender;
    const resolvedResource = getResourceByKey(
      'status-key'
    ) as FullfiledResult<string>;
    expect(resolvedResource.status).toBe('fulfilled');
  });
});

describe('fetchResource - version tracking', () => {
  beforeEach(() => {
    cache.clear();
  });

  it('should start with version 0 for new resources', () => {
    const result = fetchResource('version-test', () => 'initial');
    expect(result).toBe('initial');
    const resource = getResourceByKey(
      'version-test'
    ) as FullfiledResult<string>;
    expect(resource.$version).toBe(0);
  });

  it('should increment version when using mutate function', () => {
    fetchResource('mutate-version', () => 'original');
    const resource1 = getResourceByKey(
      'mutate-version'
    ) as FullfiledResult<string>;
    expect(resource1.$version).toBe(0);

    const mutated = mutate('mutate-version', 'mutated');
    expect(mutated).toBe(true);
    const resource2 = getResourceByKey(
      'mutate-version'
    ) as FullfiledResult<string>;
    expect(resource2.$version).toBe(1);
    expect(resource2.result).toBe('mutated');

    mutate('mutate-version', 'mutated-again');
    const resource3 = getResourceByKey(
      'mutate-version'
    ) as FullfiledResult<string>;
    expect(resource3.$version).toBe(2);
  });

  it('should keep version unchanged when returning cached data', async () => {
    const mockedFn = vi.fn(() => Promise.resolve('cached'));
    await suspenseWrappedFetchResource(mockedFn, { ttl: 10 });

    const resource1 = getResourceByKey('test') as FullfiledResult<string>;
    const initialVersion = resource1.$version;

    await suspenseWrappedFetchResource(mockedFn, { ttl: 10 });
    const resource2 = getResourceByKey('test') as FullfiledResult<string>;
    expect(resource2.$version).toBe(initialVersion);
    expect(mockedFn).toHaveBeenCalledTimes(1);
  });

  it('should revalidate resource after TTL expiration', async () => {
    vi.useFakeTimers();

    const mockedFn = vi.fn(() => Promise.resolve('data'));
    await suspenseWrappedFetchResource(mockedFn, { ttl: 0.1 });

    const resource1 = getResourceByKey('test') as FullfiledResult<string>;
    expect(resource1.$version).toBe(0);
    expect(mockedFn).toHaveBeenCalledTimes(1);

    mutate('test', 'mutated');
    const resource2 = getResourceByKey('test') as FullfiledResult<string>;
    expect(resource2.$version).toBe(1);

    // Fast-forward time past TTL expiration (350ms > 100ms)
    vi.advanceTimersByTime(350);
    await suspenseWrappedFetchResource(mockedFn, { ttl: 0.1 });

    // Allow async operations to complete
    await vi.advanceTimersByTimeAsync(50);

    const resource3 = getResourceByKey('test') as FullfiledResult<string>;

    expect(mockedFn).toHaveBeenCalledTimes(2);
    expect(resource3.result).toBe('data');
    expect(resource3.$version).toBe(2);

    vi.useRealTimers();
  });
});

describe('fetchResource - subscriber notifications', () => {
  beforeEach(() => {
    cache.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should notify subscribers when resource transitions from pending to fulfilled', async () => {
    const listener = vi.fn();
    const subscribers = (globalThis as any)
      .__USE_RESOURCE_INTERNAL_SUBSCRIBERS as Map<string, Set<() => void>>;

    if (!subscribers) {
      // Skip test if subscribers not available (production mode)
      return;
    }

    const unsubscribe = () => {
      const subs = subscribers.get('subscriber-test');
      if (subs) {
        subs.delete(listener);
      }
    };

    subscribers.set('subscriber-test', new Set([listener]));

    let suspender: Promise<unknown> | undefined;
    try {
      fetchResource('subscriber-test', () => syncFetcher('notified', 50));
      expect.fail('Should have thrown');
    } catch (thrown) {
      suspender = thrown as Promise<unknown>;
      expect(thrown).toBeInstanceOf(Promise);
    }

    // Subscribers are notified immediately when resource becomes pending (line 260)
    // and again when it transitions to fulfilled (line 250)
    const callCountBeforeResolve = listener.mock.calls.length;
    expect(callCountBeforeResolve).toBeGreaterThan(0);

    // Advance timers to resolve syncFetcher's setTimeout
    await vi.advanceTimersByTimeAsync(60);

    // Subscribers should be notified again when resource becomes fulfilled
    expect(listener).toHaveBeenCalledTimes(callCountBeforeResolve + 1);
    unsubscribe();
  });

  it('should notify all subscribers on the same key', async () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const listener3 = vi.fn();
    const subscribers = (globalThis as any)
      .__USE_RESOURCE_INTERNAL_SUBSCRIBERS as Map<string, Set<() => void>>;

    if (!subscribers) {
      return;
    }

    const key = 'multi-subscriber-test';
    subscribers.set(key, new Set([listener1, listener2, listener3]));

    const unsubscribe = () => {
      const subs = subscribers.get(key);
      if (subs) {
        subs.delete(listener1);
        subs.delete(listener2);
        subs.delete(listener3);
      }
    };

    let suspender: Promise<unknown> | undefined;
    try {
      fetchResource(key, () => syncFetcher('multi', 50));
      expect.fail('Should have thrown');
    } catch (thrown) {
      suspender = thrown as Promise<unknown>;
      expect(thrown).toBeInstanceOf(Promise);
    }

    // Advance timers to resolve syncFetcher's setTimeout
    await vi.advanceTimersByTimeAsync(60);

    expect(listener1).toHaveBeenCalled();
    expect(listener2).toHaveBeenCalled();
    expect(listener3).toHaveBeenCalled();
    unsubscribe();
  });

  it('should not notify unsubscribed listeners', async () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const subscribers = (globalThis as any)
      .__USE_RESOURCE_INTERNAL_SUBSCRIBERS as Map<string, Set<() => void>>;

    if (!subscribers) {
      return;
    }

    const key = 'unsubscribe-test';
    subscribers.set(key, new Set([listener1, listener2]));

    const unsubscribe = () => {
      const subs = subscribers.get(key);
      if (subs) {
        subs.delete(listener1);
      }
    };

    unsubscribe();

    let suspender: Promise<unknown> | undefined;
    try {
      fetchResource(key, () => syncFetcher('unsub', 50));
      expect.fail('Should have thrown');
    } catch (thrown) {
      suspender = thrown as Promise<unknown>;
      expect(thrown).toBeInstanceOf(Promise);
    }

    // Advance timers to resolve syncFetcher's setTimeout
    await vi.advanceTimersByTimeAsync(60);

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).toHaveBeenCalled();

    const subs = subscribers.get(key);
    if (subs) {
      subs.delete(listener2);
    }
  });
});

describe('fetchResource - error handling', () => {
  beforeEach(() => {
    cache.clear();
  });

  it('should convert non-Error objects to Error instances', async () => {
    const result = await suspenseWrappedFetchResource(() =>
      Promise.reject('string error')
    );
    expect(result).toBeInstanceOf(Error);
    const error = result as Error;
    expect(error.message).toBe('string error');

    const resource = getResourceByKey('test') as ErroredResult<string>;
    expect(resource.error).toBeInstanceOf(Error);
    expect(resource.error.message).toBe('string error');
  });

  it('should handle number errors', async () => {
    const result = await suspenseWrappedFetchResource(() =>
      Promise.reject(404)
    );
    expect(result).toBeInstanceOf(Error);
    const error = result as Error;
    expect(error.message).toBe('404');
  });

  it('should handle null/undefined errors', async () => {
    const result = await suspenseWrappedFetchResource(() =>
      Promise.reject(null)
    );
    expect(result).toBeInstanceOf(Error);
    const error = result as Error;
    expect(error.message).toBe('null');
  });
});
