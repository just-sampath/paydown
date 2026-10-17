import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';

type ModalOptions = {
  onClose: () => void;
  /** While true, Escape and clicks outside do nothing (for example during a request). */
  locked?: boolean;
  /** Element to focus when the dialog opens; defaults to the first focusable one. */
  initialFocus?: RefObject<HTMLElement | null>;
};

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]';

/**
 * Gives a dialog the behaviour people expect from a modal: focus moves into it, Tab and
 * Shift+Tab stay inside it, Escape closes it wherever focus is, the page behind stops
 * scrolling, and focus goes back to where it was when the dialog closes.
 *
 * @param options - Close handler, lock flag, and the element to focus first.
 * @returns A ref for the dialog panel.
 */
export function useModal<T extends HTMLElement>({
  onClose,
  locked = false,
  initialFocus,
}: ModalOptions): RefObject<T | null> {
  const panelRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  const lockedRef = useRef(locked);

  useEffect(() => {
    onCloseRef.current = onClose;
    lockedRef.current = locked;
  });

  useEffect(() => {
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !lockedRef.current) {
        event.preventDefault();
        onCloseRef.current();
      } else if (event.key === 'Tab') {
        keepFocusInside(event, panelRef.current);
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    (initialFocus?.current ?? focusableIn(panelRef.current)[0])?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      if (returnTo?.isConnected) {
        returnTo.focus({ preventScroll: true });
      }
    };
  }, [initialFocus]);

  return panelRef;
}

/**
 * Dimmed full-screen layer behind a dialog. A click on the layer itself, outside the
 * dialog, calls `onDismiss`.
 *
 * @param props - Overlay props.
 * @param props.children - The dialog panel.
 * @param props.onDismiss - Called on a click outside the panel; omit to ignore those clicks.
 * @returns Overlay element.
 */
export function ModalOverlay({
  children,
  onDismiss,
}: {
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onDismiss?.();
        }
      }}
    >
      {children}
    </div>
  );
}

type ConfirmDialogProps = {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Asks the user to confirm a step that can't be undone. Focus starts on Cancel, so
 * pressing Enter by habit does no harm.
 *
 * @param props - Dialog props.
 * @param props.title - Question shown as the heading.
 * @param props.children - What will happen, in plain words.
 * @param props.confirmLabel - Text of the button that goes ahead.
 * @param props.onConfirm - Called when the user goes ahead.
 * @param props.onCancel - Called on Cancel, Escape, or a click outside.
 * @returns Confirmation dialog.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const bodyId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const panelRef = useModal<HTMLDivElement>({ onClose: onCancel, initialFocus: cancelRef });

  return (
    <ModalOverlay onDismiss={onCancel}>
      <div
        aria-describedby={bodyId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="modal"
        ref={panelRef}
        role="alertdialog"
      >
        <h2 className="modal-title" id={titleId}>
          {title}
        </h2>
        <div className="modal-body" id={bodyId}>
          {children}
        </div>
        <div className="modal-actions">
          <button className="btn" ref={cancelRef} type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-danger" type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function focusableIn(panel: HTMLElement | null): HTMLElement[] {
  if (panel === null) {
    return [];
  }

  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.tabIndex >= 0 && !element.hasAttribute('disabled'),
  );
}

function keepFocusInside(event: KeyboardEvent, panel: HTMLElement | null): void {
  const items = focusableIn(panel);
  const first = items[0];
  const last = items.at(-1);

  if (panel === null || first === undefined || last === undefined) {
    event.preventDefault();
    return;
  }

  const active = document.activeElement;

  if (!panel.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
