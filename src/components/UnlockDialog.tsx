import { useRef, useState, type FormEvent } from 'react';

import { ModalOverlay, useModal } from './Modal';

type UnlockDialogProps = {
  onUnlock: (passphrase: string, remember: boolean) => Promise<void>;
  onClose: () => void;
  title?: string;
  description?: string;
  wrongPassphrase?: string;
  submitLabel?: string;
};

/**
 * Modal passphrase prompt for an encrypted loan: set a, your own loan, or a shared link.
 *
 * The passphrase only ever lives in this component's state and is cleared after every
 * attempt. Submission never navigates, so nothing reaches a URL. Focus stays inside the
 * dialog, and Escape closes it unless an attempt is running.
 *
 * @param props - Dialog props.
 * @param props.onUnlock - Attempts the unlock; rejects on a wrong passphrase.
 * @param props.onClose - Closes the dialog without unlocking.
 * @param props.title - Heading; defaults to set a's.
 * @param props.description - What is being unlocked, in plain words.
 * @param props.wrongPassphrase - Error shown for a wrong passphrase.
 * @param props.submitLabel - Text of the submit button.
 * @returns Unlock dialog element.
 */
export function UnlockDialog({
  onUnlock,
  onClose,
  title = 'Unlock set a',
  description = 'Set a is a private loan that comes encrypted with this site. Its passphrase opens it here. Without the passphrase, you keep seeing the sample loan.',
  wrongPassphrase = "That passphrase didn't unlock set a.",
  submitLabel = 'Unlock',
}: UnlockDialogProps) {
  const [passphrase, setPassphrase] = useState('');
  const [remember, setRemember] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useModal<HTMLFormElement>({
    onClose,
    locked: pending,
    initialFocus: inputRef,
  });

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (pending || passphrase === '') {
      return;
    }

    const attempt = passphrase;
    setPassphrase('');
    setPending(true);
    setError(null);

    try {
      await onUnlock(attempt, remember);
      onClose();
    } catch (unlockError) {
      const code = (unlockError as { code?: string }).code;
      setError(code === 'bad-passphrase' ? wrongPassphrase : (unlockError as Error).message);
      setPending(false);
      inputRef.current?.focus();
    }
  };

  return (
    <ModalOverlay>
      <form
        aria-describedby="unlock-description"
        aria-labelledby="unlock-title"
        aria-modal="true"
        className="modal"
        method="post"
        onSubmit={(event) => void submit(event)}
        ref={formRef}
        role="dialog"
      >
        <h2 className="modal-title" id="unlock-title">
          {title}
        </h2>
        <p className="modal-body" id="unlock-description">
          {description}
        </p>
        <div className="field-row mt-4">
          <label className="label" htmlFor="unlock-passphrase">
            Passphrase
          </label>
          <input
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            className="input"
            disabled={pending}
            id="unlock-passphrase"
            onChange={(event) => setPassphrase(event.target.value)}
            ref={inputRef}
            spellCheck={false}
            type="password"
            value={passphrase}
          />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            checked={remember}
            disabled={pending}
            onChange={(event) => setRemember(event.target.checked)}
            type="checkbox"
          />
          Remember on this device
        </label>
        {error !== null && (
          <p className="mt-3 text-sm font-semibold text-[var(--error)]" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="btn" disabled={pending} onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn btn-primary" disabled={pending || passphrase === ''} type="submit">
            {pending ? 'Unlocking…' : submitLabel}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}
