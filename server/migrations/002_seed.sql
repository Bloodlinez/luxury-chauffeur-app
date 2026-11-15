insert into public.airports (code, name, city, state, country, active)
values
  ('EWR', 'Newark Liberty International Airport', 'Newark', 'NJ', 'US', true),
  ('TEB', 'Teterboro Airport', 'Teterboro', 'NJ', 'US', true),
  ('ACY', 'Atlantic City International Airport', 'Atlantic City', 'NJ', 'US', true),
  ('TTN', 'Trenton–Mercer Airport', 'Ewing', 'NJ', 'US', true),
  ('JFK', 'John F. Kennedy International Airport', 'New York', 'NY', 'US', true),
  ('LGA', 'LaGuardia Airport', 'New York', 'NY', 'US', true),
  ('PHL', 'Philadelphia International Airport', 'Philadelphia', 'PA', 'US', true),
  ('ABE', 'Lehigh Valley International Airport', 'Allentown', 'PA', 'US', true),
  ('PIT', 'Pittsburgh International Airport', 'Pittsburgh', 'PA', 'US', true)
on conflict (code) do nothing;

insert into public.fleet_categories (slug, name, description, vehicles, seats, luggage, base_price, image_url, active)
values
  ('business-class', 'Business Class', 'Mercedes E-Class or Similar', array['Mercedes E-Class', 'BMW 5 Series', 'Audi A6'], 4, 3, 220.00, null, true),
  ('first-class', 'First Class', 'Mercedes-Benz S-Class or Similar', array['Mercedes S-Class', 'BMW 7 Series', 'Audi A8 L'], 4, 3, 310.00, null, true),
  ('luxury-suv', 'Luxury SUV', 'Cadillac Escalade or Similar', array['Cadillac Escalade', 'Cadillac Escalade ESV', 'Mercedes GLS 580'], 6, 5, 380.00, null, true)
on conflict (slug) do update set
  vehicles = excluded.vehicles,
  description = excluded.description,
  base_price = excluded.base_price,
  image_url = excluded.image_url,
  active = excluded.active;
