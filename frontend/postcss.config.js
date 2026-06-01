/** @type {import('postcss-load-config').Config} */
import prefixSelector from 'postcss-prefix-selector';

const WIDGET_SELECTOR = '[data-widget="deepstake"]';

const config = {
  plugins: [
    prefixSelector({
      prefix: WIDGET_SELECTOR,
      transform(prefix, selector, prefixedSelector) {
        // Already prefixed — avoid doubling up
        if (selector.includes(WIDGET_SELECTOR)) return selector;
        // Keep :root global so Radix UI CSS token declarations stay reachable
        if (selector.includes(':root')) return selector;
        // Keep html/body selectors global
        if (/^html\b|^body\b/.test(selector)) return selector;
        return prefixedSelector;
      },
    }),
  ],
};

export default config;
