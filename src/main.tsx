import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { hydrate } from './store';
import './index.css';

// shadcn themes switch on a `.dark` class: follow the system preference.
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const applyTheme = () => document.documentElement.classList.toggle('dark', darkQuery.matches);
applyTheme();
darkQuery.addEventListener('change', applyTheme);

const root = createRoot(document.getElementById('root')!);

hydrate().then(
  () =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  (error: unknown) => {
    console.error(error);
    // Never overwrite saved data that failed to load: show the problem instead.
    root.render(
      <div className="mx-auto mt-[15vh] grid max-w-md gap-2.5 p-6 text-sm">
        <h1 className="text-lg font-semibold">Não foi possível carregar seus dados</h1>
        <p>{error instanceof Error ? error.message : String(error)}</p>
        <p>Nada foi alterado. Recarregue a página para tentar de novo.</p>
      </div>,
    );
  },
);
