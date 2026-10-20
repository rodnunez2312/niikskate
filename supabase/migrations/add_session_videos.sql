-- Session video library for coaches and admins.
-- Run in the Supabase SQL editor. The images bucket must already exist and be public.

create table if not exists public.session_videos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  calendar_event_id uuid references public.school_calendar_events(id) on delete set null,
  athlete_name text not null default '',
  title text not null default '',
  storage_path text not null,
  public_url text not null,
  created_at timestamptz not null default now()
);

alter table public.session_videos add column if not exists calendar_event_id uuid references public.school_calendar_events(id) on delete set null;
alter table public.session_videos add column if not exists athlete_name text not null default '';

create table if not exists public.session_reports (
  calendar_event_id uuid primary key references public.school_calendar_events(id) on delete cascade,
  coach_notes text not null default '',
  total_missed integer not null default 0,
  successful_lands integer not null default 0,
  skills_mastered integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.session_reports enable row level security;

drop policy if exists session_reports_staff on public.session_reports;
create policy session_reports_staff
  on public.session_reports
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'coach'))
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'coach'))
  );

create index if not exists session_videos_owner_created_idx
  on public.session_videos (owner_id, created_at desc);

alter table public.session_videos enable row level security;

drop policy if exists session_videos_select on public.session_videos;
create policy session_videos_select
  on public.session_videos
  for select
  to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists session_videos_insert on public.session_videos;
create policy session_videos_insert
  on public.session_videos
  for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'coach')
    )
  );

drop policy if exists session_videos_delete on public.session_videos;
create policy session_videos_delete
  on public.session_videos
  for delete
  to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "Staff upload session videos" on storage.objects;
create policy "Staff upload session videos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'images'
  and (storage.foldername(name))[1] = 'session-videos'
  and (storage.foldername(name))[2] = auth.uid()::text
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'coach')
  )
);

drop policy if exists "Staff delete own session videos" on storage.objects;
create policy "Staff delete own session videos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'images'
  and (storage.foldername(name))[1] = 'session-videos'
  and (
    (storage.foldername(name))[2] = auth.uid()::text
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
);
