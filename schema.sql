-- Supabase SQL Editor에서 한 번 실행. 모든 테이블은 본인(user_id) 데이터만 접근 가능(RLS).
-- (이전 버전 schema.sql을 이미 실행했다면 먼저 아래 줄의 주석을 풀어 지우고 다시 실행하세요. 데이터가 삭제됩니다.)
-- drop table if exists checks, checklists, scores, tests, notes, events, students, timetable, progress, meetings, memos, day_memos, period_notes cascade;

create table students   (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, created_at timestamptz default now(),
  num int, name text not null default '', phone text, parent_phone text, photo text);
create table events     (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, created_at timestamptz default now(),
  date date not null, title text not null);
create table tests      (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, created_at timestamptz default now(),
  subject text not null, name text not null, date date);
create table scores     (test_id uuid references tests on delete cascade, student_id uuid references students on delete cascade, user_id uuid not null default auth.uid() references auth.users on delete cascade, created_at timestamptz default now(),
  score numeric, mark text, primary key (test_id, student_id));
create table notes      (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, created_at timestamptz default now(),
  date date not null, student_id uuid references students on delete cascade, target text, method text, text text not null);
create table timetable  (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, created_at timestamptz default now(),
  kind text not null, day int not null, period int not null, text text, unique (user_id, kind, day, period));
create table checklists (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, created_at timestamptz default now(),
  title text not null default '', date date);
create table checks     (checklist_id uuid references checklists on delete cascade, student_id uuid references students on delete cascade, user_id uuid not null default auth.uid() references auth.users on delete cascade, created_at timestamptz default now(),
  primary key (checklist_id, student_id));
create table progress   (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, created_at timestamptz default now(),
  date date not null, subject text, content text not null);
create table meetings   (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, created_at timestamptz default now(),
  date date not null, title text, content text not null);
create table day_memos (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, created_at timestamptz default now(),
  date date not null, text text, unique (user_id, date));
create table period_notes (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, created_at timestamptz default now(),
  date date not null, period int not null, text text, unique (user_id, date, period));
create table memos      (id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, created_at timestamptz default now(),
  title text, content text not null, date date);

do $$ declare t text; begin
  foreach t in array array['students','events','tests','scores','notes','timetable','checklists','checks','progress','meetings','memos','day_memos','period_notes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "own rows" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- 로그인한 사용자에게 테이블 권한 부여 (없으면 "permission denied for table" 발생)
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
