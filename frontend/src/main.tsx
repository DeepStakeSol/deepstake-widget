import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { NetworkProvider } from "./context/NetworkContext";
import './globals.css'
import App from './App.tsx'
import { OptionsContext, Options } from "./options.tsx";
import isolationCSS from './isolation.css?inline';

// Inject isolation rules immediately so host-page element selectors
// (section {}, button {}, h1 {}, etc.) cannot override widget internals.
;(function () {
  const style = document.createElement('style');
  style.setAttribute('data-widget-isolation', 'deepstake');
  style.textContent = isolationCSS;
  document.head.appendChild(style);
})();

document.addEventListener("DOMContentLoaded", () => {
  const elements = new Set<HTMLElement>();

  // Primary: attribute-based discovery (supports multiple instances)
  document.querySelectorAll<HTMLElement>('[data-widget="deepstake"]')
    .forEach(el => elements.add(el));

  // Legacy: id="root" fallback for backward compatibility
  const legacyEl = document.getElementById('root');
  if (legacyEl) elements.add(legacyEl);

  elements.forEach((el) => {
    // Normalize so CSS scoping via [data-widget="deepstake"] always works
    el.dataset.widget = 'deepstake';

    const options: Options = JSON.parse(el.dataset.options || "{}");
    el.dataset.theme = options?.theme || "light";

    createRoot(el).render(
      <StrictMode>
        <OptionsContext.Provider value={options}>
          <NetworkProvider>
            <App />
          </NetworkProvider>
        </OptionsContext.Provider>
      </StrictMode>,
    );
  });
});
