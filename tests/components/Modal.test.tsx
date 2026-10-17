import { act, useState } from 'react';
import { describe, expect, test, vi } from 'vitest';

import { ConfirmDialog } from '../../src/components/Modal';
import { buttonByText, click, render } from '../render';

function pressOnDocument(key: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(event);
  });
  return event;
}

function Harness({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button">Behind the dialog</button>
      {open && (
        <ConfirmDialog
          confirmLabel="Go ahead"
          title="Sure?"
          onCancel={() => setOpen(false)}
          onConfirm={() => {
            setOpen(false);
            onConfirm();
          }}
        >
          It goes for good.
        </ConfirmDialog>
      )}
    </div>
  );
}

describe('confirm dialog', () => {
  test('starts on Cancel, keeps Tab inside, and returns focus when closed', () => {
    const { container, cleanup } = render(<Harness onConfirm={() => undefined} />);
    const opener = buttonByText(container, 'Open') as HTMLButtonElement;

    act(() => opener.focus());
    click(opener);
    const dialog = container.querySelector('[role="alertdialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement?.textContent).toBe('Cancel');

    expect(pressOnDocument('Tab', true).defaultPrevented).toBe(true);
    expect(document.activeElement?.textContent).toBe('Go ahead');
    expect(pressOnDocument('Tab').defaultPrevented).toBe(true);
    expect(document.activeElement?.textContent).toBe('Cancel');

    // Focus that somehow lands behind the dialog is pulled back in on the next Tab.
    act(() => buttonByText(container, 'Behind the dialog')?.focus());
    pressOnDocument('Tab');
    expect(dialog.contains(document.activeElement)).toBe(true);

    pressOnDocument('Escape');
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    cleanup();
  });

  test('goes ahead only from its own button', () => {
    const onConfirm = vi.fn();
    const { container, cleanup } = render(<Harness onConfirm={onConfirm} />);

    click(buttonByText(container, 'Open'));
    click(buttonByText(container, 'Cancel'));
    expect(onConfirm).not.toHaveBeenCalled();

    click(buttonByText(container, 'Open'));
    click(buttonByText(container, 'Go ahead'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    cleanup();
  });
});
