// Dark-mode detection + observation. Replaces the old mermaidTheme.ts —
// now that all renderers are native (no mermaid runtime), we don't need
// `initMermaid()` or the theme-change event bus. Components can just
// observe the `<html>` `.dark` class directly.

/** Reads the current dark-mode flag from the `<html>` `.dark` class. */
export function isDarkMode(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}

/**
 * Observes class changes on the `<html>` element and invokes the callback
 * whenever the `.dark` class toggles. Returns a disposer.
 */
export function watchDarkMode(callback: (dark: boolean) => void): () => void {
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }
  let last = isDarkMode();
  const observer = new MutationObserver(() => {
    const next = isDarkMode();
    if (next !== last) {
      last = next;
      callback(next);
    }
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  return () => observer.disconnect();
}
