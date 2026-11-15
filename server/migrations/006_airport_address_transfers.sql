alter table public.reservations
  alter column pickup_airport_code drop not null,
  alter column destination_airport_code drop not null;

alter table public.reservations
  add column if not exists transfer_type text,
  add column if not exists pickup_address_line1 text,
  add column if not exists pickup_address_line2 text,
  add column if not exists pickup_city text,
  add column if not exists pickup_state varchar(2),
  add column if not exists pickup_postal text,
  add column if not exists destination_address_line1 text,
  add column if not exists destination_address_line2 text,
  add column if not exists destination_city text,
  add column if not exists destination_state varchar(2),
  add column if not exists destination_postal text,
  add column if not exists address_verified boolean not null default false;

update public.reservations
set transfer_type = coalesce(transfer_type, 'from_airport')
where transfer_type is null
  and pickup_airport_code is not null
  and destination_airport_code is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reservations_transfer_type_check'
  ) then
    alter table public.reservations
      add constraint reservations_transfer_type_check
      check (transfer_type is null or transfer_type in ('from_airport', 'to_airport'));
  end if;
end $$;

create index if not exists idx_reservations_transfer_type
  on public.reservations(transfer_type);

update public.fleet_categories
set image_url = null
where slug in ('business-class', 'first-class', 'luxury-suv');
