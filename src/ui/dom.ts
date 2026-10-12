/** Minimal DOM helpers (no framework: the UI is small and mostly static). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  html = '',
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

export function button(cls: string, html: string, onTap: (e: Event) => void, parent?: HTMLElement) {
  const b = el('button', cls, html, parent);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onTap(e);
  });
  return b;
}

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
