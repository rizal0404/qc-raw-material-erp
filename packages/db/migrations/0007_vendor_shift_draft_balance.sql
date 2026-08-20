-- Draft shift reports are intentionally allowed to be incomplete.
-- Fleet balance remains enforced by the submit service validation.

ALTER TABLE vendor_shift_reports
  DROP CONSTRAINT IF EXISTS vendor_shift_am_balance_ck,
  DROP CONSTRAINT IF EXISTS vendor_shift_aa_balance_ck;
