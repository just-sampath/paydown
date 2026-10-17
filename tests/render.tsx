import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

export type Rendered = {
  container: HTMLDivElement;
  root: Root;
  rerender: (element: ReactElement) => void;
  cleanup: () => void;
};

/**
 * Mounts a React element into a detached-from-test container attached to the document.
 *
 * @param element - Element to render.
 * @returns The container plus helpers to re-render and unmount.
 */
export function render(element: ReactElement): Rendered {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
  });

  return {
    container,
    root,
    rerender: (next) => act(() => root.render(next)),
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/**
 * Types a value into a controlled input the way React expects.
 *
 * @param input - Input element.
 * @param value - New value.
 */
export function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/**
 * Moves focus into an input.
 *
 * @param input - Input element.
 */
export function focus(input: HTMLInputElement): void {
  act(() => input.focus());
}

/**
 * Moves focus out of an input so it commits.
 *
 * @param input - Input element.
 */
export function blur(input: HTMLInputElement): void {
  act(() => input.blur());
}

/**
 * Finds a button by its trimmed text.
 *
 * @param container - Element to search.
 * @param text - Exact button text.
 * @returns The button, if present.
 */
export function buttonByText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === text,
  );
}

/**
 * Clicks an element inside `act`.
 *
 * @param element - Element to click.
 */
export function click(element: HTMLElement | undefined | null): void {
  act(() => element?.click());
}
