import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ErrorBoundary } from '../../src/components/ErrorBoundary';

function Bomb(): never {
  throw new Error('kaboom');
}

describe('ErrorBoundary', () => {
  const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  afterEach(() => {
    consoleSpy.mockClear();
  });

  test('renders a fallback instead of crashing when a child throws', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>,
      );
    });

    expect(container.textContent).toContain('Something went wrong');
    expect(container.textContent).toContain('kaboom');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test('recovers when resetKeys change', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <ErrorBoundary resetKeys={[0]}>
          <Bomb />
        </ErrorBoundary>,
      );
    });
    expect(container.textContent).toContain('Something went wrong');

    act(() => {
      root.render(
        <ErrorBoundary resetKeys={[1]}>
          <div>healthy again</div>
        </ErrorBoundary>,
      );
    });
    expect(container.textContent).toContain('healthy again');
    expect(container.textContent).not.toContain('Something went wrong');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test('renders an optional reset action when onReset is provided', () => {
    const onReset = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <ErrorBoundary onReset={onReset}>
          <Bomb />
        </ErrorBoundary>,
      );
    });

    expect(container.textContent).toContain('Reset loan data');

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
