import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { NetworkProvider } from "./context/NetworkContext";
import './globals.css'
import App from './App.tsx'
import { OptionsContext } from "./options.tsx";
import isolationCSS from './isolation.css?inline';
import { parseWidgetOptions } from './utils/widgetOptions.ts';
import {
  WidgetErrorBoundary,
  WidgetFallback,
} from './components/WidgetErrorBoundary.tsx';

// Inject isolation rules immediately so host-page element selectors
// (section {}, button {}, h1 {}, etc.) cannot override widget internals.
;(function () {
  const style = document.createElement('style');
  style.setAttribute('data-widget-isolation', 'deepstake');
  style.textContent = isolationCSS;
  document.head.appendChild(style);
})();

export function mountDeepStakeWidgets() {
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
    el.dataset.theme = 'dark';

    try {
      const options = parseWidgetOptions(el.dataset.options);
      el.dataset.theme = options.theme || 'dark';

      createRoot(el).render(
        <StrictMode>
          <WidgetErrorBoundary mountElement={el}>
            <OptionsContext.Provider value={options}>
              <NetworkProvider>
                <App />
              </NetworkProvider>
            </OptionsContext.Provider>
          </WidgetErrorBoundary>
        </StrictMode>,
      );
    } catch (error) {
      console.error("[DeepStake widget] invalid config", el, error);
      createRoot(el).render(
        <WidgetFallback message="DeepStake widget: invalid configuration, check data-options" />,
      );
    }
  });
}

document.addEventListener("DOMContentLoaded", mountDeepStakeWidgets);
