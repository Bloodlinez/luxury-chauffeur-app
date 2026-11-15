-- Ensure customer-facing fleet cards use local public/fleet assets, not remote stock URLs.
update public.fleet_categories
set image_url = null
where slug in ('business-class', 'first-class', 'luxury-suv')
  and (
    image_url is null
    or image_url ilike '%unsplash%'
    or image_url not like '/fleet/%'
  );
