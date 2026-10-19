/**
 * Tints the phone or tablet browser's toolbar to match the page background.
 *
 * Chrome and Samsung Internet read the `theme-color` meta tag. The colour comes from the
 * `--surface-2` token after the theme and palette attributes are set, so the stylesheet
 * stays the only place the colours are defined.
 *
 * @param root - Element that carries the theme and palette attributes.
 * @returns Nothing.
 */
export function syncThemeColor(root: HTMLElement = document.documentElement): void {
  const meta = document.querySelector('meta[name="theme-color"]');
  const surface = getComputedStyle(root).getPropertyValue('--surface-2').trim();
  if (meta && surface) {
    meta.setAttribute('content', surface);
  }
}
