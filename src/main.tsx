import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';
import './lib/install';
import { completeLogin } from './lib/pkce';
import { useSettings } from './lib/store';
import { toast, toastError } from './lib/toast';

registerSW({ immediate: true });

completeLogin()
  .then((key) => {
    if (key) {
      useSettings.getState().set({ apiKey: key });
      toast('Signed in with OpenRouter', 'success');
    }
  })
  .catch(toastError);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
