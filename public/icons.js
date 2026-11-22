const paths = {
  search: '<circle cx="10.5" cy="10.5" r="6.8"/><path d="m16 16 5 5"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M4.7 21v-2a7.3 7.3 0 0 1 14.6 0v2"/>',
  heart:
    '<path d="M20.5 5.7a5.1 5.1 0 0 0-7.3 0L12 6.9l-1.2-1.2a5.1 5.1 0 0 0-7.3 7.1L12 21l8.5-8.2a5.1 5.1 0 0 0 0-7.1Z"/>',
  bag: '<path d="M5 7.5h14l1 13H4l1-13Z"/><path d="M8.5 9V6a3.5 3.5 0 0 1 7 0v3"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  left: '<path d="m14.5 5-7 7 7 7"/>',
  right: '<path d="m9.5 5 7 7-7 7"/>',
  box: '<path d="m3 7 9-4.5L21 7v10l-9 4.5L3 17Zm0 0 9 4.5L21 7M12 11.5v10m-4.5-17 9 4.5v4"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13"/><path d="M12 8C6 9 4.5 5.8 6.2 4.1 8 2.3 11.8 5.4 12 8c.2-2.6 4-5.7 5.8-3.9C19.5 5.8 18 9 12 8Z"/>',
  leaf: '<path d="M20.7 3.5c-1.5 4.7 1 10-4 14.2-3.6 2.8-8.6 2-10.2-1.8C3.7 8.8 10.8 4.7 20.7 3.5Z"/><path d="M3 21c2-4.2 6.4-9 12.6-12.7"/>',
  lock: '<rect x="4.5" y="10" width="15" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  truck:
    '<path d="M2 5h12v12H2zM14 9h4l4 4v4h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  x: '<path d="m5 5 14 14M19 5 5 19"/>',
  filter:
    '<path d="M3 7h18M3 17h18"/><circle cx="8" cy="7" r="2.1" fill="currentColor"/><circle cx="15" cy="17" r="2.1" fill="currentColor"/>',
  spark:
    '<path d="M12 2c.9 6.2 3.8 9.1 10 10-6.2.9-9.1 3.8-10 10C11.1 15.8 8.2 12.9 2 12c6.2-.9 9.1-3.8 10-10Z"/>',
};
export const icon = (key, cls = "") =>
  '<svg class="glyph ' +
  cls +
  '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  (paths[key] || "") +
  "</svg>";
