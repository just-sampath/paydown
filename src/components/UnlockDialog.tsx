import { useEffect, useRef, useState, type FormEvent } from 'react';

type UnlockDialogProps = {
  onUnlock: (passphrase: string, remember: boolean) => Promise<void>;
  onClose: () => void;
};

const WRONG_PASSPHRASE = "That passphrase didn't unlock set a.";

/**
 * Modal passphrase prompt for an encrypted data set.
 *
 * The passphrase only ever lives in this component's state and is cleared after every
 * attempt. Submission never navigates, so nothing reaches a URL.
 *
 * @param props - Dialog props.
 * @param props.onUnlock - Attempts the unlock; rejects on a wrong passphrase.
 * @param props.onClose - Closes the dialog without unlocking.
 * @returns Unlock dialog element.
 */
export function UnlockDialog({ onUnlock, onClose }: UnlockDialogProps) {
  const [passphrase, setPassphrase] = useState('');
  const [remember, setRemember] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
      setError(code === 'bad-passphrase' ? WRONG_PASSPHRASE : (unlockError as Error).message);
      setPending(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !pending) {
          onClose();
        }
      }}
    >
      <form
        aria-labelledby="unlock-title"
        aria-modal="true"
        className="card w-full max-w-sm"
        method="post"
        onSubmit={(event) => void submit(event)}
        role="dialog"
      >
        <h2 className="m-0 text-lg font-extrabold" id="unlock-title">
          unlock set a
        </h2>
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
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn" disabled={pending} onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn btn-primary" disabled={pending || passphrase === ''} type="submit">
            {pending ? 'Unlocking…' : 'Unlock'}
          </button>
        </div>
      </form>
    </div>
  );
}
