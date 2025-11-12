# use-resource

A lightweight React library for efficient data fetching and caching with built-in Suspense support, preventing unnecessary re-renders and network requests.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Features](#features)
- [Live Demo](#live-demo)
- [API Reference](#api-reference)
  - [useResource](#useresourcekey-fetcher-options)
  - [mutate (⚠️ Experimental)](#mutate--experimental)
- [Advanced Usage](#advanced-usage)
- [Best Practices](#best-practices)
- [TypeScript Support](#typescript-support)
- [Comparison with Other Solutions](#comparison-with-other-solutions)
- [Requirements](#requirements)

## Features

- 🎯 **Smart Caching** - Automatic request deduplication and intelligent cache management
- ⚡ **React Suspense** - First-class Suspense support for elegant loading states
- 🔄 **Automatic Revalidation** - Configurable TTL-based cache invalidation
- 🎨 **Flexible Loading States** - `isLoading` and `isValidating` for fine-grained UI control
- 🔒 **Type-safe** - Full TypeScript support with automatic type inference
- 🪶 **Lightweight** - Minimal dependencies, small bundle size
- 🚀 **Performance Optimized** - Components sharing the same key share data and state

## Live Demo

Explore an interactive demo showcasing some of the features:

- **Suspense Mode** - React Suspense integration with loading fallbacks
- **Error Handling** - ErrorBoundary catching errors from failed fetches
- **Optimistic Updates** - Instant UI updates with `mutate()` and proper rollback
- **Shared State** - Multiple components sharing the same resource key
- **Loading States** - Fine-grained control with `isLoading` and `isValidating`

Run the demo locally:

```bash
cd example
pnpm install
pnpm dev
```

## Installation

```bash
pnpm add @dmrk/use-resource
```

## Quick Start

### With Suspense (Recommended)

```tsx
import { useResource } from '@dmrk/use-resource';

function User({ userId }: { userId: string }) {
  const { data } = useResource(`user-${userId}`, () =>
    fetch(`/api/users/${userId}`).then(res => res.json())
  );

  return <div>Hello, {data.name}!</div>;
}

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <User userId="123" />
    </Suspense>
  );
}
```

### Without Suspense

```tsx
function User({ userId }: { userId: string }) {
  const { data, error, isLoading, refetch } = useResource(
    `user-${userId}`,
    () => fetch(`/api/users/${userId}`).then(res => res.json()),
    { suspense: false }
  );

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <p>Hello, {data.name}!</p>
      <button onClick={refetch}>Refresh</button>
    </div>
  );
}
```

## API Reference

### `useResource(key, fetcher, options?)`

The main hook for fetching and caching data.

**Parameters:**

- `key` (string): Unique identifier for the resource. Components with the same key share cached data.
- `fetcher` (() => T | Promise<T>): Function that returns data synchronously or asynchronously.
- `options` (optional):
  - `suspense` (boolean): Enable Suspense mode. Default: `true`
  - `ttl` (number): Time-to-live in seconds. Resource revalidates after expiration. Default: `60`

**Returns:**

```tsx
{
  data: T | undefined;           // The fetched data
  error: Error | undefined;      // Error if fetch failed
  isLoading: boolean;            // true during initial load (no data yet)
  isValidating: boolean;         // true during any fetch (initial or refetch)
  refetch: () => void;           // Manually trigger a refetch
}
```

**State Behavior:**

| Status         | isLoading | isValidating | data         | Description                |
| -------------- | --------- | ------------ | ------------ | -------------------------- |
| `pending`      | ✅ true   | ✅ true      | ❌ undefined | Initial fetch in progress  |
| `fulfilled`    | ❌ false  | ❌ false     | ✅ available | Data loaded successfully   |
| `revalidating` | ❌ false  | ✅ true      | ✅ available | Refetching with stale data |
| `rejected`     | ❌ false  | ❌ false     | ❌ undefined | Fetch failed with error    |

**Examples:**

```tsx
// Basic usage
const { data } = useResource('todos', fetchTodos);

// With TTL (revalidates every 5 minutes)
const { data } = useResource('user', fetchUser, { ttl: 300 });

// Without Suspense
const { data, isLoading, error } = useResource('posts', fetchPosts, {
  suspense: false,
});

// Synchronous fetcher
const { data } = useResource('config', () => ({
  theme: 'dark',
  language: 'en',
}));
```

### `mutate(key, data)` ⚠️ Experimental

> **Warning:** This API is experimental and may change in future versions.

Manually update cached data without refetching. Useful for optimistic updates.

**Parameters:**

- `key` (string): The resource key to update
- `data` (T): New data to set in cache

**Returns:**

- `boolean`: `true` if mutation succeeded, `false` if resource is currently pending/revalidating

**Example:**

```tsx
import { mutate } from '@dmrk/use-resource';

function TodoList() {
  const { data: todos, refetch } = useResource('todos', fetchTodos, {
    suspense: false,
  });

  const addTodo = async (text: string) => {
    const newTodo = { id: Date.now(), text, completed: false };

    // Optimistically update UI
    mutate('todos', [...(todos || []), newTodo]);

    try {
      await fetch('/api/todos', {
        method: 'POST',
        body: JSON.stringify(newTodo),
      });
    } catch (error) {
      // Revert on error by refetching
      refetch();
    }
  };

  return (
    <div>
      {todos?.map(todo => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
      <button onClick={() => addTodo('New task')}>Add</button>
    </div>
  );
}
```

**Limitations:**

- Cannot mutate resources that are currently pending or revalidating
- Does not trigger network requests (use `refetch()` for that)
- API may change in future versions

## Advanced Usage

### Shared State Between Components

Multiple components using the same key automatically share data and state:

```tsx
function UserProfile() {
  const { data } = useResource('current-user', fetchCurrentUser);
  return <div>{data.name}</div>;
}

function UserAvatar() {
  const { data, refetch } = useResource('current-user', fetchCurrentUser);
  // ✅ Shares the same data as UserProfile
  // ✅ refetch() updates both components
  return <img src={data.avatar} onClick={refetch} />;
}
```

### Conditional Fetching

```tsx
function User({ userId }: { userId: string | null }) {
  const { data } = useResource(
    userId ? `user-${userId}` : 'no-user',
    userId ? () => fetchUser(userId) : () => null
  );

  if (!userId) return <div>No user selected</div>;
  return <div>{data.name}</div>;
}
```

### Dependent Queries

```tsx
function UserPosts({ userId }: { userId: string }) {
  const { data: user } = useResource(`user-${userId}`, () => fetchUser(userId));

  const { data: posts } = useResource(`posts-${user.id}`, () =>
    fetchUserPosts(user.id)
  );

  return <PostList posts={posts} />;
}
```

### Error Boundaries with Suspense

```tsx
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return <div>Error: {this.state.error.message}</div>;
    }
    return this.props.children;
  }
}

function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div>Loading...</div>}>
        <User userId="123" />
      </Suspense>
    </ErrorBoundary>
  );
}
```

## Best Practices

### ✅ Use Descriptive Keys

```tsx
// Good: Descriptive, unique keys
useResource(`user-${userId}`, () => fetchUser(userId));
useResource(`posts-${userId}-page-${page}`, () => fetchPosts(userId, page));

// Bad: Generic keys
useResource('data', fetchData);
```

### ✅ Set Appropriate TTL

```tsx
// Frequently changing data: short TTL
useResource('stock-price', fetchStockPrice, { ttl: 10 });

// Rarely changing data: long TTL
useResource('countries', fetchCountries, { ttl: 3600 });

// Static data: no TTL
useResource('app-config', fetchConfig);
```

### ✅ Handle Loading and Error States

```tsx
// With Suspense: wrap in Suspense and ErrorBoundary
<ErrorBoundary>
  <Suspense fallback={<Spinner />}>
    <DataComponent />
  </Suspense>
</ErrorBoundary>;

// Without Suspense: check isLoading and error
const { data, isLoading, error } = useResource('data', fetchData, {
  suspense: false,
});
if (isLoading) return <Spinner />;
if (error) return <ErrorMessage error={error} />;
```

### ⚠️ Avoid Dynamic Keys Without Memoization

```tsx
// Bad: Creates new key on every render
useResource(`user-${Date.now()}`, fetchUser);

// Good: Stable key
const key = useMemo(() => `user-${userId}`, [userId]);
useResource(key, fetchUser);
```

## TypeScript Support

**Automatic type inference** - TypeScript automatically infers the return type from your fetcher function:

```tsx
interface User {
  id: string;
  name: string;
  email: string;
}

async function fetchUser(userId: string): Promise<User> {
  const res = await fetch(`/api/users/${userId}`);
  return res.json();
}

function UserProfile({ userId }: { userId: string }) {
  // ✅ TypeScript automatically infers data as User from fetchUser's return type
  // No need to pass generic <User>!
  const { data, error, refetch } = useResource(
    `user-${userId}`,
    () => fetchUser(userId),
    { suspense: false }
  );

  if (!data) return null;

  // ✅ TypeScript knows data.name, data.email exist
  return (
    <div>
      <h1>{data.name}</h1>
      <p>{data.email}</p>
    </div>
  );
}

// You can also use inline async functions with explicit return types
function PostList() {
  const { data } = useResource('posts', async (): Promise<Post[]> => {
    const res = await fetch('/api/posts');
    return res.json();
  });

  // ✅ data is automatically typed as Post[]
  return (
    <div>
      {data.map(post => (
        <PostItem key={post.id} post={post} />
      ))}
    </div>
  );
}

// Only pass generic when you can't infer the type (rare cases)
const { data } = useResource<User>(
  'user',
  () => fetch('/api/user').then(r => r.json()) // r.json() returns any
);
```

## Comparison with Other Solutions

> **Note:** `use-resource` is a minimal, experimental library built for exploration. It intentionally lacks many advanced features found in mature libraries. Choose based on your project's needs.

### vs SWR

| Feature                   | SWR                                                      | use-resource       |
| ------------------------- | -------------------------------------------------------- | ------------------ |
| **Bundle Size**           | ~5KB                                                     | ~2KB               |
| **Suspense Support**      | ✅ Optional                                              | ✅ Default         |
| **TypeScript Inference**  | Good                                                     | Excellent          |
| **API Complexity**        | Moderate                                                 | Minimal            |
| **Community & Ecosystem** | Large, mature                                            | Experimental       |
| **Advanced Features**     | Middleware, focus revalidation, optimistic UI, mutations | Basic caching only |
| **Sync Fetchers**         | ❌                                                       | ✅                 |
| **Setup Required**        | None                                                     | None               |
| **Production Ready**      | ✅                                                       | ⚠️ Experimental    |

### vs React Query

| Feature                   | React Query                                                                                     | use-resource       |
| ------------------------- | ----------------------------------------------------------------------------------------------- | ------------------ |
| **Bundle Size**           | ~13KB                                                                                           | ~2KB               |
| **Suspense Support**      | ✅ Via hooks                                                                                    | ✅ Default         |
| **TypeScript Inference**  | Good                                                                                            | Excellent          |
| **API Complexity**        | Complex (powerful)                                                                              | Minimal (limited)  |
| **Community & Ecosystem** | Largest                                                                                         | Experimental       |
| **Advanced Features**     | Devtools, infinite queries, mutations, prefetching, query invalidation, retry logic, pagination | Basic caching only |
| **Setup Required**        | QueryClient provider                                                                            | None               |
| **Learning Curve**        | Steeper                                                                                         | Minimal            |
| **Production Ready**      | ✅                                                                                              | ⚠️ Experimental    |

### vs Manual useEffect + useState

| Feature                   | useEffect + useState | use-resource          |
| ------------------------- | -------------------- | --------------------- |
| **Bundle Size**           | 0 (built-in)         | ~2KB                  |
| **Code Required**         | High boilerplate     | One hook call         |
| **Caching**               | Manual               | Automatic             |
| **Request Deduplication** | Manual               | Automatic             |
| **Race Conditions**       | Must handle manually | Handled automatically |
| **Loading States**        | Manual               | Automatic             |
| **Suspense Support**      | Manual integration   | Built-in              |
| **Type Safety**           | Manual typing        | Inferred              |

## Requirements

- React 18.0.0 or higher (for Suspense support)

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Author

dmrk
