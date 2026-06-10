// Shared helper for components that inject a one-off global <style> tag on
// mount and remove it on unmount. Each injector owns its own singleton tag, so
// repeated calls (e.g. React StrictMode's double-invoke) won't duplicate it.
//
// Returns a function suitable for use inside useEffect:
//   const injectStyles = createStyleInjector(css);
//   useEffect(() => injectStyles(), []);
export function createStyleInjector(css: string): () => () => void {
  let styleTag: HTMLStyleElement | null = null;

  return () => {
    if (typeof document === "undefined") {
      return () => {};
    }

    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.textContent = css;
      document.head.appendChild(styleTag);
    }

    // Cleanup: remove the injected tag.
    return () => {
      if (styleTag && styleTag.parentNode) {
        styleTag.parentNode.removeChild(styleTag);
        styleTag = null;
      }
    };
  };
}
