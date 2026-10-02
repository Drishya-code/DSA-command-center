import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { AuthProvider } from '@/context/AuthContext';
import { AuthGate } from '@/components/auth/AuthGate';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    }).catch((error: unknown) => {
      console.error('The offline app worker could not be registered.', error);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider><AuthGate /></AuthProvider>
  </StrictMode>,
);
