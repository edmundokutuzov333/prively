import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/hanken-grotesk';
import '@/design/tokens.css';
import '@/lib/i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from '@/app/App';
import { ProductionErrorBoundary } from '@/app/ProductionErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5_000,
    },
  },
});

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      </QueryClientProvider>
    </ProductionErrorBoundary>
  </StrictMode>,
);
