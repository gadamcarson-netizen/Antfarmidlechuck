/*
 * Blocks the easy ways to open Chrome's developer tools on the game: the
 * right-click menu (which has Inspect) and the usual keys (F12, Ctrl+Shift+I,
 * J or C, Cmd+Option+I, J or C, and Ctrl+U / Cmd+Option+U for the page
 * source). It can't stop someone opening them from chrome://extensions or
 * Chrome's own menu. To turn this off (to debug), delete this file and its
 * <script src="no-inspect.js"> line in popup.html.
 */

'use strict';

window.addEventListener('contextmenu', (event) => event.preventDefault(), true);

window.addEventListener('keydown', (event) => {
  const key = event.code;   // (the key itself: on a Mac, Option changes event.key to another letter)
  const mod = event.ctrlKey || event.metaKey;
  const tools = key === 'F12' ||
    (mod && event.shiftKey && ['KeyI', 'KeyJ', 'KeyC'].includes(key)) ||               // Ctrl+Shift+I / J / C
    (event.metaKey && event.altKey && ['KeyI', 'KeyJ', 'KeyC', 'KeyU'].includes(key)) ||   // Cmd+Option+I / J / C / U (Mac)
    (event.ctrlKey && !event.shiftKey && key === 'KeyU');                                  // Ctrl+U: page source
  if (!tools) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);
