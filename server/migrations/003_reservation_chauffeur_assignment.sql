alter table public.reservations
  add column if not exists assigned_chauffeur_id uuid references public.chauffeurs(id) on delete set null,
  add column if not exists assigned_at timestamptz;

create index if not exists idx_reservations_assigned_chauffeur
  on public.reservations(assigned_chauffeur_id);
