import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, test } from 'vitest';

import { sampleLoan } from '../../src/config/sampleLoan';
import { buildLoanAnalysis } from '../../src/features/loan/loanEngine';
import { PaidProgressPanel } from '../../src/components/PaidProgress';

const analysis = buildLoanAnalysis(sampleLoan.loan, '2026-08-15');

describe('loan progress breakdown', () => {
  test('shows the full principal, repaid amount, and amount left before opening', () => {
    const { container, root } = renderPanel();

    expect(container.querySelector('[data-paid-dialog]')).toBeNull();
    expect(container.textContent).toContain('Original loan');
    expect(container.textContent).toContain('₹45L');
    expect(container.textContent).toContain('Repaid');
    expect(container.textContent).toContain('₹8.95L');
    expect(container.textContent).toContain('Left');
    expect(container.textContent).toContain('₹36.05L');
    expect(container.textContent).toContain('19.9% repaid');
    expect(container.textContent).not.toContain('One loan. The complete picture.');
    expect(container.textContent).not.toContain('Interest paid');

    cleanup(container, root);
  });

  test('opens the principal and interest breakdown from the loan progress card', () => {
    const { container, root } = renderPanel();
    const trigger = container.querySelector('[data-loan-progress-trigger]') as HTMLButtonElement;

    act(() => {
      trigger.click();
    });

    const dialog = container.querySelector('[data-paid-dialog]') as HTMLElement;
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain('Your loan breakdown');
    expect(dialog.textContent).toContain('Principal');
    expect(dialog.textContent).toContain('Repaid through EMIs');
    expect(dialog.textContent).toContain('Part payments');
    expect(dialog.textContent).toContain('Outstanding principal');
    expect(dialog.textContent).toContain('Interest');
    expect(dialog.textContent).toContain('Paid to date');
    expect(dialog.textContent).toContain('Still to pay');
    expect(dialog.textContent).toContain('Current-plan interest');
    expect(dialog.textContent).toContain('Regular interest paid');
    expect(dialog.textContent).toContain('Part-payment interest');
    expect(dialog.textContent).toContain('Pre-EMI interest');
    expect(dialog.textContent).toContain('Cash flow');
    expect(dialog.textContent).toContain('EMIs paid');
    expect(dialog.textContent).toContain('Additional interest charges');
    expect(dialog.textContent).toContain('Lifetime outflow');
    expect(dialog.textContent).toContain('Original-plan interest');
    expect(dialog.textContent).toContain('Interest saved');
    expect(dialog.textContent).toContain('137 payments left');

    cleanup(container, root);
  });

  test('closes the popup from the close button', () => {
    const { container, root } = renderPanel();
    const trigger = container.querySelector('[data-loan-progress-trigger]') as HTMLButtonElement;

    act(() => {
      trigger.click();
    });
    expect(container.querySelector('[data-paid-dialog]')).toBeTruthy();

    const closeButton = container.querySelector('[data-paid-close]') as HTMLButtonElement;
    act(() => {
      closeButton.click();
    });

    expect(container.querySelector('[data-paid-dialog]')).toBeNull();
    cleanup(container, root);
  });
});

function renderPanel() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<PaidProgressPanel analysis={analysis} />);
  });

  return { container, root };
}

function cleanup(container: HTMLDivElement, root: ReturnType<typeof createRoot>) {
  act(() => {
    root.unmount();
  });
  container.remove();
}
