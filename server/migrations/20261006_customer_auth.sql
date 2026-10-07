create table if not exists public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  email text not null,
  role text not null default 'customer' check (role in ('customer', 'business')),
  created_at timestamptz not null default now(),
  constraint customer_profiles_username_format check (username ~ '^[A-Za-z0-9]{1,32}$')
);

create unique index if not exists customer_profiles_username_lower_unique
  on public.customer_profiles (lower(username));

alter table public.customer_profiles enable row level security;

drop policy if exists customer_profiles_read_own on public.customer_profiles;
create policy customer_profiles_read_own
  on public.customer_profiles for select to authenticated
  using (auth.uid() = user_id);

create or replace function public.create_customer_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_username text := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
begin
  if requested_username !~ '^[a-z0-9]{1,32}$' then
    raise exception 'Username must contain only letters and numbers';
  end if;

  insert into public.customer_profiles (user_id, username, email)
  values (new.id, requested_username, new.email);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_customer_profile on auth.users;
create trigger on_auth_user_created_customer_profile
  after insert on auth.users
  for each row execute procedure public.create_customer_profile();
