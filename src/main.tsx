import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { ConfirmHost } from './ui/confirm';
import { HelpHost } from './ui/help';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <ConfirmHost />
    <HelpHost />
  </StrictMode>,
);
