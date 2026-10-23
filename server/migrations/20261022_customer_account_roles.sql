alter table public.customer_profiles
  drop constraint if exists customer_profiles_role_check;

alter table public.customer_profiles
  add constraint customer_profiles_role_check
  check (role in ('customer', 'administrator', 'business'));
