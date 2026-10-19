# Private data set ("set a")

The public site always opens on a fictional **sample loan**. A private loan can ship in the same build as an encrypted file, `src/vault/set-a.vault.json`. Only someone with its passphrase can unlock it, from **Settings → Data on this device → Unlock set a**.

## Threat model

- **The encrypted file is public.** It sits in the repository and in the deployed bundle, so anyone can download it and try passphrases offline. Rate limits don't help. Security rests on **passphrase strength × the PBKDF2 cost**.
- **Nothing reveals what is inside.** The plaintext is padded to a fixed size and re-encrypted with fresh randomness on every save, so the file's size and bytes say nothing about how many events it holds or what changed.
- **Out of scope:**
  - someone using your unlocked browser session or a device you chose to remember
  - malware on your machine
  - someone who can push to the repository (they could replace the file, but they still can't read it)

## Format and parameters

```json
{
  "v": 1,
  "kdf": { "name": "PBKDF2-SHA256", "iterations": 1000000, "salt": "<16 bytes, base64>" },
  "wrap": { "iv": "<12 bytes>", "ct": "<wrapped data key + tag>" },
  "data": { "iv": "<12 bytes>", "ct": "<16384 bytes + 16-byte tag>" }
}
```

**Envelope encryption.** A random AES-256-GCM _data key_ (DEK) encrypts the profile. A key derived from the passphrase (KEK) wraps the DEK. A normal save re-wraps the same DEK under a new salt, so remembered devices keep working. Changing the passphrase rotates the DEK, which revokes every remembered device.

**Key derivation (PBKDF2-HMAC-SHA256, 1,000,000 iterations, 16-byte random salt).**

- This is above OWASP's 600,000 floor for PBKDF2-SHA256.
- Unlocking is rare, so about 0.5 s on a laptop and 1–2 s on a phone is acceptable.
- At this cost a high-end GPU tests very roughly 10⁴ guesses per second. A 5-word random passphrase (about 64 bits) is far out of reach.
- Decryption refuses fewer than 600,000 or more than 10,000,000 iterations.

**Cipher: AES-256-GCM** with a fresh random 96-bit IV for each layer on every save.

- The version, KDF name, iteration count and salt are bound as additional authenticated data (`paydown-vault|1|PBKDF2-SHA256|<iterations>|<salt>|wrap|data`).
- Editing any header field therefore makes decryption fail.

**Padding.**

- The plaintext is a 4-byte big-endian length, then compact JSON, then zeros, always exactly 16,384 bytes.
- That leaves room for several hundred events.
- If a profile outgrows it, the CLI refuses to save. It never grows the size silently, because that would leak information.

**Why PBKDF2 rather than Argon2id.** PBKDF2 is built into every browser and into Bun through WebCrypto, so the vault has no crypto dependencies. `kdf.name` leaves room to move to Argon2id later.

The same module, `src/features/vault/vaultCrypto.ts`, runs in the browser, in the CLI and in the tests.

## Unlocking in the browser

- **Unlock set a** opens a passphrase prompt that says what set a is.
- **A wrong passphrase** shows an error and changes nothing.
- **On success**, the full loan replaces the sample: base terms, events and scenarios.
- **Remember on this device** (optional) stores the unwrapped data key in IndexedDB as a **non-extractable** `CryptoKey`. Scripts can use it to decrypt but cannot read its bytes. No passphrase and no plaintext are ever written to the device.
  - Anyone who can use that browser profile can see the loan.
  - A non-extractable key is not protection against someone who has the device itself.
- **Lock** forgets the device key and returns to the sample.
- **Edits made in the browser while unlocked are temporary.** Permanent changes go through the CLI.
- **The encrypted file is a lazily loaded chunk**, so visitors who never unlock never download it.
- **Old plaintext is deleted.** Older versions of the app kept loan events in `localStorage` under `paydown:data:v1`. The app deletes that key on startup.

## The CLI

Run every command from PowerShell or Windows Terminal. Passphrases are read only at a hidden prompt, never from arguments, environment variables or files.

```bash
bun run vault add-payment --date 2026-09-14 --amount 90000
```

```bash
bun run vault add-rate --date 2026-10-01 --rate 7.95
```

| Command                                                            | Purpose                                                                                               |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `init [--file f] [--force]`                                        | First encryption from `.private/set-a.json`. Asks for a new passphrase twice (minimum 20 characters). |
| `add-payment --date --amount` / `remove-payment --date [--amount]` | Part payments                                                                                         |
| `add-rate --date --rate` / `remove-rate --date`                    | Rate changes                                                                                          |
| `list`                                                             | Prints events to your terminal                                                                        |
| `export [--file f] [--force]` → edit → `seal [--file f]`           | Bulk edits through the gitignored plaintext file. `seal` offers to delete the plaintext afterwards.   |
| `passwd`                                                           | New passphrase plus a new data key, which revokes remembered devices                                  |
| `verify`                                                           | Decrypts and validates, printing counts only                                                          |

**Every change follows the same steps:**

1. Asks for the **current** passphrase.
2. Decrypts in memory and applies the change.
3. Asks for a new passphrase (press Enter to keep the current one).
4. Re-encrypts with a fresh salt and fresh IVs.
5. **Decrypts the result again to verify it.**
6. Writes the file atomically.

The CLI never runs git. Review and commit `src/vault/set-a.vault.json` yourself.

JavaScript can't wipe strings from memory, so the passphrase lives only for the duration of the process.

## Guards

- **`.gitignore`** covers `.private/`, `*.plain.json` and `*.vault.tmp`.
- **`bun run check:private`** (also run in CI) fails if a private file is tracked, or if any tracked JSON parses as an unencrypted loan profile.
- **`bun run leak-check`** searches for traces of the private loan:
  - It builds its search terms at runtime from `.private/set-a.json`, or from the vault after a passphrase prompt.
  - Matches are reported by field and format only. The figures themselves are never printed.

| Flag           | Searches                                               |
| -------------- | ------------------------------------------------------ |
| `--tree`       | Tracked and untracked, non-ignored files (the default) |
| `--history`    | Every commit, branch and reflog entry                  |
| `--dist`       | The built bundle (run `bun run build` first)           |
| `--url <site>` | The deployed page and every asset it references        |

A non-zero exit means a strong match. Low-confidence matches (short numbers, month names) are listed for you to review by eye.
