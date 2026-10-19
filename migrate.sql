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
-- 성적 비고(점수마다)
alter table scores add column if not exists note text;
notify pgrst, 'reload schema';

-- 지난기록 보관(새 학년도 시작)
create table if not exists archives (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, created_at timestamptz default now(), label text not null, data jsonb not null);
alter table archives enable row level security;
drop policy if exists "own rows" on archives;
create policy "own rows" on archives for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on archives to authenticated;
notify pgrst, 'reload schema';
