import { RouterProvider } from 'react-router-dom';
import { QueryProvider } from '@/components/providers/query-provider';
import { router } from './router';
import { Toaster } from '@medicore/ui';

function App() {
  return (
    <QueryProvider>
      <RouterProvider router={router} />
      <Toaster />
    </QueryProvider>
  );
}

export default App;
