import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';

const el = document.getElementById('root');
if (!el) throw new Error('#root introuvable');

createRoot(el).render(
  <React.StrictMode>
    {/* GitHub Pages ne sait pas reecrire les URL : routage par hash. */}
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
