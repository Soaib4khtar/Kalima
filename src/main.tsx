import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from "react-router";

// QueryClient = the central "cache brain" of TanStack Query.
// It holds all the fetched data, tracks loading/error states,
// manages background refetching, and deduplicates requests.
// ONE QueryClient instance is shared across the whole app.
//
// QueryClientProvider = a React Context Provider that makes the
// QueryClient accessible to every component in the tree via hooks
// like useQuery() and useMutation(). Without this wrapper,
// useQuery() would throw an error because it can't find the client.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import './index.css'
import App from './App.tsx'
import { AuthProvider } from './features/auth/AuthProvider'

// Create ONE QueryClient for the entire app.
// defaultOptions lets you set behavior for all queries globally:
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // How long (ms) until cached data is considered "stale" and
      // should be refetched. 30 seconds is a good default for most data.
      staleTime: 1000 * 30,

      // If a query fails, how many times should TanStack Query retry it?
      // 1 retry is usually enough — prevents hammering a broken server.
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* QueryClientProvider must wrap BrowserRouter (and everything else)
        so that ALL components in the app can use useQuery() */}
    <QueryClientProvider client={queryClient}>
      <AuthProvider><BrowserRouter>
        <App />
      </BrowserRouter></AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
