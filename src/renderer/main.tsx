import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <h1 className="p-8 font-display text-4xl">LEBLOC</h1>
  </StrictMode>,
);
