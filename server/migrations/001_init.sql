create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists public.airports (
  id uuid primary key default gen_random_uuid(),
  code varchar(10) not null unique,
  name text not null,
  city text not null,
  state varchar(2) not null,
  country varchar(2) not null default 'US',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email citext not null unique,
  password_hash text not null,
  role text not null default 'customer' check (role in ('customer', 'admin', 'partner', 'chauffeur')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.fleet_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null,
  vehicles text[] not null,
  seats integer not null,
  luggage integer not null,
  base_price numeric(10,2) not null,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.users(id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  pickup_airport_code text not null,
  destination_airport_code text not null,
  pickup_date date not null,
  pickup_time text not null,
  flight_number text,
  vehicle_category text not null,
  quote_total numeric(10,2) not null,
  amount_paid numeric(10,2) default 0,
  status text not null default 'pending_confirmation' check (status in ('pending_confirmation', 'confirmed', 'assigned', 'in_transit', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.users(id) on delete set null,
  company_name text not null,
  status text not null default 'invited' check (status in ('invited', 'approved', 'active', 'suspended')),
  created_at timestamptz not null default now()
);

create table if not exists public.chauffeurs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  partner_id uuid references public.partners(id) on delete set null,
  full_name text not null,
  phone text,
  status text not null default 'available' check (status in ('available', 'assigned', 'offline')),
  created_at timestamptz not null default now()
);

create index if not exists idx_airports_active on public.airports(active);
create index if not exists idx_users_email on public.users(email);
create index if not exists idx_reservations_customer on public.reservations(customer_id);
create index if not exists idx_reservations_status on public.reservations(status);

create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists reservations_updated_at on public.reservations;
create trigger reservations_updated_at
before update on public.reservations
for each row execute function public.update_updated_at();
