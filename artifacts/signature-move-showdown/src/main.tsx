import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { Router } from "wouter";
import AccountProvider from "./components/AccountProvider";
import { capturePromoterReferral } from "./lib/promoter-referral";

import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

capturePromoterReferral();
createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <Router base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <AccountProvider><App /></AccountProvider>
      </Router>
    </QueryClientProvider>
  </ErrorBoundary>,
);
