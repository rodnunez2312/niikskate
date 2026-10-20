-- Alianzas: admin-managed partnerships shown on the public /alianzas carousel.
-- Run this in the Supabase SQL editor. Vercel does not apply SQL files.

create table if not exists public.alliances (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  partner_type text not null default 'other',
  location_name text not null default '',
  formatted_address text not null default '',
  google_place_id text not null default '',
  latitude double precision,
  longitude double precision,
  google_maps_url text not null default '',
  objective text not null default '',
  objective_en text not null default '',
  short_description text not null default '',
  short_description_en text not null default '',
  logo_image_url text not null default '',
  cover_image_url text not null default '',
  external_website_url text not null default '',
  founding_partner boolean not null default false,
  internal_notes text not null default '',
  started_on date,
  status text not null default 'draft' check (status in ('draft', 'published', 'unpublished')),
  display_order integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alliance_areas (
  id uuid primary key default gen_random_uuid(),
  alliance_id uuid not null references public.alliances(id) on delete cascade,
  activity_type text not null default 'other',
  title text not null default '',
  title_en text not null default '',
  details text not null default '',
  details_en text not null default '',
  image_url text not null default '',
  image_alt text not null default '',
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists alliance_areas_alliance_order_idx
  on public.alliance_areas (alliance_id, display_order);

alter table public.alliances enable row level security;
alter table public.alliance_areas enable row level security;

drop policy if exists alliances_public_read on public.alliances;
create policy alliances_public_read
  on public.alliances
  for select
  to anon, authenticated
  using (status = 'published');

drop policy if exists alliance_areas_public_read on public.alliance_areas;
create policy alliance_areas_public_read
  on public.alliance_areas
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.alliances a
      where a.id = alliance_id and a.status = 'published'
    )
  );

-- Writes go through the service role in server/api/admin/alliances.
-- The existing Conkal card stays the founding partnership. Re-running this file does not overwrite later edits.

insert into public.alliances (
  name, slug, partner_type, location_name, formatted_address, google_maps_url,
  objective, objective_en, short_description, short_description_en,
  founding_partner, status, display_order, published_at
)
values (
  'Conkal School',
  'conkal-school',
  'school',
  'Conkal School',
  'Conkal, Yucatán',
  'https://www.google.com/maps/search/?api=1&query=Conkal%20School%20Yucat%C3%A1n',
  'Una colaboración propuesta para integrar deporte, educación, creatividad y desarrollo personal en un espacio compartido.',
  'A proposed collaboration to bring sport, education, creativity, and personal development into one shared place.',
  'Una colaboración propuesta para integrar deporte, educación, creatividad y desarrollo personal en un espacio compartido.',
  'A proposed collaboration to bring sport, education, creativity, and personal development into one shared place.',
  true,
  'published',
  0,
  now()
)
on conflict (slug) do nothing;

insert into public.alliance_areas (alliance_id, activity_type, title, title_en, details, details_en, image_url, image_alt, display_order)
select a.id, v.activity_type, v.title, v.title_en, v.details, v.details_en, v.image_url, v.image_alt, v.display_order
from public.alliances a
join (
  values
    ('skate', 'Skate y desarrollo juvenil', 'Skate & Youth Development',
      'Un entorno de aprendizaje dedicado al coaching estructurado de Niik y a la programación escolar.',
      'A dedicated learning environment supporting Niik’s structured coaching and school programming.',
      '/images/partners/skate-youth.jpg', 'Jóvenes patinando en el espacio de aprendizaje de Conkal School', 0),
    ('art', 'Arte y serigrafía', 'Art & Screen Printing',
      'Talleres creativos que combinan diseño gráfico, impresión y la cultura del skate.',
      'Potential creative workshops combining graphic design, printmaking, and skate culture.',
      '/images/partners/art-print.jpg', 'Taller de serigrafía con diseños inspirados en el skate', 1),
    ('spaces', 'Espacio familiar y comunitario', 'Family & Community Space',
      'Un corredor escolar sombreado donde las familias pueden reunirse, con una posible colaboración de café.',
      'A welcoming, shaded school corridor where families can gather, with a potential café collaboration.',
      '/images/partners/family-space.jpg', 'Corredor escolar sombreado donde se reúnen las familias', 2),
    ('community', 'Experiencias comunitarias', 'Community Experiences',
      'Clínicas, muestras de estudiantes, eventos y participación de las familias.',
      'Opportunities for clinics, student showcases, events, and family engagement.',
      '/images/partners/community.jpg', 'Familias y estudiantes en un evento comunitario de Niik', 3)
) as v(activity_type, title, title_en, details, details_en, image_url, image_alt, display_order) on true
where a.slug = 'conkal-school'
  and not exists (select 1 from public.alliance_areas existing where existing.alliance_id = a.id);
