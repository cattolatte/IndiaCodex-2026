/**
 * Small pure formatting helpers used by the cockpit. Kept free of React so they
 * are trivially unit-testable.
 */

/**
 * Escape untrusted text before it is interpolated into raw HTML.
 *
 * The contagion graph renders `nodeLabel` as raw HTML (react-force-graph sets it
 * via innerHTML), and node labels include user-uploaded source titles (see
 * /api/upload — judges can bring their own document). Because sources live in
 * shared registry memory and every dashboard viewer polls the same /api/state, an
 * unescaped title such as `<img src=x onerror=…>` would be **stored XSS** against
 * every viewer, not merely self-XSS. Escaping the label neutralises that while
 * leaving ordinary titles byte-for-byte unchanged.
 */
export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
