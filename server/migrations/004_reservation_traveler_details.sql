alter table public.reservations
  add column if not exists customer_phone text,
  add column if not exists passenger_count integer not null default 1 check (passenger_count between 1 and 8),
  add column if not exists luggage_count integer not null default 0 check (luggage_count between 0 and 8);
