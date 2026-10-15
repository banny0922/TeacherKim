'use client';
import { useEffect, useState } from 'react';
import { NotebookPen } from 'lucide-react';
import { sb, saved } from './sb';
import { Calendar, Timetable, Progress, Meetings, Roster, Checklists, Counsel, Memos, Grades, Stats } from './views';

const TABS = { calendar: '학사일정', timetable: '시간표', progress: '수업진도', meetings: '교무회의', roster: '학급명렬', checklist: '체크리스트', counsel: '상담기록', memo: '메모하기', grades: '성적', stats: '성적통계' };
const LEGEND = [['calendar', '#f08fa0'], ['timetable', '#f4b183'], ['progress', '#f1d36b'], ['meetings', '#8fcf9a'], ['grades', '#6fc3c3'], ['stats', '#a3c46a'], ['roster', '#7fb2ea'], ['checklist', '#8c8cd8'], ['counsel', '#b58ad9'], ['memo', '#d98fc4']];
const EMPTY = { students: [], events: [], tests: [], scores: [], notes: [], timetable: [], checklists: [], checks: [], progress: [], meetings: [], memos: [], day_memos: [], period_notes: [], tt_changes: [], progress_photos: [] };

function Login() {
  const [f, setF] = useState({ email: '', password: '' });
  const [msg, setMsg] = useState('');
  const run = async (signup) => {
    const { error } = await (signup ? sb.auth.signUp(f) : sb.auth.signInWithPassword(f));
    setMsg(error ? error.message : '');
  };
  return (
    <div className="stage">
      <div className="cover">
        <div className="spine" />
        <form className="login" onSubmit={(e) => { e.preventDefault(); run(false); }}>
          <div className="logo"><NotebookPen size={24} strokeWidth={1.8} /></div>
          <small>{new Date().getFullYear()}</small>
          <h1 className="ptitle"><span>학급일지</span></h1>
          <p className="sub">일정 · 시간표 · 성적 · 상담기록</p>
          <label>이메일<input type="email" placeholder="teacher@school.kr" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label>비밀번호<input type="password" placeholder="6자 이상" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
          <button>로그인</button>
          <button type="button" onClick={() => run(true)}>처음이세요? 회원가입</button>
          <p className="msg">{msg}</p>
        </form>
      </div>
    </div>
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
  const [reset, setReset] = useState(0);
  const [focus, setFocus] = useState(null);
  const go = (k, id) => { setFocus(id ? { id } : null); setTab(k); setReset((n) => n + 1); window.scrollTo(0, 0); };
  const [db, setDb] = useState(EMPTY);
  const [err, setErr] = useState('');
  const load = async () => {
    const keys = Object.keys(EMPTY);
    const r = await Promise.all(keys.map((t) => sb.from(t).select(t === 'students' ? 'id,user_id,created_at,num,name,phone,parent_phone,parent_phone2' : '*').order('created_at')));
    // tt_changes(그 날만 바뀐 시간표)는 SQL을 아직 안 돌렸어도 앱이 멈추지 않게 오류를 무시한다
    const bad = r.find((x, i) => x.error && keys[i] !== 'tt_changes' && keys[i] !== 'progress_photos');
    if (bad) return setErr(bad.error.message);
    setDb(Object.fromEntries(keys.map((t, i) => [t, r[i].data ?? []])));
  };
  const [toast, setToast] = useState(false);
  useEffect(() => {
    let t;
    const on = () => { setToast(true); clearTimeout(t); t = setTimeout(() => setToast(false), 1600); };
    window.addEventListener('saved', on);
    return () => { window.removeEventListener('saved', on); clearTimeout(t); };
  }, []);
  useEffect(() => { load(); }, []);

  // 쓰기 후 전체 다시 불러오기: 단순함 우선 (ponytail: 학급 규모라 충분)
  const write = async (q) => { const { error } = await q; setErr(error?.message ?? ''); if (!error) saved(); load(); };
  const add = (t, row) => write(sb.from(t).insert(row));
  const upd = (t, id, patch) => write(sb.from(t).update(patch).eq('id', id));
  const del = (t, id, msg) => confirm(msg ?? '삭제할까요?') && write(sb.from(t).delete().eq('id', id));

  const S = [...db.students].sort((a, b) => (a.num ?? 1e9) - (b.num ?? 1e9) || a.created_at.localeCompare(b.created_at));
  const p = { db, S, uid, add, upd, del, write, load, setDb, go, focus };
  const View = { calendar: Calendar, timetable: Timetable, progress: Progress, meetings: Meetings, roster: Roster, checklist: Checklists, counsel: Counsel, memo: Memos, grades: Grades, stats: Stats }[tab];
  return (
    <>
      <div className="bar"><button className="logout" onClick={() => sb.auth.signOut()}>로그아웃</button></div>
      <div className="paper">
        <div className="phead">
          <h1 className="ptitle"><span>{TABS[tab]}</span></h1>
          <nav className="legend">
            {LEGEND.map(([k, color]) => (
              <button key={k} className={k === tab ? 'on' : ''} onClick={() => { setFocus(null); setTab(k); if (k === tab) setReset((n) => n + 1); }}><i style={{ background: color, '--dot': color }} />{TABS[k]}</button>
            ))}
          </nav>
        </div>
        {err && <p style={{ color: '#c0392b' }}>{err}</p>}
        <View key={`${tab}-${reset}`} {...p} />
      </div>
      {toast && <div className="toast">저장되었습니다</div>}
    </>
  );
}
