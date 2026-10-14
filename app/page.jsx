'use client';
import { useEffect, useState } from 'react';
import { sb } from './sb';
import { Calendar, Timetable, Progress, Meetings, Roster, Checklists, Counsel, Memos, Grades } from './views';

const TABS = { calendar: '학사일정', timetable: '시간표', progress: '수업진도', meetings: '교무회의', roster: '학급명렬', checklist: '체크리스트', counsel: '상담기록', memo: '메모하기', grades: '성적' };
const EMPTY = { students: [], events: [], tests: [], scores: [], notes: [], timetable: [], checklists: [], checks: [], progress: [], meetings: [], memos: [], day_memos: [] };

function Login() {
  const [f, setF] = useState({ email: '', password: '' });
  const [msg, setMsg] = useState('');
  const run = async (signup) => {
    const { error } = await (signup ? sb.auth.signUp(f) : sb.auth.signInWithPassword(f));
    setMsg(error ? error.message : signup ? '가입 완료. 메일 인증이 켜져 있으면 메일을 확인하세요.' : '');
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); run(false); }}>
      <h2>📒 교사 플래너</h2>
      <input type="email" placeholder="이메일" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /><br />
      <input type="password" placeholder="비밀번호 (6자 이상)" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /><br />
      <button>로그인</button><button type="button" onClick={() => run(true)}>회원가입</button>
      <p style={{ color: '#c00' }}>{msg}</p>
    </form>
  );
}

export default function Page() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (session === undefined) return null;
  return session ? <Planner uid={session.user.id} /> : <Login />;
}

function Planner({ uid }) {
  const [tab, setTab] = useState('calendar');
  const [db, setDb] = useState(EMPTY);
  const [err, setErr] = useState('');
  const load = async () => {
    const keys = Object.keys(EMPTY);
    const r = await Promise.all(keys.map((t) => sb.from(t).select('*').order('created_at')));
    const bad = r.find((x) => x.error);
    if (bad) return setErr(bad.error.message);
    setDb(Object.fromEntries(keys.map((t, i) => [t, r[i].data])));
  };
  useEffect(() => { load(); }, []);

  // 쓰기 후 전체 다시 불러오기: 단순함 우선 (ponytail: 학급 규모라 충분)
  const write = async (q) => { const { error } = await q; setErr(error?.message ?? ''); load(); };
  const add = (t, row) => write(sb.from(t).insert(row));
  const upd = (t, id, patch) => write(sb.from(t).update(patch).eq('id', id));
  const del = (t, id) => confirm('삭제할까요?') && write(sb.from(t).delete().eq('id', id));

  const S = [...db.students].sort((a, b) => (a.num ?? 1e9) - (b.num ?? 1e9) || a.created_at.localeCompare(b.created_at));
  const p = { db, S, uid, add, upd, del, write, load, setDb };
  const View = { calendar: Calendar, timetable: Timetable, progress: Progress, meetings: Meetings, roster: Roster, checklist: Checklists, counsel: Counsel, memo: Memos, grades: Grades }[tab];
  return (
    <>
      <h2>📒 교사 플래너 <button onClick={() => sb.auth.signOut()} style={{ float: 'right' }}>로그아웃</button></h2>
      <nav>{Object.entries(TABS).map(([k, n]) => <button key={k} className={k === tab ? 'on' : ''} onClick={() => setTab(k)}>{n}</button>)}</nav>
      {err && <p style={{ color: '#c00' }}>{err}</p>}
      <View {...p} />
    </>
  );
}
