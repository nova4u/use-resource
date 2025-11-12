import { ErrorInfo, Suspense, useState, Activity } from 'react';
import { ErrorBoundary, FallbackProps } from 'react-error-boundary';
import { useResource, mutate } from '@dmrk/use-resource';
import './app.css';

const logError = (error: Error, info: ErrorInfo) => {
  console.error('Error caught by boundary:', error, info);
};

function createUnreliableFetcher() {
  let callCount = 0;
  return async () => {
    callCount++;
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (callCount % 2 === 0) {
      throw new Error(`Simulated network error on call #${callCount}`);
    }

    return {
      message: `Success! (call #${callCount})`,
      timestamp: new Date().toISOString(),
      callCount,
    };
  };
}

function createUserFetcher() {
  let callCount = 0;
  return async () => {
    callCount++;
    await new Promise(resolve => setTimeout(resolve, 800));

    return {
      name: `User ${callCount}`,
      email: `user${callCount}@example.com`,
      fetchedAt: new Date().toISOString(),
      version: callCount,
    };
  };
}

type Todo = {
  id: number;
  text: string;
  completed: boolean;
};

function createTodoFetcher() {
  return async (): Promise<Todo[]> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    return [
      { id: 1, text: 'Learn use-resource', completed: true },
      { id: 2, text: 'Build awesome apps', completed: false },
    ];
  };
}

const unreliableFetcher = createUnreliableFetcher();
const userFetcher = createUserFetcher();
const todoFetcher = createTodoFetcher();

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="error-boundary">
      <h3>Something went wrong</h3>
      <pre>{error.message}</pre>
      <button className="button" onClick={resetErrorBoundary}>
        Try again
      </button>
    </div>
  );
}

const tabs = [
  { id: 'suspense', label: 'Suspense Mode', component: SuspenseDemo },
  { id: 'errors', label: 'Error Handling', component: ErrorHandlingDemo },
  {
    id: 'optimistic',
    label: 'Optimistic Updates',
    component: OptimisticUpdatesDemo,
  },
  { id: 'shared', label: 'Shared State', component: SharedStateDemo },
  { id: 'nostates', label: 'Loading States', component: LoadingStatesDemo },
];

function App() {
  const [activeTab, setActiveTab] = useState<string>('suspense');

  return (
    <div className="app">
      <div className="header">
        <h1>use-resource demo</h1>
        <p>
          Explore data fetching with Suspense, caching, and optimistic updates
        </p>
      </div>

      <div className="tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {tabs.map(tab => (
        <Activity
          key={tab.id}
          mode={activeTab === tab.id ? 'visible' : 'hidden'}
        >
          <tab.component />
        </Activity>
      ))}
    </div>
  );
}

function SuspenseDemo() {
  return (
    <div className="section">
      <h2>Suspense Mode (Default)</h2>
      <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
        Data fetching with React Suspense. The fallback shows while loading.
      </p>

      <ErrorBoundary FallbackComponent={ErrorFallback} onError={logError}>
        <Suspense fallback={<LoadingCard />}>
          <UserCard />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

function UserCard() {
  const { data, refetch, isValidating } = useResource(
    'user-suspense',
    userFetcher
  );

  return (
    <div className="card">
      <h3>User Profile</h3>
      <div className="data-display">
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </div>
      <button className="button" onClick={refetch} disabled={isValidating}>
        {isValidating ? 'Refetching...' : 'Refetch'}
      </button>
    </div>
  );
}

function ErrorHandlingDemo() {
  const [key, setKey] = useState(0);

  return (
    <div className="section">
      <h2>Error Handling with ErrorBoundary</h2>
      <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
        In Suspense mode, errors throw and are caught by ErrorBoundary. Click
        "Refetch" to trigger an error, then "Try Again" to recover.
      </p>

      <ErrorBoundary
        FallbackComponent={ErrorFallback}
        onError={logError}
        resetKeys={[key]}
        onReset={() => setKey(k => k + 1)}
      >
        <Suspense fallback={<LoadingCard message="Fetching data..." />}>
          <UnreliableComponent cacheKey={`unreliable-${key}`} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

function UnreliableComponent({ cacheKey }: { cacheKey: string }) {
  const { data, refetch, error, isValidating } = useResource(
    cacheKey,
    unreliableFetcher
  );

  if (error) {
    throw error;
  }

  return (
    <div className="card">
      <h3> Data Loaded Successfully</h3>
      <div className="data-display">
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </div>
      <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '1rem 0' }}>
        💡 Click "Refetch" to trigger an error that will be caught by the
        ErrorBoundary
      </p>
      <button className="button" onClick={refetch} disabled={isValidating}>
        {isValidating ? 'Refetching...' : 'Refetch (will error)'}
      </button>
    </div>
  );
}

function OptimisticUpdatesDemo() {
  return (
    <div className="section">
      <h2>Optimistic Updates</h2>
      <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
        UI updates instantly with <code>mutate()</code> before server
        confirmation.
      </p>

      <ErrorBoundary FallbackComponent={ErrorFallback} onError={logError}>
        <Suspense fallback={<LoadingCard />}>
          <TodoList />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

function TodoList() {
  const { data: todos, refetch } = useResource<Todo[]>('todos', todoFetcher);
  const [newTodoText, setNewTodoText] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const addTodo = async () => {
    if (!newTodoText.trim() || !todos) return;

    setIsAdding(true);
    const newTodo: Todo = {
      id: Date.now(),
      text: newTodoText,
      completed: false,
    };

    const previousTodos = todos;
    mutate('todos', [...todos, newTodo]);
    setNewTodoText('');

    try {
      // simulate API call
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          if (Math.random() < 0.2) {
            reject(new Error('Failed to add todo'));
          } else {
            resolve(true);
          }
        }, 1000);
      });
    } catch (error) {
      // Revert only the failed todo, keep successfully added ones
      alert('Failed to add todo! Reverting this item...');
      mutate('todos', previousTodos);
    } finally {
      setIsAdding(false);
    }
  };

  const toggleTodo = (id: number) => {
    if (!todos) return;
    const updated = todos.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    );
    mutate('todos', updated);
  };

  return (
    <div className="card">
      <h3>Todo List</h3>

      <div className="input-group">
        <input
          type="text"
          className="input"
          placeholder="Add a new todo..."
          value={newTodoText}
          onChange={e => setNewTodoText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTodo()}
        />
        <button
          className="button"
          onClick={addTodo}
          disabled={isAdding || !newTodoText.trim()}
        >
          {isAdding ? 'Adding...' : 'Add'}
        </button>
      </div>

      <ul className="todo-list">
        {todos?.map(todo => (
          <li
            key={todo.id}
            className={`todo-item ${todo.completed ? 'completed' : ''}`}
          >
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => toggleTodo(todo.id)}
            />
            <span>{todo.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SharedStateDemo() {
  return (
    <div className="section">
      <h2>Shared State</h2>
      <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
        Multiple components using the same key share data. Refetch in one
        updates all.
      </p>

      <ErrorBoundary FallbackComponent={ErrorFallback} onError={logError}>
        <Suspense fallback={<LoadingCard />}>
          <div className="grid">
            <SharedComponent id="A" />
            <SharedComponent id="B" />
          </div>
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

function SharedComponent({ id }: { id: string }) {
  const { data, refetch } = useResource('shared-user', userFetcher);

  return (
    <div className="card">
      <h3>Component {id}</h3>
      <div className="data-display">
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </div>
      <button className="button" onClick={refetch}>
        Refetch from {id}
      </button>
    </div>
  );
}

function LoadingStatesDemo() {
  return (
    <div className="section">
      <h2>Loading States (suspense: false)</h2>
      <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
        Fine-grained control with <code>isLoading</code> and{' '}
        <code>isValidating</code>
      </p>

      <LoadingStatesComponent />
    </div>
  );
}

function LoadingStatesComponent() {
  const { data, error, isLoading, isValidating, refetch } = useResource(
    'loading-states',
    userFetcher,
    { suspense: false }
  );

  return (
    <div className="card">
      <h3>
        User Data
        {isLoading && (
          <span className="status-badge status-loading">Loading</span>
        )}
        {isValidating && !isLoading && (
          <span className="status-badge status-validating">Revalidating</span>
        )}
        {error && <span className="status-badge status-error">Error</span>}
      </h3>

      <div className="info-box" style={{ marginBottom: '1rem' }}>
        <p>
          <strong>isLoading:</strong> {isLoading ? '✅ true' : '❌ false'}
        </p>
        <p>
          <strong>isValidating:</strong> {isValidating ? '✅ true' : '❌ false'}
        </p>
        <p>
          <strong>error:</strong> {error ? '✅ present' : '❌ null'}
        </p>
        <p>
          <strong>data:</strong> {data ? '✅ present' : '❌ undefined'}
        </p>
      </div>

      {error && (
        <div className="error-boundary" style={{ marginBottom: '1rem' }}>
          <p>{error.message}</p>
        </div>
      )}

      {data && (
        <div className="data-display">
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </div>
      )}

      <button className="button" onClick={refetch} disabled={isValidating}>
        {isValidating ? 'Refetching...' : 'Refetch'}
      </button>
    </div>
  );
}

function LoadingCard({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="card">
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
        <p style={{ color: '#94a3b8', margin: 0 }}>{message}</p>
      </div>
    </div>
  );
}

export default App;
