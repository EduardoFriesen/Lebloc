// Layout checks that run in the page. They are strings because the e2e tsconfig has no DOM types.

/**
 * Every visible text that sticks out of its card or tile (anything drawn with rounded-2xl), measured on the text itself.
 * Screen-reader-only text, closed "Ver como tabla" panels and tables that scroll inside their own box are not spilling.
 */
export const OVERFLOWING = `[...document.querySelectorAll('[class*="rounded-2xl"]')].flatMap((box) => {
  const right = box.getBoundingClientRect().right;
  const out = [];
  const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement.closest('.sr-only, details:not([open]) > :not(summary), .overflow-x-auto')) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (rect.width > 0 && rect.right > right + 0.5) out.push(node.textContent.trim());
  }
  return out;
})`;

/** The main view, the list beside the summary or the summary itself scrolling sideways: something is too wide for it. */
export const SIDEWAYS = `[...new Set([document.getElementById('contenido'), ...document.querySelectorAll('[class*="overflow-y-auto"]')])]
  .filter((element) => element && element.scrollWidth > element.clientWidth + 1)
  .map((element) => (element.id || element.className.toString().slice(0, 30)) + ' scrolls sideways by ' + (element.scrollWidth - element.clientWidth) + 'px')`;
