alter table public.partners
  add column if not exists contact_email citext,
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.partner_invitations (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_email citext not null,
  token_hash text not null unique,
  invited_by uuid references public.users(id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  partner_id uuid references public.partners(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_partner_invitations_email
  on public.partner_invitations(contact_email);

create index if not exists idx_partner_invitations_expires
  on public.partner_invitations(expires_at);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  category_slug text not null check (category_slug in ('business-class', 'first-class', 'luxury-suv')),
  make_model text not null,
  license_plate text not null,
  color text,
  year integer check (year is null or (year >= 2000 and year <= 2100)),
  seats integer not null check (seats between 1 and 8),
  luggage integer not null check (luggage between 0 and 12),
  status text not null default 'available' check (status in ('available', 'assigned', 'maintenance', 'inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_id, license_plate)
);

create index if not exists idx_vehicles_partner on public.vehicles(partner_id);
create index if not exists idx_vehicles_category on public.vehicles(category_slug);
create index if not exists idx_vehicles_status on public.vehicles(status);
create index if not exists idx_partners_status on public.partners(status);
create index if not exists idx_chauffeurs_partner on public.chauffeurs(partner_id);

drop trigger if exists partners_updated_at on public.partners;
create trigger partners_updated_at
before update on public.partners
for each row execute function public.update_updated_at();

drop trigger if exists vehicles_updated_at on public.vehicles;
create trigger vehicles_updated_at
before update on public.vehicles
for each row execute function public.update_updated_at();

update public.fleet_categories
set
  description = case slug
    when 'business-class' then 'Mercedes E-Class or Similar'
    when 'first-class' then 'Mercedes S-Class or Similar'
    when 'luxury-suv' then 'Cadillac Escalade or Similar'
    else description
  end,
  vehicles = case slug
    when 'business-class' then array['Mercedes E-Class', 'BMW 5 Series', 'Audi A6']
    when 'first-class' then array['Mercedes S-Class', 'BMW 7 Series', 'Audi A8 L']
    when 'luxury-suv' then array['Cadillac Escalade', 'Cadillac Escalade ESV', 'Mercedes GLS 580']
    else vehicles
  end
where slug in ('business-class', 'first-class', 'luxury-suv');

delete from public.fleet_categories
where slug not in ('business-class', 'first-class', 'luxury-suv');
