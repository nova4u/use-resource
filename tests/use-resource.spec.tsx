import { fireEvent, render, waitFor } from '@testing-library/react';
import React from 'react';
import { type FetchResourceOptions } from '../src/fetch-resource';
import { cache } from '../src/resource-store';
import useResource from '../src/use-resource';

import { beforeEach, describe, expect, it } from 'vitest';
import { MightBePromise } from '../src/types';

function renderWithSuspense(
  ui: React.ReactNode,
  fallbackText: string = 'Loading...'
) {
  return render(ui, {
    wrapper: ({ children }) => (
      <React.Suspense fallback={<div>{fallbackText}</div>}>
        {children}
      </React.Suspense>
    ),
  });
}

type ComponentWithLoaderProps<T> = {
  fetcher: () => MightBePromise<T>;
  options?: FetchResourceOptions;
  resourceKey?: string;
  showStates?: boolean;
  componentId?: string;
};

const ComponentWithLoader = <T,>({
  fetcher,
  options,
  resourceKey = 'test',
  showStates = false,
  componentId,
}: ComponentWithLoaderProps<T>) => {
  const { data, isLoading, isValidating, error, refetch } = useResource<T>(
    resourceKey,
    fetcher,
    options
  );

  const dataTestId = (suffix: string) =>
    componentId ? `${suffix}-${componentId}` : suffix;

  if (isLoading && !showStates) {
    return <div>Loading...</div>;
  }

  return (
    <div data-testid={dataTestId('component')}>
      {showStates && (
        <>
          <div data-testid={dataTestId('is-loading')}>
            {isLoading ? 'true' : 'false'}
          </div>
          <div data-testid={dataTestId('is-validating')}>
            {isValidating ? 'true' : 'false'}
          </div>
        </>
      )}

      {error ? (
        <div data-testid={dataTestId('error')}>{error.message}</div>
      ) : typeof data === 'string' ? (
        <div data-testid={dataTestId('data')}>{data}</div>
      ) : data !== undefined ? (
        <pre data-testid={dataTestId('data')}>
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <div data-testid={dataTestId('data')}>No data</div>
      )}

      <button onClick={refetch} data-testid={dataTestId('refetch-button')}>
        Refetch
      </button>
    </div>
  );
};

describe('useResource', () => {
  beforeEach(() => {
    cache.clear();
  });

  it('should return the data when the resource is fulfilled', async () => {
    const screen = render(
      <ComponentWithLoader
        fetcher={() => Promise.resolve('Hello World')}
        options={{ suspense: false }}
      />
    );

    expect(screen.getByText('Loading...')).toBeDefined();
    await waitFor(() => {
      expect(screen.getByText('Hello World')).toBeDefined();
    });
  });
  it('should instantly return the fetcher is synchronous', () => {
    const screen = render(
      <ComponentWithLoader
        fetcher={() => 'Hello World'}
        options={{ suspense: false }}
      />
    );
    expect(screen.queryByText('Loading...')).toBeNull();
    expect(screen.getByText('Hello World')).toBeDefined();
  });

  it('should render suspense fallback when the resource is pending', async () => {
    const screen = renderWithSuspense(
      <ComponentWithLoader fetcher={() => Promise.resolve('Hello World')} />,
      'Loading Suspense...'
    );

    expect(screen.getByText('Loading Suspense...')).toBeDefined();
    await waitFor(() => {
      expect(screen.getByText('Hello World')).toBeDefined();
    });
  });

  it('should not render suspense fallback when the fetcher is synchronous', async () => {
    const screen = renderWithSuspense(
      <ComponentWithLoader fetcher={() => 'Hello World'} />,
      'Loading Suspense...'
    );

    expect(screen.queryByText('Loading Suspense...')).toBeNull();
    expect(screen.getByText('Hello World')).toBeDefined();
  });

  it('should refetch and update data when refetch is called', async () => {
    const fetcher = (() => {
      let count = 0;
      return () => {
        count++;
        return Promise.resolve(`Hello World ${count}`);
      };
    })();
    const screen = renderWithSuspense(
      <ComponentWithLoader fetcher={fetcher} />,
      'Loading Suspense...'
    );

    expect(await screen.findByText('Hello World 1')).toBeDefined();
    const button = screen.getByTestId('refetch-button');
    fireEvent.click(button);
    expect(await screen.findByText('Hello World 2')).toBeDefined();
  });

  it('should update all components sharing the same key when one refetches', async () => {
    const fetcher = (() => {
      let count = 0;
      return () => {
        count++;
        return Promise.resolve(`Hello World ${count}`);
      };
    })();

    const screen = renderWithSuspense(
      <>
        <ComponentWithLoader
          fetcher={fetcher}
          resourceKey="shared-key"
          componentId="1"
        />
        <ComponentWithLoader
          fetcher={fetcher}
          resourceKey="shared-key"
          componentId="2"
        />
      </>,
      'Loading Suspense...'
    );

    expect(await screen.findByTestId('data-1')).toBeDefined();
    expect(screen.getByTestId('data-1').textContent).toBe('Hello World 1');
    expect(screen.getByTestId('data-2').textContent).toBe('Hello World 1');

    const button1 = screen.getByTestId('refetch-button-1');
    fireEvent.click(button1);

    await waitFor(() => {
      expect(screen.getByTestId('data-1').textContent).toBe('Hello World 2');
      expect(screen.getByTestId('data-2').textContent).toBe('Hello World 2');
    });
  });

  it('should show isLoading and isValidating states with suspense disabled', async () => {
    const screen = render(
      <ComponentWithLoader
        fetcher={() =>
          new Promise(resolve => setTimeout(() => resolve('Data'), 100))
        }
        options={{ suspense: false }}
        showStates
      />
    );

    expect(screen.getByTestId('is-loading').textContent).toBe('true');
    expect(screen.getByTestId('is-validating').textContent).toBe('true');
    expect(screen.getByTestId('data').textContent).toBe('No data');

    await waitFor(() => {
      expect(screen.getByTestId('is-loading').textContent).toBe('false');
      expect(screen.getByTestId('data').textContent).toBe('Data');
    });

    const button = screen.getByTestId('refetch-button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByTestId('is-loading').textContent).toBe('false');
      expect(screen.getByTestId('is-validating').textContent).toBe('true');
    });

    await waitFor(() => {
      expect(screen.getByTestId('is-validating').textContent).toBe('false');
      expect(screen.getByTestId('data').textContent).toBe('Data');
    });
  });

  it('should handle async errors', async () => {
    const screen = render(
      <ComponentWithLoader
        fetcher={() => Promise.reject(new Error('Async error occurred'))}
        options={{ suspense: false }}
        showStates
      />
    );

    expect(screen.getByTestId('is-loading').textContent).toBe('true');
    expect(screen.queryByTestId('error')).toBeNull();

    await waitFor(() => {
      expect(screen.getByTestId('is-loading').textContent).toBe('false');
      expect(screen.getByTestId('error').textContent).toBe(
        'Async error occurred'
      );
    });
  });

  it('should handle sync errors', () => {
    const screen = render(
      <ComponentWithLoader
        fetcher={() => {
          throw new Error('Sync error occurred');
        }}
        options={{ suspense: false }}
        showStates
      />
    );

    expect(screen.getByTestId('is-loading').textContent).toBe('false');
    expect(screen.getByTestId('error').textContent).toBe('Sync error occurred');
  });

  it('should maintain data during revalidation', async () => {
    const fetcher = (() => {
      let count = 0;
      return () => {
        count++;
        return new Promise<string>(resolve =>
          setTimeout(() => resolve(`Data ${count}`), 100)
        );
      };
    })();

    const screen = render(
      <ComponentWithLoader
        fetcher={fetcher}
        options={{ suspense: false }}
        showStates
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('data').textContent).toBe('Data 1');
    });

    const button = screen.getByTestId('refetch-button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByTestId('is-validating').textContent).toBe('true');
      expect(screen.getByTestId('data').textContent).toBe('Data 1');
    });

    await waitFor(() => {
      expect(screen.getByTestId('is-validating').textContent).toBe('false');
      expect(screen.getByTestId('data').textContent).toBe('Data 2');
    });
  });

  it('should handle error during revalidation and keep previous data', async () => {
    const fetcher = (() => {
      let callCount = 0;
      return () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve('Initial data');
        }
        return Promise.reject(new Error('Refetch failed'));
      };
    })();

    const screen = render(
      <ComponentWithLoader
        fetcher={fetcher}
        options={{ suspense: false }}
        showStates
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('data').textContent).toBe('Initial data');
    });

    const button = screen.getByTestId('refetch-button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByTestId('error').textContent).toBe('Refetch failed');
    });
  });
});
