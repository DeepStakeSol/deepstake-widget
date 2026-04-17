import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { NetworkProvider } from "./context/NetworkContext";
import './globals.css'
import App from './App.tsx'

import { setOptions } from "./options.tsx";

document.addEventListener("DOMContentLoaded", () => {

  const el = document.getElementById('root')!;
  const options = JSON.parse(el.dataset.options || "[]");
  el.dataset.theme = options?.theme || "light";

  setOptions(options);

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <NetworkProvider>
        <App />
      </NetworkProvider>
    </StrictMode>,
  )
});

