-- Fix offers price precision for Disco imports and admin edits.
-- The app stores prices with decimals (examples: 3008.55), so these columns must be numeric.

alter table public.offers
  alter column cash_price type numeric using cash_price::numeric;

alter table public.offers
  alter column installment_price type numeric using installment_price::numeric;

-- Keep installment count as integer; values are counts, not money.
-- If your DB was created with a text column instead, this will still normalize it safely.
alter table public.offers
  alter column installments_quantity type integer using nullif(installments_quantity, '')::integer;
