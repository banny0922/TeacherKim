-- Supabase SQL Editor에 이 파일 전체를 붙여 넣고 Run 한 번.
-- 이미 있는 테이블·칸은 건너뛰므로 여러 번 실행해도 안전합니다.

-- 1) 빠진 테이블
create table if not exists day_memos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz default now(),
  date date not null, text text, unique (user_id, date));

create table if not exists period_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz default now(),
  date date not null, period int not null, text text, unique (user_id, date, period));

create table if not exists progress_photos (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, created_at timestamptz default now(), kind text not null default 'progress', year int not null, term int not null, photo text, unique (user_id, kind, year, term));

create table if not exists tt_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz default now(),
  date date not null, kind text not null, period int not null, text text,
  unique (user_id, date, kind, period));

-- 2) 빠진 칸
alter table checklists add column if not exists date date;
alter table memos      add column if not exists date date;
alter table meetings   add column if not exists title text;
alter table scores     add column if not exists mark text;
alter table students   add column if not exists photo text;
alter table students   add column if not exists parent_phone2 text;
alter table period_notes add column if not exists struck boolean default false;

-- 3) 보안(RLS): 본인 데이터만 접근
do $$ declare t text; begin
  foreach t in array array['students','events','tests','scores','notes','timetable','checklists','checks','progress','meetings','memos','day_memos','period_notes','tt_changes','progress_photos'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "own rows" on %I', t);
    execute format('create policy "own rows" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- 4) 로그인한 사용자 권한
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;

-- 5) 새 칸을 바로 인식하게 새로고침
notify pgrst, 'reload schema';

-- 구글 캘린더 구독용 (학사일정 ICS)
create table if not exists cal_tokens (user_id uuid primary key default auth.uid() references auth.users on delete cascade, token uuid not null default gen_random_uuid());
alter table cal_tokens enable row level security;
drop policy if exists "own rows" on cal_tokens;
create policy "own rows" on cal_tokens for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on cal_tokens to authenticated;
create or replace function ics_events(t uuid) returns table(id uuid, date date, title text) language sql security definer set search_path = public as $$
  select e.id, e.date, e.title from events e join cal_tokens c on c.user_id = e.user_id where c.token = t
$$;
grant execute on function ics_events(uuid) to anon, authenticated;
notify pgrst, 'reload schema';
