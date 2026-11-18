import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById('root')!, {
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      {import.meta.env.BASE_URL === '/' ? (
        <App />
      ) : (
        <Router hook={useHashLocation}>
          <App />
        </Router>
      )}
    </QueryClientProvider>
  </ErrorBoundary>,
);
