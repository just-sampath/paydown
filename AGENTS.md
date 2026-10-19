# AGENTS.md

Paydown is a static Vite and React app that tracks one floating-rate home loan in rupees. Everyone sees a made-up sample loan. A real loan can ship as an encrypted file that only its owner can unlock. The README covers features and deployment. This file covers what you need to know to change the code safely.

## Commands

Use Bun for everything.

```bash
bun install
bun run dev
bun run lint
bun run test
bun run build
bun run format:check
bun run check:private
```

- `dev` serves on http://127.0.0.1:5173.
- `build` type-checks the app, node and scripts projects, then runs `vite build`.
- Run one test file with `bun run test tests/pages/WhatIfPage.test.tsx`.
- Before you call a change done, run lint, test, build, format:check and check:private. CI runs all of them except format:check on every push to `main`.

## Rules

- Never read, print, copy or commit anything in `.private/`, `*.plain.json` or `*.vault.tmp`. Don't put real loan figures in code, tests, docs or commit messages. The sample loan in `src/config/sampleLoan.ts` is the only loan data that belongs in the repo as plain text.
- Leave `bun run vault` and `bun run leak-check` to the owner. They ask for the passphrase at a hidden prompt. Never ask for the passphrase or pass it through arguments, environment variables or files. The owner reviews and commits `src/vault/set-a.vault.json`.
- Treat `src/features/loan/` as fixed unless the task is about the maths. UI work never needs to change it: derive what a page needs from `LoanAnalysis` in the component or in `src/utils/`. If you do change the maths, update `docs/calculations.md` (including its expected figures) and `tests/features/loan/` in the same change.
- Keep files in LF. This repo is edited on Windows with `core.autocrlf=true`, and some tools write CRLF, which fails the Prettier check.

## Layout

```text
src/app/               App shell: state, hash routing, localStorage, vault unlock
src/pages/             One component per page: dashboard, schedule, rates, parts, whatif, settings
src/components/        Shared UI: Primitives, DraftInputs, EventEditing, Modal, Layout, PaidProgress
src/components/charts/ Hand-drawn SVG charts and their helpers in chartUtils.ts
src/features/loan/     EMI, schedule, event impacts and aggregates (all loan maths lives here)
src/features/vault/    Profile validation and WebCrypto encryption, shared by browser, CLI and tests
src/utils/             Formatting, rate limits, savings phrases, dates, CSV parsing
src/data/quotes.csv    600 public-domain quotes for the dashboard, one shown per day
src/styles/index.css   Theme tokens and all component CSS
scripts/               Vault CLI, leak check, plaintext guard, icon generator
tests/                 Mirrors src/ and scripts/
docs/                  calculations.md (maths and expected figures), vault.md (encryption and CLI)
```

`App.tsx` computes one `LoanAnalysis` with `buildLoanAnalysis(loan, today)`. Loan state lives in `src/app/useLoanData.ts`, which owns three loans with one showing at a time: the sample, set a, and the visitor's own loan ("Your loan"). Pages get the analysis, the event lists and an `onChange` callback. They keep no loan state of their own.

- The sample, terms included, persists in plain text in `localStorage` under `paydown:sample:v3`.
- Your loan persists only as an encrypted vault blob under `paydown:mine:v1`. Every edit is re-encrypted as it happens. It moves between devices by a `#open=` link that carries only ciphertext. `docs/vault.md` covers this.
- Edits to set a stay in memory only.
- `paydown:active:v1` remembers which loan was showing, and `paydown:prefs:v1` holds theme prefs.

Never write a real loan to storage in plain text. Anything that persists the visitor's own loan goes through `sealProfile` or `resealData`.

Every quote in `src/data/quotes.csv` comes from a public-domain book on Project Gutenberg, with its author, topic, book title and Gutenberg link. Add only quotes you can source the same way; modern quote sites are copyrighted and forbid scraping. `DailyQuote` loads the file lazily and walks it with a fixed stride, so each day gets one quote and none repeats until all have shown.

`recharts` is still listed in `package.json` and has a chunk rule in `vite.config.ts`, but nothing imports it. Draw new charts as SVG in `src/components/charts/`.

## Code style

- TypeScript is strict with `noUncheckedIndexedAccess`, so an indexed read can be `undefined`. Handle that case instead of asserting.
- Lint requires `import type` for types, keeps SonarJS cognitive complexity at 15 or less, and allows unused arguments only with a `_` prefix.
- Prettier uses 100 columns, single quotes and trailing commas.
- Exported functions and components get a JSDoc block with `@param` and `@returns`, like the existing ones. Comments explain why, not what.
- Show every rupee amount, date, percent and duration through `src/utils/format.ts` (`formatInr`, `formatInrShort`, `formatDate`, `formatMonthYear`, `formatDuration`, `pluralize`). They use Indian digit grouping, such as ₹45,00,000 and ₹45L.

## UI conventions

- Reuse the existing building blocks:
  - `DraftDateInput` and `DraftNumberInput` for editable values. They keep typed text local and commit only valid values, so a list doesn't re-sort under the cursor. Pass `min`, `max` and `invalidHint` to show why a value is refused.
  - `AddEventForm` for adding an event. Its `check` prop refuses duplicates, and `valueExample` shows a sample value beside the label. Don't put a value-like placeholder inside an empty field.
  - `useUndoable` and `UndoNotice` for deletes. Delete at once and offer Undo instead of asking first.
  - `ConfirmDialog` and `useModal` for dialogs. They move focus in, trap Tab, close on Escape and return focus to the opener. Never use `window.confirm`, `alert` or `prompt`.
- Rates must be from 1% to 30% (`RATE_LIMITS` in `src/utils/rates.ts`). Use `rateConflict` to refuse a second change on the same date or a change to the rate already in effect.
- Outside the charts, the dashboard shows each amount, month and duration only once. `tests/pages/DashboardPage.test.tsx` checks this, so pick one place for each figure.
- All CSS lives in `src/styles/index.css`, inside Tailwind 4's `@layer components`. Colours come from tokens on `:root`, `[data-theme='dark']` and the `carbon` and `cocoa` palettes. Use the tokens (`--ink-*`, `--c-principal`, `--c-interest`, `--c-prepay` and the rest) rather than raw colours. Check new UI in all six theme and palette combinations, with text at 4.5:1 contrast or better.
- Prefer container queries (`schedule`, `events`, and the unnamed ones on `.kpi` and `.meter`) so a layout follows its box's width. The viewport media rules sit at the end of the file, and the 360px block stays last. Check 320, 375, 768, 1024 and 1440px. No figure should wrap and no page should scroll sideways.
- Also check the target devices by their CSS viewports: Galaxy S26 Ultra at 412×891 and on its side at 891×412 (the tabs become a left rail), Galaxy Tab S9 11 inch at 800×1280 and 1280×800, a 15.6 inch 1080p laptop at 1536×730 (125% scale) and 1280×585 (150%), and a 24 inch 1080p monitor at 1920×953 (the page column widens to 1480px and centres). Touch screens get 44px targets from the `pointer: coarse` block.
- The production build sets a strict Content Security Policy in `vite.config.ts`. Don't add inline scripts, CDN scripts, web fonts or remote images.
- The site is served under `/paydown/`, so reference public assets with relative paths.

## Writing copy

Every visible string follows the same plain style:

- Use plain words and short sentences.
- Say "part payment" on screen, not "prepayment" or "prepay" (the code uses both). The phone tab is "Parts".
- Don't use em or en dashes. Use a comma, colon, period or parentheses instead.
- Use straight quotes and apostrophes.
- Write dates as "14 Feb 2024" or "Feb 2024". Only the native date field shows numbers like 14-02-2024.
- Use sentence case for titles, labels and buttons. "Set a" is the private loan's name, so it stays lowercase after the first word: "Unlock set a".

## Tests

- Page and component tests use `renderToStaticMarkup` for static output and the helpers in `tests/render.tsx` (`render`, `setInputValue`, `blur`, `click`, `buttonByText`) for interaction. The repo doesn't use Testing Library.
- Build analyses with a fixed date (most tests use `'2026-08-15'`) so the figures stay stable. `docs/calculations.md` lists the expected sample-loan figures for that date.
- `tests/test-setup.ts` installs an in-memory `localStorage`. Clear it in tests that write to it.
- Add or update a test for each behaviour change, and update copy assertions when you change copy.
