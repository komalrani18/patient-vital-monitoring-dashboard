import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted via npm: no request to a third-party font CDN from a hospital network.
import '@fontsource-variable/atkinson-hyperlegible-next';
import './index.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
