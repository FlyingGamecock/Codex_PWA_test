create table if not exists public.ideas (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  text text not null check (char_length(text) <= 80),
  notes text not null default '' check (char_length(notes) <= 500),
  category text not null default 'General' check (char_length(category) <= 40),
  due_date date,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ideas
add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.ideas
add column if not exists notes text not null default '';

alter table public.ideas
add column if not exists category text not null default 'General';

alter table public.ideas
add column if not exists due_date date;

alter table public.ideas
drop constraint if exists ideas_notes_length_check;

alter table public.ideas
add constraint ideas_notes_length_check check (char_length(notes) <= 500);

alter table public.ideas
drop constraint if exists ideas_category_length_check;

alter table public.ideas
add constraint ideas_category_length_check check (char_length(category) <= 40);

create index if not exists ideas_user_id_updated_at_idx
on public.ideas (user_id, updated_at desc);

alter table public.ideas enable row level security;

revoke all on public.ideas from anon;
grant select, insert, update, delete on public.ideas to authenticated;

drop policy if exists "Anyone can read ideas" on public.ideas;
drop policy if exists "Anyone can add ideas" on public.ideas;
drop policy if exists "Anyone can update ideas" on public.ideas;
drop policy if exists "Anyone can delete ideas" on public.ideas;
drop policy if exists "Users can read their own ideas" on public.ideas;
drop policy if exists "Users can add their own ideas" on public.ideas;
drop policy if exists "Users can update their own ideas" on public.ideas;
drop policy if exists "Users can delete their own ideas" on public.ideas;

create policy "Users can read their own ideas"
on public.ideas for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can add their own ideas"
on public.ideas for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own ideas"
on public.ideas for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own ideas"
on public.ideas for delete
to authenticated
using ((select auth.uid()) = user_id);
