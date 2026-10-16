# Loan Calculation Audit

## Sources Checked

- RBI circular RBI/2023-24/55, updated October 1, 2025: for EMI-based floating-rate loans, lenders must communicate the impact of benchmark changes on EMI and/or tenor, offer borrower options around EMI/tenor changes, and allow part/full prepayment subject to extant instructions. Source: https://rbi.org.in/scripts/NotificationUser.aspx?Id=12529
- RBI circular RBI/2013-14/582: banks cannot charge foreclosure/pre-payment penalties on floating-rate term loans sanctioned to individual borrowers. Source: https://www.rbi.org.in/Scripts/BS_CircularIndexDisplay.aspx?Id=8868
- RBI FAQ on that circular: explicitly lists "enhancement in EMI or elongation of number of EMIs, keeping the EMI unchanged or a combination" and part/full prepayment during residual tenor. Source: https://www.rbi.org.in/commonman/Upload/English/FAQs/PDFs/FAQRFIR10012025.pdf
- Indian lenders' published home-loan EMI calculators use the standard reducing-balance EMI formula with the monthly rate defined as annual rate / 12 / 100, and charge interest on a daily reducing balance.
- The prepayment simple-interest rule below was reverse-engineered from, and reconciled to the rupee against, a real lender statement. Those figures are private and are not part of this repository.

## Validated Rules

### 1. Reducing-balance EMI

The app uses the standard reducing-balance EMI formula:

```text
EMI = P * R * (1 + R)^N / ((1 + R)^N - 1)
R = annualRatePercent / 12 / 100
```

where `P` is principal, `R` is the monthly rate, and `N` is the original tenure in months.

For the bundled sample loan (fictional):

- Principal: INR 45,00,000
- Annual rate: 9.15%
- Tenure: 240 months
- EMI: INR 40,922.80, displayed as INR 40,923
- First month: interest INR 34,312.50 (45,00,000 × 9.15% / 12), principal INR 6,610.30
- Total interest with no events: INR 53,21,472

### 2. Floating rate revisions

The model is "keep EMI constant and reduce/extend tenure". RBI sources establish that floating-rate resets can affect EMI and/or tenor and that borrowers may choose; many lenders let existing customers choose tenure reduction instead of EMI reduction. This app therefore models the explicit Settings strategy "Reduce tenure (keep EMI)" rather than claiming it is the only possible lender behavior.

Effective-date rule used in this app:

- A rate change dated on the 1st of a month applies to that month.
- A rate change dated after the 1st applies from the 1st day of the next month.
- Multiple rate changes normalizing to the same month are resolved by date order; the latest change for that month wins.

### 3. Pre-EMI interest

When a loan is disbursed before the EMI commencement date, lenders charge pre-EMI interest for the intervening period. This is interest-only and does not reduce the principal. The app accepts an optional `preEmiInterest` field in `LoanConfig` and includes it in `ScheduleSummary.totalInterest` and `totalOutflow` without affecting the amortization schedule rows.

The sample loan uses INR 11,200 of pre-EMI interest.

### 4. Part payments and simple interest

Part payments reduce outstanding principal. Under this app's selected strategy, EMI remains unchanged and tenure shrinks. If a part payment exceeds the outstanding balance after EMI, it is capped at that balance.

The app models daily-reducing-balance prepayment behavior. Since the EMI is paid on the 1st of the month and the part payment is made mid-month, the part payment reduces the closing balance for that month (effective for the next month's interest), not the current month's EMI interest. The lender charges simple interest on the prepaid amount for the days between the EMI date and the prepayment date:

```text
SI = prepaymentAmount * (annualRate / 100) * max(0, day - 2) / daysInYear
```

where `day` is the day of the month the prepayment was posted, `daysInYear` is 365 or 366 (leap year), and the `max(0, day - 2)` term counts the accrual days from day 2 (the day after the EMI) to the day before the prepayment. A prepayment on the 1st (EMI date) has zero simple interest. Store the date the lender _posted_ the payment, because simple interest is charged up to that day.

Worked example on the sample loan:

| Date       | Prepayment | Day | Rate  | Days in year | Computed SI |
| ---------- | ---------- | --- | ----- | ------------ | ----------- |
| 2024-02-14 | 1,25,000   | 14  | 8.95% | 366          | 366.80      |
| 2024-10-09 | 75,000     | 9   | 8.65% | 366          | 124.08      |
| 2025-08-12 | 2,40,000   | 12  | 8.35% | 365          | 549.04      |

Total simple interest: INR 1,040.

Effective-date rule used in this app:

- A prepayment in a month is recorded in that month's schedule row and reduces the closing balance.
- The EMI interest for that month is computed on the full opening balance (the EMI on the 1st is paid before the mid-month prepayment).
- The reduced closing balance becomes the next month's opening balance, so the prepayment first reduces the interest charged in the following month.
- Multiple prepayments in the same month are preserved individually so each one's simple interest is computed from its own date.

### 5. Monthly interest and EMI split

Each month:

1. Normalize and apply any rate change for the month.
2. Compute interest on the full opening balance: `openingBalance * monthlyRate`.
3. Compute scheduled principal as `baseEMI - interest`.
4. If the EMI is enough to close the loan, final EMI is `remainingPrincipal + interest`, which may be lower than the regular EMI.
5. Subtract scheduled principal from the opening balance to get the balance after EMI.
6. Apply all prepayments for the month (capped at the balance after EMI) and add their simple interest.
7. The closing balance is the balance after EMI minus prepayments.

### 6. Rounding

The engine keeps internal calculations in decimal rupees and rounds only for display and test assertions. This avoids cumulative drift. Rows expose raw values plus stable display formatting in the UI.

## Expected Engine Behavior

- Clean 20-year schedule for the sample terms: 240 rows, EMI INR 40,923, total interest INR 53,21,472.
- Rate drop: monthly interest decreases from the effective month while EMI remains the original INR 40,923 and total tenure shrinks.
- Single prepayment: prepayment is shown in the effective month, simple interest is charged, EMI interest for that month is on the full opening balance, and the prepayment reduces the closing balance (effective for the next month's interest).
- Full sample loan (as-of date 2026-08-15):
  - 178 rows, 62 months saved, total prepayment INR 4,40,000, total simple interest INR 1,040, pre-EMI interest INR 11,200.
  - Total interest INR 32,33,157, interest saved INR 20,99,514, principal outstanding INR 36,05,336 after the 2026-08-01 EMI.
  - Total outflow INR 77,33,157, final EMI INR 37,582, and 137 scheduled payments from 2026-09-01 totaling INR 56,03,083.
  - Holding prepayments fixed, rate changes save 15 months and INR 6,15,134 of interest. Holding rate changes fixed, prepayments save 36 months and INR 10,32,912 of interest.
  - Chronological event impact months saved: rate changes [8, 8, 6]; part payments [15, 7, 18]. These event values depend on all earlier events and should not be read as independent counterfactuals.
- Final partial EMI: final row can be smaller than the base EMI when remaining principal plus interest is less than EMI.
