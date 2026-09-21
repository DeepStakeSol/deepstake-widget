import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
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
import { WidgetTelemetry } from './components/WidgetTelemetry.tsx';
import { getConfiguredNetwork } from './utils/config.ts';
import { getEffectiveTabs } from './utils/effectiveTabs.ts';

const ROOTS_KEY = Symbol.for('deepstake.widget.roots');
const MOUNTED_FLAG = 'deepstakeMounted';
const rootsHost = window as Window & { [ROOTS_KEY]?: WeakMap<HTMLElement, Root> };
const roots = rootsHost[ROOTS_KEY] ??= new WeakMap<HTMLElement, Root>();

export const version = import.meta.env.VITE_WIDGET_VERSION;

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
    if (el.dataset[MOUNTED_FLAG] === '1') return;
    el.dataset[MOUNTED_FLAG] = '1';
    // Normalize so CSS scoping via [data-widget="deepstake"] always works
    el.dataset.widget = 'deepstake';
    el.dataset.theme = 'dark';

    try {
      const options = parseWidgetOptions(el.dataset.options);
      el.dataset.theme = options.theme || 'dark';
      const network = getConfiguredNetwork(options);
      const effectiveTabs = getEffectiveTabs(options.tabs, network);

      const root = createRoot(el);
      roots.set(el, root);
      root.render(
        <StrictMode>
          <WidgetErrorBoundary mountElement={el}>
            <OptionsContext.Provider value={options}>
              <NetworkProvider>
                <App />
                <WidgetTelemetry
                  options={options}
                  network={network}
                  tabs={effectiveTabs.tabs}
                />
              </NetworkProvider>
            </OptionsContext.Provider>
          </WidgetErrorBoundary>
        </StrictMode>,
      );
    } catch (error) {
      console.error("[DeepStake widget] invalid config", el, error);
      const root = createRoot(el);
      roots.set(el, root);
      root.render(
        <WidgetFallback message="DeepStake widget: invalid configuration, check data-options" />,
      );
    }
  });
}

export function unmountDeepStakeWidget(el: HTMLElement) {
  roots.get(el)?.unmount();
  roots.delete(el);
  delete el.dataset[MOUNTED_FLAG];
}

export const mount = mountDeepStakeWidgets;
export const unmount = unmountDeepStakeWidget;

// The old IIFE name remains available to existing integrations.
window.MyWidget = { mountDeepStakeWidgets };

export function startDeepStakeWidget() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountDeepStakeWidgets, { once: true });
  } else {
    mountDeepStakeWidgets();
  }
}

startDeepStakeWidget();
