'use client';
import { Fragment, useEffect, useRef, useState } from 'react';
import { sb, today, saved } from './sb';
import { holidayName } from './holidays';
import { readSheets, readTable } from './readTable';
import { CalendarDays, PenLine, ListChecks, StickyNote, BookOpen, Users, MessageCircle, Upload, Download, Trash2, Plus, Pencil, Camera } from 'lucide-react';

// 새 기록을 바로 만들고 id를 돌려준다 (칸에서 벗어나면 자동 저장)
async function createRow(table, row, load) {
  const { data, error } = await sb.from(table).insert(row).select().single();
  if (error) { alert(error.message); return null; }
  saved(); await load(); return data.id;
}
const leaving = (e) => !e.currentTarget.contains(e.relatedTarget); // 같은 폼 안에서 다른 칸으로 옮겨 가는 중이면 false
const fd = (e) => { e.preventDefault(); return Object.fromEntries(new FormData(e.target)); };
const Del = ({ onClick }) => <button className="x" onClick={onClick}>삭제</button>;
const dateDesc = (a, b) => b.date.localeCompare(a.date);
const numOf = (s, i) => s.num ?? i + 1;
const NLX = String.fromCharCode(10);

// 사진을 긴 쪽 320px로 줄여서 JPEG data URL로 만든다 (DB에 작게 저장하기 위해)
async function resizePhoto(file, max = 320, cap = 90000) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('사진을 읽을 수 없습니다.')); i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    let q = 0.85, out = c.toDataURL('image/jpeg', q);
    while (out.length > cap && q > 0.4) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
    return out;
  } finally { URL.revokeObjectURL(url); }
}
export const ckDate = (c) => c.date ?? c.created_at?.slice(0, 10) ?? '';
const memoDate = (m) => m.date ?? m.created_at?.slice(0, 10) ?? '';

// 그날 적힌 모든 기록(일정·교시 메모·체크리스트·메모·수업진도·교무회의·상담. 성적은 달력에 표시하지 않는다)을 아이콘과 함께 모은다
export function dayItems(db, d, extraOnly = false) {
  const nm = (id) => db.students.find((x) => x.id === id)?.name ?? '';
  const one = (t) => String(t ?? '').split(/\r?\n/).filter(Boolean).join(' · ');
  const out = [];
  if (!extraOnly) {
    db.events.filter((e) => e.date === d).forEach((e) => out.push({ k: 'e' + e.id, Icon: CalendarDays, color: '#e0607a', text: one(e.title) }));
    db.period_notes.filter((n) => n.date === d && n.text?.trim()).sort((a, b) => a.period - b.period).forEach((n) => out.push({ k: 'p' + n.id, Icon: PenLine, color: '#7b7e90', text: `${n.period}교시 ${one(n.text)}` }));
  }
  db.checklists.filter((c) => ckDate(c) === d).forEach((c) => out.push({ k: 'c' + c.id, tab: 'checklist', id: c.id, Icon: ListChecks, color: '#6c6cc9', text: c.title || '체크리스트' }));
  db.memos.filter((m) => memoDate(m) === d).forEach((m) => out.push({ k: 'm' + m.id, tab: 'memo', id: m.id, Icon: StickyNote, color: '#c1559f', text: m.title || one(m.content) }));
  db.progress.filter((x) => x.date === d).forEach((x) => out.push({ k: 'g' + x.id, tab: 'progress', id: x.id, Icon: BookOpen, color: '#c99a00', text: `${x.subject ?? ''} ${one(x.content)}`.trim() }));
  db.meetings.filter((x) => x.date === d).forEach((x) => out.push({ k: 'h' + x.id, tab: 'meetings', id: x.id, Icon: Users, color: '#3f9e5a', text: x.title || '교무회의' }));
  db.notes.filter((x) => x.date === d).forEach((x) => out.push({ k: 'n' + x.id, tab: 'counsel', id: x.id, Icon: MessageCircle, color: '#8a5cc2', text: `${nm(x.student_id)} 상담` }));
  return out;
}
function DayItems({ items, max, go }) {
  const shown = max ? items.slice(0, max) : items;
  return (
    <>
      {shown.map(({ k, tab, id, Icon, color, text }) => (
        <div key={k} className={`ev it ${tab ? 'go' : ''} ${Icon === CalendarDays ? 'isev' : ''}`} title={text} onClick={tab && go ? (e) => { e.stopPropagation(); go(tab, id); } : undefined}><Icon size={12} strokeWidth={2.4} color={color} /><span>{text}</span></div>
      ))}
      {max && items.length > max && <div className="more">+{items.length - max}개 더</div>}
    </>
  );
}

/* 구글 캘린더 연동: 구글 계정을 한 번 허용하면 학사일정을 내 구글 캘린더로 보내거나 가져온다 (브라우저에서 바로 구글과 통신) */
const GCLIENT = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GBASE = 'https://www.googleapis.com/calendar/v3';
function GoogleCal({ db, load, email }) {
  const [busy, setBusy] = useState('');
  // 연동할 구글 계정: 기억해 둔 값 → 없으면 앱 로그인 이메일이 구글(gmail) 계정일 때 그것을 미리 넣는다
  const isGoogle = /@(gmail|googlemail)\.com$/i.test(email ?? '');
  const [acct, setAcct] = useState(() => { try { return localStorage.getItem('gacct') ?? (isGoogle ? email : ''); } catch { return isGoogle ? email : ''; } });
  const setAcctSave = (x) => { setAcct(x); try { localStorage.setItem('gacct', x); } catch {} };
  useEffect(() => {
    if (!GCLIENT || window.google?.accounts) return;
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; document.head.appendChild(s);
  }, []);
  const token = (scope = 'https://www.googleapis.com/auth/calendar.app.created') => new Promise((res, rej) => {
    if (!GCLIENT) return rej(new Error('구글 연결 설정이 아직 되어 있지 않습니다. (NEXT_PUBLIC_GOOGLE_CLIENT_ID)'));
    if (!window.google?.accounts) return rej(new Error('구글 연결 준비 중입니다. 잠시 후 다시 눌러 주세요.'));
    window.google.accounts.oauth2.initTokenClient({
      client_id: GCLIENT, scope, login_hint: acct.trim() || undefined,
      callback: (r) => (r.access_token ? res(r.access_token) : rej(new Error(r.error_description || r.error || '구글 허용이 취소되었습니다.'))),
      error_callback: (e) => rej(new Error(e.type === 'popup_closed' ? '구글 허용 창이 닫혔습니다.' : e.message || '구글 연결 실패')),
    }).requestAccessToken();
  });
  const call = async (t, url, opt = {}) => {
    const r = await fetch(url, { ...opt, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' } });
    const j = r.status === 204 ? {} : await r.json().catch(() => ({}));
    return { status: r.status, j };
  };
  const nextDay = (d) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
  const run = (name, fn, scope) => async () => {
    setBusy(name);
    try { await fn(await token(scope)); } catch (e) { alert(e.message); } finally { setBusy(''); }
  };
  // 이름이 같은 내 캘린더가 있으면 그것을 쓰고, 없으면 새로 만든다. (기본 캘린더는 건드리지 않는다)
  const ownCal = async (t, name) => {
    const key = 'gcal_id_' + name;
    let id = ''; try { id = localStorage.getItem(key) ?? ''; } catch {}
    if (id) { const ok = await call(t, `${GBASE}/calendars/${encodeURIComponent(id)}`); if (ok.status === 200) return id; }
    const l = await call(t, `${GBASE}/users/me/calendarList?minAccessRole=owner`);
    const f = l.status === 200 && (l.j.items ?? []).find((c) => c.summary === name);
    if (f) id = f.id;
    else {
      const c = await call(t, `${GBASE}/calendars`, { method: 'POST', body: JSON.stringify({ summary: name, timeZone: 'Asia/Seoul' }) });
      if (c.status !== 200) throw new Error('구글에 「' + name + '」 캘린더를 만들지 못했습니다. ' + (c.j.error?.message ?? ''));
      id = c.j.id;
    }
    try { localStorage.setItem(key, id); } catch {}
    return id;
  };
  // 달력에 보이는 모든 기록(일정·교시 메모·체크리스트·메모·수업진도·교무회의·상담)을 날짜별로 모은다. 구글 일정 id = 기록 id(하이픈 제거) + 날짜
  const allItems = () => {
    const dates = new Set();
    db.events.forEach((e) => dates.add(e.date));
    db.period_notes.forEach((x) => x.text?.trim() && dates.add(x.date));
    db.checklists.forEach((x) => dates.add(ckDate(x)));
    db.memos.forEach((x) => dates.add(memoDate(x)));
    db.progress.forEach((x) => dates.add(x.date));
    db.meetings.forEach((x) => dates.add(x.date));
    db.notes.forEach((x) => dates.add(x.date));
    const out = [];
    [...dates].filter(Boolean).sort().forEach((date) => dayItems(db, date).forEach((it) => {
      if (it.text) out.push({ id: it.k.replaceAll('-', '') + date.replaceAll('-', ''), date, text: it.text });
    }));
    return out;
  };
  // 앱 → 구글: 일정 id(기록 id+날짜)를 구글 일정 id로 써서, 다시 보내도 중복되지 않고 고친 내용으로 바뀐다
  // mode 'new' = 「학급일지」 전용 캘린더(없으면 새로 만듦), 'primary' = 내 기존(기본) 캘린더에 추가
  const [calName, setCalName] = useState(() => { try { return localStorage.getItem('gcal_name') || '학급일지'; } catch { return '학급일지'; } });
  const sendTo = (mode) => run('send', async (t) => {
    const name = calName.trim() || '학급일지';
    const items = allItems();
    if (!items.length) return alert('보낼 기록이 없습니다. (달력에 적힌 일정·메모·체크리스트 등이 없습니다)');
    const target = mode === 'primary' ? await pickOne(t, 'writer', '어느 캘린더에 추가할까요? (일정을 쓸 수 있는 캘린더만 보입니다)') : null;
    if (mode === 'primary' && !target) return;
    const where = mode === 'primary' ? '내 「' + target.summary + '」 캘린더' : '새 「' + name + '」 캘린더(없으면 새로 만듦)';
    if (!confirm(`달력에 적힌 기록 ${items.length}개를 ${where}에 보낼까요?` + NLX + (mode === 'primary' ? '기존 캘린더에 일정이 추가됩니다. 이미 보낸 일정은 고친 내용으로 바뀝니다.' : '기본 캘린더에는 들어가지 않고, 이미 보낸 일정은 고친 내용으로 바뀝니다.'))) return;
    const cal = mode === 'primary' ? target.id : await ownCal(t, name);
    const url = `${GBASE}/calendars/${encodeURIComponent(cal)}/events`;
    let ok = 0, bad = 0;
    for (const e of items) {
      const id = e.id;
      const [first, ...rest] = String(e.text).split(/\r?\n/);
      const body = { summary: first || '(제목 없음)', description: rest.join(NLX) || undefined, start: { date: e.date }, end: { date: nextDay(e.date) }, status: 'confirmed' };
      let r = await call(t, `${url}/${id}`, { method: 'PUT', body: JSON.stringify({ id, ...body }) });
      if (r.status === 404) r = await call(t, url, { method: 'POST', body: JSON.stringify({ id, ...body }) });
      if (r.status >= 200 && r.status < 300) ok++; else bad++;
    }
    alert(`${mode === 'primary' ? '내 「' + target.summary + '」 캘린더' : '구글 「' + name + '」 캘린더'}에 보냈습니다. 성공 ${ok}개${bad ? ', 실패 ' + bad + '개' : ''}`);
  }, mode === 'primary' ? 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly' : 'https://www.googleapis.com/auth/calendar.app.created');
  // 구글 → 앱: 내 기본 캘린더의 이번 학년도 일정(이 앱에서 보낸 것 제외)을 학사일정으로 가져온다. 같은 날짜·제목은 건너뛴다
  const pull = run('pull', async (t) => {
    const n = new Date(), sy = n.getMonth() < 2 ? n.getFullYear() - 1 : n.getFullYear();
    const q = new URLSearchParams({ timeMin: `${sy}-03-01T00:00:00+09:00`, timeMax: `${sy + 1}-03-01T00:00:00+09:00`, singleEvents: 'true', orderBy: 'startTime', maxResults: '500' });
    const src = await pickOne(t, 'reader', '어느 캘린더에서 가져올까요?');
    if (!src) return;
    const r = await call(t, `${GBASE}/calendars/${encodeURIComponent(src.id)}/events?${q}`);
    if (r.status !== 200) throw new Error('구글 일정을 불러오지 못했습니다. ' + (r.j.error?.message ?? ''));
    const mine = new Set(allItems().map((e) => e.id));
    const have = new Set(db.events.map((e) => e.date + '|' + e.title));
    const rows = [];
    for (const g of r.j.items ?? []) {
      if (g.status === 'cancelled' || mine.has(g.id)) continue;
      const date = g.start?.date ?? g.start?.dateTime?.slice(0, 10);
      const title = (g.summary ?? '').trim();
      if (!date || !title || have.has(date + '|' + title)) continue;
      have.add(date + '|' + title); rows.push({ date, title });
    }
    if (!rows.length) return alert('새로 가져올 일정이 없습니다.');
    if (!confirm(`${sy}학년도 구글 캘린더 일정 ${rows.length}개를 학사일정으로 가져올까요? (캘린더: ${src.summary})`)) return;
    const { error } = await sb.from('events').insert(rows);
    if (error) throw new Error(error.message);
    await load(); saved();
    alert(`학사일정으로 ${rows.length}개를 가져왔습니다.`);
  }, 'https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly');
  // 내 캘린더가 둘 이상이면 어느 것인지 고르게 한다 (하나뿐이면 기본 캘린더)
  const [pickCal, setPickCal] = useState(null);
  const pickOne = async (t, role, title) => {
    const l = await call(t, `${GBASE}/users/me/calendarList?minAccessRole=${role}`);
    if (l.status !== 200) alert('캘린더 목록을 불러오지 못해 기본 캘린더를 사용합니다.' + NLX + '(' + (l.j.error?.message ?? '오류 ' + l.status) + ')');
    const items = l.status === 200 ? [...(l.j.items ?? [])].sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0)) : [];
    if (items.length < 2) return { id: 'primary', summary: '기본 캘린더' };
    return new Promise((res) => setPickCal({ title, items, res }));
  };
  const [choose, setChoose] = useState(false);
  const pick = (mode) => { if (mode === 'new') { try { localStorage.setItem('gcal_name', calName.trim() || '학급일지'); } catch {} } setChoose(false); sendTo(mode)(); };
  return (
    <>
      <input className="gacct" type="email" value={acct} placeholder="연동할 구글 계정 (예: abc@gmail.com)" onChange={(e) => setAcctSave(e.target.value)} />
      <button type="button" className="gsync" disabled={!!busy} onClick={() => setChoose(!choose)}>{busy === 'send' ? '보내는 중…' : '구글 캘린더로 보내기'}</button>
      <button type="button" className="gsync2" disabled={!!busy} onClick={pull}>{busy === 'pull' ? '가져오는 중…' : '구글 캘린더에서 가져오기'}</button>
      {pickCal && (
        <div className="gchoose">
          <b>{pickCal.title}</b>
          {pickCal.items.map((c) => <button key={c.id} type="button" onClick={() => { pickCal.res({ id: c.id, summary: c.summaryOverride || c.summary }); setPickCal(null); }}><span>{c.summaryOverride || c.summary}{c.primary ? ' (기본)' : ''}</span></button>)}
          <button type="button" className="gcancel" onClick={() => { pickCal.res(null); setPickCal(null); }}>취소</button>
        </div>
      )}
      {choose && (
        <div className="gchoose">
          <b>어디로 보낼까요?</b>
          <label className="gname">새 캘린더 이름 <input value={calName} maxLength={60} onChange={(e) => setCalName(e.target.value)} placeholder="학급일지" /></label>
          <button type="button" onClick={() => pick('new')}><span>새 캘린더 만들어서 넣기</span><small>위 이름의 캘린더를 따로 만들어 거기에만 넣습니다. 같은 이름의 캘린더가 이미 있으면 그것을 씁니다.</small></button>
          <button type="button" onClick={() => pick('primary')}><span>내 기존 캘린더에 추가</span><small>지금 쓰는 기본 캘린더에 일정이 같이 보입니다.</small></button>
          <button type="button" className="gcancel" onClick={() => setChoose(false)}>취소</button>
        </div>
      )}
      </>
  );
}

/* 학사일정 (월간 달력) */
export function Calendar({ db, add, del, uid, email, load, go }) {
  const [view, setView] = useState('year'); // 기본: 연간 캘린더
  const [year, setYear] = useState(new Date().getFullYear());
  const [m, setM] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [sel, setSel] = useState(today());
  const y = m.getFullYear(), mo = m.getMonth();
  const days = new Date(y, mo + 1, 0).getDate();
  const iso = (d) => `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const cells = [...Array((m.getDay() + 6) % 7).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const showMonth = (yy, mm) => { setM(new Date(yy, mm, 1)); setYear(yy); setView('month'); };
  const showWeek = (d) => { setSel(d); setM(new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, 1)); setYear(+d.slice(0, 4)); setView('week'); };
  const shiftWeek = (n) => { const d = new Date(sel + 'T00:00:00'); d.setDate(d.getDate() + n); showWeek(d.toLocaleDateString('sv')); };
  const now = new Date();
  const mondayOf = (d) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.toLocaleDateString('sv'); };
  const menu = (
    <div className="calmenu">
      <button className={view === 'year' ? 'on' : ''} onClick={() => setView('year')}>연간캘린더</button>
      <button className={view === 'month' && y === now.getFullYear() && mo === now.getMonth() ? 'on' : ''} onClick={() => showMonth(now.getFullYear(), now.getMonth())}>이번달</button>
      <button className={view === 'week' && mondayOf(sel) === mondayOf(today()) ? 'on' : ''} onClick={() => showWeek(today())}>이번주</button>
      <GoogleCal db={db} load={load} email={email} />
    </div>
  );

  if (view === 'year') {
    return (
      <>
        {menu}
        <h3 className="monthname">
          <button onClick={() => setYear(year - 1)}>◀</button>
          <span>{year}</span>
          <button onClick={() => setYear(year + 1)}>▶</button>
          <button onClick={() => setYear(now.getFullYear())}>올해</button>
        </h3>
        <div className="yeargrid">
          {Array.from({ length: 12 }, (_, k) => <MiniMonth key={k} db={db} year={year} k={k} onMonth={(kk) => showMonth(year, kk)} onWeek={showWeek} />)}
        </div>
        <p className="hint" style={{ marginTop: 10 }}>가로 한 줄(주)을 누르면 그 주로, 달 이름을 누르면 그 달로 이동합니다. 연한 파란 줄은 이번 주입니다.</p>
      </>
    );
  }
  if (view === 'week') {
    return (
      <>
        {menu}
        <div className="weekbar">
          <button onClick={() => shiftWeek(-7)}>◀ 이전 주</button>
          <button onClick={() => shiftWeek(7)}>다음 주 ▶</button>
        </div>
        <Week sel={sel} db={db} add={add} del={del} uid={uid} load={load} go={go} />
      </>
    );
  }
  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return (
    <div>
      {menu}
      <h3 className="monthname">
        <button onClick={() => setM(new Date(y, mo - 1, 1))}>◀</button>
        <span>{MON[mo]}</span> <small>{y}</small>
        <button onClick={() => setM(new Date(y, mo + 1, 1))}>▶</button>
      </h3>
      <div className="cal">
        {['월', '화', '수', '목', '금', '토', '일'].map((d, i) => <div key={d} className={`h ${i === 6 ? 'sun' : i === 5 ? 'sat' : ''}`}>{d}</div>)}
        {cells.map((d, i) => d === null ? <div key={i} className="h" /> : (
          <div key={i} className={`${iso(d) === today() ? 'td' : ''} ${iso(d) === sel ? 'sel' : ''}`} onClick={() => showWeek(iso(d))}>
            <span className={holidayName(iso(d)) || i % 7 === 6 ? 'sun' : i % 7 === 5 ? 'sat' : ''}>{d}</span>{holidayName(iso(d)) && <span className="hol">{holidayName(iso(d))}</span>}
            <DayItems items={dayItems(db, iso(d))} max={5} go={go} />
          </div>
        ))}
      </div>
    </div>
  );
}

// 연간 캘린더의 한 달: 숫자 아래에 그날 기록이 있으면 종류별 아이콘만 작게 보인다. 가로 한 줄(주)을 누르면 그 주로, 달 이름을 누르면 그 달로
function MiniMonth({ db, year, k, onMonth, onWeek }) {
  const lead = (new Date(year, k, 1).getDay() + 6) % 7, n = new Date(year, k + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const iso = (d) => `${year}-${String(k + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const t = today();
  return (
    <div className="mini">
      <h4 onClick={() => onMonth(k)} title="이 달로 이동">{k + 1}월</h4>
      <div className="mhead">{['월', '화', '수', '목', '금', '토', '일'].map((d, i) => <span key={d} className={i === 6 ? 'sun' : i === 5 ? 'sat' : ''}>{d}</span>)}</div>
      {weeks.map((w, wi) => (
        <div key={wi} className={`mweek ${w.some((d) => d && iso(d) === t) ? 'now' : ''}`} onClick={() => onWeek(iso(w.find(Boolean)))} title="이 주로 이동">
          {w.map((d, i) => {
            if (!d) return <span key={i} />;
            const icons = [];
            dayItems(db, iso(d)).forEach((it) => { if (!icons.some((x) => x.Icon === it.Icon)) icons.push(it); });
            icons.sort((x, y) => (y.Icon === CalendarDays ? 1 : 0) - (x.Icon === CalendarDays ? 1 : 0));
            return (
              <span key={i} title={holidayName(iso(d)) || ''} className={`${holidayName(iso(d)) || i === 6 ? 'sun' : i === 5 ? 'sat' : ''} ${iso(d) === t ? 'today' : ''}`}>{d}
                {icons.length > 0 && <em className="mic">{icons.slice(0, 3).map(({ Icon, color }, j) => (Icon === CalendarDays ? <i key={j} className="rdot" /> : <Icon key={j} size={9} strokeWidth={2.6} color={color} />))}</em>}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* 한 주(월~일) 표: 가로 = 요일, 세로 = 1~6교시. 위 한 줄은 일정(행사), 교시 칸은 메모 */
function Week({ sel, db, add, del, uid, load, go }) {
  const [editCell, setEditCell] = useState(null); // 시간표를 이 날만 바꾸는 중인 칸 '날짜|교시'
  const start = new Date(sel + 'T00:00:00'); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d.toLocaleDateString('sv'); });
  // 하루 일정은 한 칸(최대 3줄)에 자유롭게 입력: 그날의 기존 일정을 지우고 한 건으로 다시 저장
  const evText = (date) => db.events.filter((e) => e.date === date).map((e) => e.title).join('\n');
  const saveEv = async (date, text) => {
    if (text === evText(date)) return;
    if (!text.trim() && !confirm(`${date} 일정을 모두 지울까요?`)) { load(); return; }
    const r = await sb.from('events').delete().eq('date', date);
    const { error } = r.error ? r : text.trim() ? await sb.from('events').insert({ date, title: text }) : r;
    if (error) alert(error.message); else saved();
    load();
  };
  const slot = (date, period) => db.period_notes.find((n) => n.date === date && n.period === period)?.text ?? '';
  const isStruck = (date, period) => !!db.period_notes.find((n) => n.date === date && n.period === period)?.struck;
  // 시간표 탭(학급 시간표)의 내용을 교시 칸 위에 보여 준다 (월~금, 공휴일 제외).
  // 그 날만 바뀐 시간표(tt_changes)가 있으면 그것만 보여 주고 연보라 칸으로 표시한다. (예전에 '수업' 쪽에 저장된 변경도 같은 칸의 변경으로 본다)
  const baseTT = (i, period) => db.timetable.find((t) => t.kind === 'class' && t.day === i + 1 && t.period === period)?.text?.trim() ?? '';
  const chgRow = (date, period) => { const rows = (db.tt_changes ?? []).filter((c) => c.date === date && c.period === period); return rows.find((c) => c.kind === 'class') ?? rows[0]; };
  const offDay = (i) => i >= 5 || !!holidayName(days[i]);
  const ttVal = (i, period) => { if (offDay(i)) return ''; const c = chgRow(days[i], period); return c ? (c.text ?? '') : baseTT(i, period); };
  const ttChanged = (d, i, p) => { if (offDay(i)) return false; const c = chgRow(d, p); return !!c && (c.text ?? '') !== baseTT(i, p); };
  // 그 칸의 메모(변경 이유)에 취소선을 켜고 끈다
  const strike = (d, p, on) => sb.from('period_notes').update({ struck: on }).eq('date', d).eq('period', p).then(() => {}, () => {});
  const clearTT = async (d, p) => {
    const { error } = await sb.from('tt_changes').delete().eq('date', d).eq('period', p);
    if (error) return alert(error.message);
    await strike(d, p, true); // 변경이 취소되었으니 이유를 적어 둔 메모도 취소선
    setEditCell(null); saved(); load();
  };
  const saveTT = async (d, i, p, value) => {
    const v = (value ?? '').trim();
    // 원래 시간표 값을 그대로 쓰면 = 변경 취소
    if (v === baseTT(i, p)) { if (ttChanged(d, i, p)) return clearTT(d, p); setEditCell(null); return; }
    // 옛 '수업' 쪽 변경이 남아 있으면 정리하고, 학급 시간표 변경으로 저장
    const old = await sb.from('tt_changes').delete().eq('date', d).eq('period', p).eq('kind', 'subject');
    if (old.error && !/tt_changes/.test(old.error.message)) return alert(old.error.message);
    const { error } = await sb.from('tt_changes').upsert({ user_id: uid, date: d, kind: 'class', period: p, text: v }, { onConflict: 'user_id,date,kind,period' });
    if (error) return alert(/tt_changes/.test(error.message) ? '시간표 변경을 저장할 곳이 아직 없습니다. Supabase SQL Editor에서 migrate.sql을 한 번 실행해 주세요.' : error.message);
    await strike(d, p, false); // 새로 바꿨으니 취소선 해제
    setEditCell(null); saved(); load();
  };
  const ttCell = (d, i, p) => {
    if (offDay(i)) return null;
    const key = d + '|' + p;
    const open = () => setEditCell(key);
    const changed = ttChanged(d, i, p), v = ttVal(i, p);
    // 고치는 중: 그 칸 안에서 바로 입력. 저장(Enter) / 취소 — 바뀐 칸에서 취소 = 변경 취소(원래 시간표로), Esc = 그냥 닫기
    if (editCell === key) {
      return (
        <form className="ttinline" onSubmit={(e) => { e.preventDefault(); saveTT(d, i, p, new FormData(e.target).get('v')); }}
          onKeyDown={(e) => { if (e.key === 'Escape') setEditCell(null); }}>
          <input name="v" className="k1" defaultValue={v} placeholder="시간표" autoFocus onFocus={(e) => e.target.select()} />
          <div className="ttbtns">
            <button>저장</button>
            {changed ? <button type="button" onClick={() => clearTT(d, p)} title="이 날만 바꾼 것을 지우고 원래 시간표로 되돌립니다">변경 취소</button>
              : <button type="button" onClick={() => setEditCell(null)}>취소</button>}
          </div>
        </form>
      );
    }
    return (
      <div className="ttlabel">
        {v && <b className={`c1 ${changed ? 'chg' : ''}`} onClick={open} title={(changed ? '이 날만 바뀐 시간표' : '시간표') + ' (눌러서 고치기)'}>{v}</b>}
        <button type="button" className="ttedit" title="이 날 시간표 고치기" onClick={open}>✎</button>
      </div>
    );
  };
  const hasTT = db.timetable.some((t) => t.text?.trim());
  const weekKey = days[0]; // 그 주의 월요일
  const weekMemo = db.day_memos.find((m) => m.date === weekKey)?.text ?? '';
  const upsert = async (table, row, conflict) => {
    const { error } = await sb.from(table).upsert({ user_id: uid, ...row }, { onConflict: conflict });
    if (error) alert(error.message); else saved();
    load();
  };
  return (
    <>
      <h3>{days[0]} ~ {days[6]}</h3>
      {hasTT && <p className="hint" style={{ margin: '0 0 6px' }}>교시 칸 위의 글씨는 시간표에서 가져온 것입니다. <b className="ttkey c1 chg">이 날만 변경</b> — 칸에 마우스를 올리면 나오는 ✎로 그 날만 바꿉니다. 늘 바뀌는 것은 시간표 탭에서 고치세요.</p>}
      <div className="weekflex">
      <div className="weekwrap">
        <table className="week">
          <tbody>
            <tr>
              <th style={{ width: 54 }}>교시</th>
              {days.slice(0, 5).map((d, i) => <th key={d} className={`${d === today() ? 'tdh' : ''} ${holidayName(d) ? 'sun' : ''}`}>{'월화수목금'[i]}<br /><small>{d.slice(5)}</small>{holidayName(d) && <small className="hol">{holidayName(d)}</small>}</th>)}
            </tr>
            <tr className="evrow">
              <th>일정</th>
              {days.slice(0, 5).map((d) => (
                <td key={d} className={d === today() ? 'tdc' : ''}>
                  <textarea className="evbox" key={evText(d)} rows="2" defaultValue={evText(d)} placeholder="일정 쓰기" onBlur={(e) => saveEv(d, e.target.value)} />
                  {dayItems(db, d, true).length > 0 && (
                    <div className="evitems">
                      <small>다른 기록</small>
                      <DayItems items={dayItems(db, d, true)} go={go} />
                    </div>
                  )}
                </td>
              ))}
            </tr>
            {[1, 2, 3, 4, 5, 6].map((p) => (
              <tr key={p}>
                <th>{p}</th>
                {days.slice(0, 5).map((d, i) => (
                  <td key={d} className={`${d === today() ? 'tdc' : ''} ${ttChanged(d, i, p) ? 'ttchg' : ''}`}>
                    {ttCell(d, i, p)}
                    <textarea key={slot(d, p)} className={isStruck(d, p) ? 'struck' : ''} title={isStruck(d, p) ? '시간표 변경이 취소되어 취소선이 그어졌습니다' : undefined} rows="3" defaultValue={slot(d, p)}
                      onBlur={(e) => e.target.value !== slot(d, p) && upsert('period_notes', { date: d, period: p, text: e.target.value }, 'user_id,date,period')} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <aside className="weekmemobox">
        <h4>이번 주 메모</h4>
        <textarea key={weekMemo} defaultValue={weekMemo} placeholder="이번 주에 챙길 것, 알림, 기록을 적어 두세요"
          onBlur={(e) => e.target.value !== weekMemo && upsert('day_memos', { date: weekKey, text: e.target.value }, 'user_id,date')} />
      </aside>
      </div>
    </>
  );
}

/* 시간표 (학급 / 수업) */
export function Timetable({ db, uid, load }) {
  const DAYS = ['월', '화', '수', '목', '금'];
  const get = (kind, day, period) => db.timetable.find((t) => t.kind === kind && t.day === day && t.period === period)?.text ?? '';
  const save = async (kind, day, period, text) => {
    if (text === get(kind, day, period)) return;
    const { error } = await sb.from('timetable').upsert({ user_id: uid, kind, day, period, text }, { onConflict: 'user_id,kind,day,period' });
    if (error) alert(error.message); else saved();
    load();
  };
  const grid = (kind, title) => (
    <div>
      <table><tbody>
        <tr><th>교시</th>{DAYS.map((d) => <th key={d}>{d}</th>)}</tr>
        {[1, 2, 3, 4, 5, 6].map((p) => (
          <tr key={p}><th>{p}</th>
            {DAYS.map((_, d) => <td key={d} className="tt"><textarea rows="3" key={get(kind, d + 1, p)} defaultValue={get(kind, d + 1, p)} onBlur={(e) => save(kind, d + 1, p, e.target.value)} /></td>)}
          </tr>
        ))}
      </tbody></table>
    </div>
  );
  return <div className="ttone">{grid('class', '학기 / 학급')}</div>;
}

/* 수업진도: 학년도의 1학기 / 2학기 각각에 진도표 사진 한 장 */
export function Progress({ db, uid, load }) {
  const n = new Date();
  const [sy, setSy] = useState(n.getMonth() < 2 ? n.getFullYear() - 1 : n.getFullYear());
  const [term, setTerm] = useState(n.getMonth() + 1 >= 3 && n.getMonth() + 1 <= 7 ? 1 : 2);
  const [kind, setKind] = useState('progress');
  const KN = kind === 'progress' ? '수업진도' : '수행계획표';
  const row = (db.progress_photos ?? []).find((r) => r.kind === kind && r.year === sy && r.term === term);
  const [busy, setBusy] = useState(false);
  const fail = (m) => alert(/progress_photos/.test(m) ? '사진을 저장할 곳이 아직 없습니다. Supabase SQL Editor에서 migrate.sql을 한 번 실행해 주세요.' : m);
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const photo = await resizePhoto(file, 1800, 700000);
      const { error } = await sb.from('progress_photos').upsert({ user_id: uid, kind, year: sy, term, photo }, { onConflict: 'user_id,kind,year,term' });
      if (error) return fail(error.message);
      saved(); load();
    } catch (e) { fail(e.message); } finally { setBusy(false); }
  };
  // 캡처한 화면을 Ctrl+V로 붙여넣기, 파일을 끌어다 놓기
  useEffect(() => {
    const onPaste = (e) => { const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); upload(f); } };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });
  const remove = async () => {
    if (!confirm(`${sy}학년도 ${term}학기 ${KN} 사진을 삭제할까요?`)) return;
    const { error } = await sb.from('progress_photos').delete().eq('id', row.id);
    if (error) return fail(error.message);
    saved(); load();
  };
  return (
    <>
      <div className="numtabs">
        {[['progress', '수업진도'], ['plan', '수행계획표']].map(([k, n]) => <button key={k} className={k === kind ? 'on' : ''} onClick={() => setKind(k)}>{n}</button>)}
        <span style={{ width: 16 }} />
        <button onClick={() => setSy(sy - 1)} title="이전 학년도">‹</button>
        <b style={{ padding: '0 10px', alignSelf: 'center' }}>{sy}학년도</b>
        <button onClick={() => setSy(sy + 1)} title="다음 학년도">›</button>
        <span style={{ width: 16 }} />
        {[1, 2].map((t) => <button key={t} className={t === term ? 'on' : ''} onClick={() => setTerm(t)}>{t}학기</button>)}
      </div>
      <div className="progphoto" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); upload(f); } }}>
        {row ? <img src={row.photo} alt={`${sy}학년도 ${term}학기 ${KN}`} /> : <div className="progempty">{sy}학년도 {term}학기 {KN} 사진을 올려 주세요.<br />캡처한 화면을 Ctrl+V로 붙여넣거나 끌어다 놓아도 됩니다.</div>}
        <div className="actions">
          {row && <button type="button" className="danger" onClick={remove}>사진 삭제</button>}
          <label className="filebtn">{busy ? '올리는 중…' : row ? '사진 바꾸기' : '사진 올리기'}
            <input type="file" accept="image/*" hidden disabled={busy} onChange={(e) => { upload(e.target.files[0]); e.target.value = ''; }} />
          </label>
        </div>
      </div>
    </>
  );
}

/* 교무회의: 학년도 월 탭(3~2), 왼쪽 제목 목록 / 오른쪽 입력·내용 */
export function Meetings({ db, del, upd, load, focus }) {
  const busy = useRef(false);
  const fr = db.meetings.find((m) => m.id === focus?.id);
  const now = fr ? new Date(fr.date + 'T00:00:00') : new Date();
  const sy = now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear(); // 학년도 시작(3월)
  const MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2];
  const [mo, setMo] = useState(now.getMonth() + 1);
  const year = mo >= 3 ? sy : sy + 1;
  const key = `${year}-${String(mo).padStart(2, '0')}`;
  const rows = db.meetings.filter((m) => m.date.startsWith(key)).sort((a, b) => a.date.localeCompare(b.date));
  const [sel, setSel] = useState(fr?.id ?? null); // 선택한 회의 id (null이면 새로 쓰기)
  const cur = db.meetings.find((m) => m.id === sel);
  const [f, setF] = useState({ date: today(), title: '', content: '' });
  const pickMonth = (n) => { setMo(n); setSel(null); setF({ date: `${n >= 3 ? sy : sy + 1}-${String(n).padStart(2, '0')}-01`, title: '', content: '' }); };
  return (
    <>
      <div className="numtabs">
        {MONTHS.map((n) => <button key={n} className={n === mo ? 'on' : ''} onClick={() => pickMonth(n)}>{n}</button>)}
      </div>
      <div className="two split">
        <div>
          <table><tbody>
            <tr><th style={{ width: 70 }}>날짜</th><th>제목</th></tr>
            {rows.map((m) => (
              <tr key={m.id} className={`pickrow ${m.id === sel ? 'on' : ''} ${m.date === today() ? 'tdr' : ''}`} onClick={() => setSel(m.id)}>
                <td className="c">{m.date.slice(5).replace('-', '/')}</td><td>{m.title || '(제목 없음)'}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="2" style={{ textAlign: 'center', color: 'var(--mute)', padding: 20 }}>{mo}월 기록이 없습니다.</td></tr>}
          </tbody></table>
          <button style={{ marginTop: 10 }} onClick={() => setSel(null)}>+ 새 회의 쓰기</button>
        </div>
        {cur ? (
          <form key={cur.id} onSubmit={(e) => e.preventDefault()} onBlur={(e) => {
            if (!leaving(e)) return;
            const d = Object.fromEntries(new FormData(e.currentTarget));
            if (d.date !== cur.date || d.title !== (cur.title ?? '') || d.content !== (cur.content ?? '')) upd('meetings', cur.id, { date: d.date, title: d.title, content: d.content });
          }}>
            <table className="counseltable"><tbody>
              <tr><th style={{ width: 70 }}>날짜</th><td><input type="date" name="date" defaultValue={cur.date} /></td></tr>
              <tr><th>제목</th><td><input name="title" defaultValue={cur.title ?? ''} /></td></tr>
              <tr><th className="tall">회의<br />내용</th><td className="body"><textarea name="content" defaultValue={cur.content} /></td></tr>
            </tbody></table>
            <div className="actions">
              <button type="button" className="danger" onClick={() => { del('meetings', cur.id, `${cur.date.slice(5)} 「${cur.title || '제목 없음'}」 회의 기록을 삭제할까요?`); setSel(null); }}>삭제</button>
            </div>
          </form>
        ) : (
          <form onSubmit={(e) => e.preventDefault()} onBlur={async (e) => {
            if (!leaving(e) || busy.current || !(f.title.trim() || f.content.trim())) return;
            busy.current = true;
            const id = await createRow('meetings', f, load);
            busy.current = false;
            if (id) { setSel(id); setF({ date: f.date, title: '', content: '' }); }
          }}>
            <table className="counseltable"><tbody>
              <tr><th style={{ width: 70 }}>날짜</th><td><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></td></tr>
              <tr><th>제목</th><td><input value={f.title} placeholder="회의 제목" onChange={(e) => setF({ ...f, title: e.target.value })} /></td></tr>
              <tr><th className="tall">회의<br />내용</th><td className="body"><textarea value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} /></td></tr>
            </tbody></table>
            <p className="hint" style={{ margin: '8px 0 0' }}>쓰다가 칸을 벗어나면 자동으로 저장됩니다.</p>
          </form>
        )}
      </div>
    </>
  );
}

/* 새 학년도 시작 전 백업: 명단·과목별 성적(비고 포함)·상담기록·체크리스트를 한 엑셀 파일로 내려받는다 */
async function backupXlsx(db, S) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const head = (x) => ({ value: x, fontWeight: 'bold', backgroundColor: '#eef0f7', align: 'center' });
  const cell = (x) => (x === '' || x === null || x === undefined ? null : { value: typeof x === 'number' ? x : String(x) });
  const numOfS = (st) => st.num ?? S.indexOf(st) + 1;
  const stu = [...S].sort((a, b) => (a.num ?? 1e9) - (b.num ?? 1e9));
  const used = new Set();
  const sheetName = (n) => { let s = String(n || '시트').replace(/[*?:\\/\[\]]/g, ' ').slice(0, 26) || '시트'; let k = s, i = 2; while (used.has(k)) k = s + i++; used.add(k); return k; };
  const sheets = [];
  sheets.push({ sheet: sheetName('학급명렬'), columns: [{ width: 8 }, { width: 14 }, { width: 16 }, { width: 18 }, { width: 18 }],
    data: [['번호', '이름', '학생 연락처', '학부모 연락처1', '학부모 연락처2'].map(head), ...stu.map((s) => [cell(numOfS(s)), cell(s.name), cell(s.phone), cell(s.parent_phone), cell(s.parent_phone2)])] });
  const subs = [...new Set(db.tests.map((t) => t.subject).filter(Boolean))];
  subs.forEach((sj) => {
    const ts = db.tests.filter((t) => t.subject === sj).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
    const sc = (t, s) => db.scores.find((x) => x.test_id === t.id && x.student_id === s.id);
    sheets.push({ sheet: sheetName(sj), columns: [{ width: 8 }, { width: 14 }, ...ts.flatMap(() => [{ width: 12 }, { width: 16 }])],
      data: [['번호', '이름', ...ts.flatMap((t) => [`${t.name} ${t.date ?? ''}`.trim(), '비고'])].map(head),
        ...stu.map((s) => [cell(numOfS(s)), cell(s.name), ...ts.flatMap((t) => { const x = sc(t, s); return [cell(x?.mark ?? x?.score), cell(x?.note)]; })])] });
  });
  if (db.timetable.some((t) => t.kind === 'class' && t.text?.trim())) {
    const tt = (d, pe) => db.timetable.find((t) => t.kind === 'class' && t.day === d && t.period === pe)?.text ?? '';
    sheets.push({ sheet: sheetName('시간표'), columns: [{ width: 8 }, ...[1, 2, 3, 4, 5].map(() => ({ width: 14 }))],
      data: [['교시', '월', '화', '수', '목', '금'].map(head), ...[1, 2, 3, 4, 5, 6].map((pe) => [cell(pe), ...[1, 2, 3, 4, 5].map((d) => cell(tt(d, pe)))])] });
  }
  const nm = (id) => S.find((x) => x.id === id);
  if (db.notes.length) sheets.push({ sheet: sheetName('상담기록'), columns: [{ width: 8 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 60 }],
    data: [['번호', '이름', '날짜', '대상', '방법', '내용'].map(head), ...[...db.notes].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')).map((n) => [cell(nm(n.student_id) ? numOfS(nm(n.student_id)) : ''), cell(nm(n.student_id)?.name), cell(n.date), cell(n.target), cell(n.method), cell(n.text)])] });
  if (db.checklists.length) sheets.push({ sheet: sheetName('체크리스트'), columns: [{ width: 12 }, { width: 24 }, { width: 70 }],
    data: [['날짜', '제목', '체크한 학생'].map(head), ...[...db.checklists].sort((a, b) => ckDate(a).localeCompare(ckDate(b))).map((c) => [cell(ckDate(c)), cell(c.title), cell(db.checks.filter((k) => k.checklist_id === c.id).map((k) => nm(k.student_id)).filter(Boolean).sort((a, b) => numOfS(a) - numOfS(b)).map((s) => `${numOfS(s)} ${s.name}`).join(', '))])] });
  await writeXlsxFile(sheets).toFile(`학급일지_백업_${today()}.xlsx`);
}

/* 학급명렬 */
export function Roster({ db, S, add, del, upd, load }) {
  const [selId, setSelId] = useState(null); // 칸을 눌러 고치는 중인 학생 = 선택된 줄
  const picked = S.find((s) => s.id === selId);
  const importXlsx = async (file) => {
    if (!file) return;
    const rows = await readTable(file);
    // 첫 줄에 '이름'이 있으면 머리글로 보고 열 위치를 찾고, 없으면 번호·이름·학생연락처·학부모연락처 순서로 간주
    const h = rows[0]?.findIndex((c) => c.includes('이름')) >= 0 ? rows.shift() : ['번호', '이름', '학생', '학부모1', '학부모2'];
    const col = (k) => h.findIndex((c) => c.includes(k));
    const [ci, cn, cp, cq, cr] = [col('번호'), col('이름'), col('학생'), col('학부모1') >= 0 ? col('학부모1') : col('학부모'), col('학부모2')];
    let fi = 0;
    const free = nextFree(rows.length);
    const list = rows.filter((r) => r[cn]).map((r) => ({ num: +r[ci] || free[fi++], name: r[cn], phone: r[cp] || null, parent_phone: r[cq] || null, parent_phone2: r[cr] || null }));
    if (list.length && confirm(`${list.length}명을 등록할까요?`)) add('students', list);
  };
  // 학급명렬 번호 칸: 왼쪽 1~15번, 오른쪽 51~65번. 16~50번, 66번 이상도 있으면 해당 칸 아래에 이어서 보인다.
  const sorted = [...S].sort((a, b) => (a.num ?? 1e9) - (b.num ?? 1e9));
  const used = new Set(sorted.map((s) => s.num).filter(Boolean));
  const byNum = Object.fromEntries(sorted.filter((s) => s.num).map((s) => [s.num, s]));
  const nextFree = (k) => {
    const out = [];
    for (const c of [...Array.from({ length: 15 }, (_, i) => i + 1), ...Array.from({ length: 300 }, (_, i) => 51 + i)]) {
      if (!used.has(c)) { out.push(c); if (out.length === k) break; }
    }
    return out;
  };
  const column = (slots, extra, loose, blank) => {
    const nums = [...new Set([...slots, ...extra])].sort((a, b) => a - b);
    const last = nums[nums.length - 1];
    const rows = nums.map((n) => (byNum[n] ? { s: byNum[n] } : { n }));
    loose.forEach((s) => rows.push({ s }));
    if (blank) [1, 2].forEach((k) => rows.push({ n: last + k }));
    return rows;
  };
  // 이 학급의 기록을 '지난기록'으로 통째로 보관한다. 성공하면 true (실패하면 안내를 띄우고 false)
  const saveArchive = async () => {
    const today0 = new Date(), sy = today0.getMonth() < 2 ? today0.getFullYear() - 1 : today0.getFullYear();
    const snap = {
      students: S.map((s) => ({ id: s.id, num: s.num, name: s.name, phone: s.phone, parent_phone: s.parent_phone, parent_phone2: s.parent_phone2 })),
      tests: db.tests.map((t) => ({ id: t.id, subject: t.subject, name: t.name, date: t.date })),
      scores: db.scores.map((x) => ({ test_id: x.test_id, student_id: x.student_id, score: x.score, mark: x.mark, note: x.note })),
      notes: db.notes.map((n) => ({ student_id: n.student_id, date: n.date, target: n.target, method: n.method, text: n.text })),
      checklists: db.checklists.map((c) => ({ id: c.id, date: ckDate(c), title: c.title })),
      checks: db.checks.map((k) => ({ checklist_id: k.checklist_id, student_id: k.student_id })),
      timetable: db.timetable.filter((t) => t.kind === 'class').map((t) => ({ day: t.day, period: t.period, text: t.text })),
    };
    // 같은 학년도 이름의 보관본이 이미 있으면 새로 쌓지 않고 그 보관본을 덮어쓴다
    const label = sy + '학년도';
    const ex = (db.archives ?? []).find((x) => x.label === label);
    if (!S.length) { alert('지금 학생 명단이 비어 있어 보관하지 않았습니다.' + NLX + '(이미 보관된 지난기록을 빈 기록으로 덮어쓰지 않기 위해서입니다)'); return false; }
    if (ex && (ex.data?.students?.length ?? 0) > S.length && !confirm('이미 보관된 「' + label + '」에는 학생이 ' + ex.data.students.length + '명 있는데, 지금은 ' + S.length + '명입니다.' + NLX + '지금 기록으로 덮어쓰면 이전 보관 내용이 바뀝니다. 덮어쓸까요?')) return false;
    const keep = ex
      ? await sb.from('archives').update({ data: snap, created_at: new Date().toISOString() }).eq('id', ex.id)
      : await sb.from('archives').insert({ label, data: snap });
    if (keep.error) { alert((/archives/.test(keep.error.message) ? '지난기록을 보관할 곳이 아직 없습니다. Supabase SQL Editor에서 안내해 드린 SQL을 한 번 실행해 주세요.' : '지난기록 보관에 실패했습니다. ' + keep.error.message) + NLX + '아무것도 지우지 않았습니다.'); return false; }
    return true;
  };
  // 새 학년도 시작: 지금 학급의 기록을 '지난기록'에 보관하고 백업 엑셀을 내려받는다. 지우지는 않는다 (지우기는 '학생 전체 삭제' 버튼)
  const newYear = async () => {
    if (!S.length && !db.tests.length && !db.checklists.length && !db.timetable.length) return alert('보관할 학생·성적·체크리스트·시간표가 없습니다.');
    if (!confirm('새 학년도를 시작합니다.' + NLX + NLX + '지금 학급의 명단·성적(비고 포함)·상담·체크리스트·시간표가 "지난기록"으로 이동(보관)됩니다. 백업 엑셀도 내려받습니다.' + NLX + '이 단계에서는 아무것도 지우지 않습니다.' + NLX + '학생은 보관한 뒤 아래 "학생 전체 삭제" 버튼으로 삭제하세요.' + NLX + NLX + '진행할까요?')) return;
    if (!(await saveArchive())) return;
    try { await backupXlsx(db, S); } catch (e) { await load(); return alert('지난기록에는 보관했지만 백업 엑셀은 만들지 못했습니다.' + NLX + e.message); }
    await load(); saved();
    alert('지난 학급 기록이 "지난기록"으로 이동(보관)되었습니다. 백업 엑셀도 내려받았습니다.' + NLX + NLX + '학생은 아래 "학생 전체 삭제" 버튼으로 삭제하세요.' + NLX + '(지금은 아무것도 지우지 않았습니다)');
  };
  const clearAll = async () => {
    // 가장 최근에 보관한 지난기록과 지금 학생 명단을 한 명씩 비교한다. 하나라도 다르면 지우지 않는다
    const last = [...(db.archives ?? [])].sort((x, y) => (y.created_at ?? '').localeCompare(x.created_at ?? ''))[0];
    if (!last) return alert('먼저 위쪽 "새 학년도 시작"을 눌러 지금 학급 기록을 "지난기록"에 보관하세요.' + NLX + '보관한 뒤에만 지울 수 있습니다. (아무것도 지우지 않았습니다)');
    const kept = new Map((last.data?.students ?? []).map((s) => [s.id, s]));
    const label = (s) => (s.num ? s.num + '번 ' : '번호없음 ') + (s.name || '(이름 없음)');
    const missing = S.filter((s) => !kept.has(s.id));
    const changed = S.filter((s) => { const k = kept.get(s.id); return k && ((k.num ?? null) !== (s.num ?? null) || (k.name ?? '') !== (s.name ?? '') || (k.phone ?? '') !== (s.phone ?? '') || (k.parent_phone ?? '') !== (s.parent_phone ?? '') || (k.parent_phone2 ?? '') !== (s.parent_phone2 ?? '')); });
    const nowIds = new Set(S.map((s) => s.id));
    const gone = [...kept.values()].filter((s) => !nowIds.has(s.id)).sort((x, y) => (x.num ?? 1e9) - (y.num ?? 1e9)); // 보관본에는 있는데 지금 명단에서 빠진 학생
    if (missing.length || changed.length || gone.length) {
      const list = (arr) => arr.slice(0, 12).map(label).join(', ') + (arr.length > 12 ? ' 외 ' + (arr.length - 12) + '명' : '');
      return alert('지난기록(' + last.label + ')에 보관된 학생 명단과 지금 명단이 달라서 지울 수 없습니다.' + NLX + NLX
        + (missing.length ? '· 보관본에 없는 학생: ' + list(missing) + NLX : '')
        + (gone.length ? '· 보관본에는 있는데 지금 명단에 없는 학생: ' + list(gone) + NLX : '')
        + (changed.length ? '· 보관 후 정보가 바뀐 학생: ' + list(changed) + NLX : '')
        + NLX + (gone.length ? '※ 보관 후에 지운 학생이 있으면, 지금 기록으로 다시 보관(덮어쓰기)할 때 그 학생의 보관 기록은 빠집니다.' + NLX + '그 학생을 다시 등록하거나, 빠져도 괜찮을 때만 다시 보관하세요.' + NLX : '')
        + '위쪽 "새 학년도 시작"을 눌러 지금 기록을 다시 보관한 뒤 지워 주세요. (아무것도 지우지 않았습니다)');
    }
    if (!S.length && !db.tests.length && !db.checklists.length && !db.timetable.length) return alert('지울 것이 없습니다.');
    if (!confirm('지난기록에 보관된 것을 확인했습니다.' + NLX + NLX + '학생 ' + S.length + '명과 성적·평가, 체크리스트, 상담기록, 시간표를 모두 지웁니다.' + NLX + '일정으로 등록한 학사일정, 교시 메모, 메모, 교무회의, 수업진도·수행계획표 사진은 남습니다.' + NLX + '정말 지울까요?')) return;
    if (!confirm('되돌릴 수 없습니다. 한 번 더 확인합니다. 지울까요?')) return;
    const steps = [['students', S.map((x) => x.id)], ['tests', db.tests.map((x) => x.id)], ['checklists', db.checklists.map((x) => x.id)], ['timetable', db.timetable.map((x) => x.id)], ['tt_changes', (db.tt_changes ?? []).map((x) => x.id)]];
    for (const [t, ids] of steps) {
      if (!ids.length) continue;
      const { error } = await sb.from(t).delete().in('id', ids);
      if (error && t === 'tt_changes') continue; // 이 표가 아직 없는 경우는 무시
      if (error) { await load(); return alert('지우는 중 오류가 났습니다(' + t + '): ' + error.message); }
    }
    await load(); saved();
    alert('새 학급을 시작할 준비가 끝났습니다. 위쪽에서 새 학생 명단을 올려 주세요.');
  };
  const colA = column(Array.from({ length: 15 }, (_, i) => i + 1), sorted.filter((s) => s.num > 15 && s.num < 51).map((s) => s.num), sorted.filter((s) => !s.num), false);
  const colB = column(Array.from({ length: 15 }, (_, i) => 51 + i), sorted.filter((s) => s.num > 65).map((s) => s.num), [], true);
  const addRow = (e) => {
    const tr = e.target.closest('tr');
    if (e.relatedTarget && tr.contains(e.relatedTarget)) return; // 같은 줄 안에서 옮겨 가는 중이면 아직 저장하지 않음
    const g = (f) => tr.querySelector(`[data-f="${f}"]`)?.value.trim() ?? '';
    const num = +g('num'), name = g('name'), phone = g('phone'), pp = g('parent_phone'), pp2 = g('parent_phone2');
    if (num && (name || phone || pp || pp2)) add('students', { num, name, phone: phone || null, parent_phone: pp || null, parent_phone2: pp2 || null });
  };
  const field = (s, k, n) => (
    <td className="c"><input data-f={k} key={s ? s[k] : `${k}${n}`} defaultValue={s?.[k] ?? ''}
      onBlur={(e) => { if (!s) return addRow(e); if (e.target.value.trim() !== (s[k] ?? '')) upd('students', s.id, { [k]: e.target.value.trim() }); }} /></td>
  );
  return (
    <>
      <details className="bulk">
        <summary>이름 여러 명 한꺼번에 붙여넣기</summary>
        <form onSubmit={(e) => {
          const names = fd(e).names.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
          if (names.length) { const free = nextFree(names.length); add('students', names.map((name, i) => ({ name, num: free[i] }))); }
          e.target.reset();
        }}>
          <textarea name="names" rows="3" placeholder="이름을 한 줄에 한 명씩" /><br /><button>학생 추가</button>
        </form>
      </details>
      <div className="toolbar">
        <label className="btn primary"><Upload size={16} /> 엑셀·CSV로 학생 올리기<input type="file" accept=".xlsx,.csv" onChange={(e) => { importXlsx(e.target.files[0]); e.target.value = ''; }} /></label>
        <a className="btn" href="/samples/sample-roster.xlsx" download="샘플_학생명단.xlsx"><Download size={16} /> 샘플 파일 받기</a>
        <button type="button" className="btn danger" onClick={newYear} title="지금 학급 기록을 지난기록에 보관하고 백업 엑셀을 받습니다(지우지 않음)">새 학년도 시작</button>
        <span className="hint">열 순서: 번호 · 이름 · 학생 연락처 · 학부모 연락처1 · 학부모 연락처2 (첫 줄은 머리글)</span>
      </div>
      <div className="two rostertwo">
        {[colA, colB].map((part, k) => (
          <table key={k}><tbody>
            <tr><th style={{ width: 62 }}>번호</th><th>이름</th><th>학생 연락처</th><th>학부모 연락처1</th><th>학부모 연락처2</th></tr>
            {part.map(({ s, n }) => (
              <tr key={s ? s.id : `b${n}`} className={s && s.id === selId ? 'pickd' : ''} onFocus={() => setSelId(s ? s.id : null)}>
                <td className="c"><input type="number" data-f="num" key={s ? s.num : `n${n}`} defaultValue={s ? s.num ?? '' : n}
                  onBlur={(e) => { if (!s) return addRow(e); if (+e.target.value && +e.target.value !== s.num) upd('students', s.id, { num: +e.target.value }); }} /></td>
                {field(s, 'name', n)}{field(s, 'phone', n)}{field(s, 'parent_phone', n)}{field(s, 'parent_phone2', n)}
              </tr>
            ))}
          </tbody></table>
        ))}
      </div>
      <div className="actions" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="danger" disabled={!picked} onClick={() => { del('students', picked.id, `${picked.num ?? ''}번 ${picked.name} 학생을 삭제할까요?` + NLX + '이 학생의 성적·체크·상담 기록도 모두 함께 지워집니다.'); setSelId(null); }}>{picked ? `${picked.num ?? ''}번 ${picked.name} 삭제` : '학생 삭제 (줄을 먼저 클릭)'}</button>
        <button type="button" className="danger" onClick={clearAll}>학생 전체 삭제</button>
      </div>
    </>
  );
}

/* 체크리스트: 날짜가 있는 항목. 월 탭 + 왼쪽 목록 / 오른쪽 날짜·제목·번호 체크 */
export function Checklists({ db, S, del, upd, write, load, focus }) {
  const fr = db.checklists.find((c) => c.id === focus?.id);
  const now = fr ? new Date(ckDate(fr) + 'T00:00:00') : new Date();
  const sy = now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear();
  const MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2];
  const [mo, setMo] = useState(now.getMonth() + 1);
  const year = mo >= 3 ? sy : sy + 1;
  const key = `${year}-${String(mo).padStart(2, '0')}`;
  const rows = db.checklists.filter((c) => ckDate(c).startsWith(key)).sort((a, b) => ckDate(a).localeCompare(ckDate(b)));
  const [sel, setSel] = useState(fr?.id ?? null);
  const cur = db.checklists.find((c) => c.id === sel);
  const count = (id) => db.checks.filter((k) => k.checklist_id === id).length;
  const create = async () => {
    const date = mo === now.getMonth() + 1 ? today() : `${year}-${String(mo).padStart(2, '0')}-01`;
    const { data, error } = await sb.from('checklists').insert({ date, title: '' }).select().single();
    if (error) return alert(error.message);
    await load(); setSel(data.id); saved();
  };
  const toggle = (cid, sid, on) => write(on
    ? sb.from('checks').delete().match({ checklist_id: cid, student_id: sid })
    : sb.from('checks').insert({ checklist_id: cid, student_id: sid }));
  return (
    <>
      <div className="numtabs">
        {MONTHS.map((n) => <button key={n} className={n === mo ? 'on' : ''} onClick={() => { setMo(n); setSel(null); }}>{n}</button>)}
      </div>
      <div className="two split">
        <div>
          <table><tbody>
            <tr><th style={{ width: 70 }}>날짜</th><th>제목</th><th style={{ width: 64 }}>체크</th></tr>
            {rows.map((c) => (
              <tr key={c.id} className={`pickrow ${c.id === sel ? 'on' : ''} ${ckDate(c) === today() ? 'tdr' : ''}`} onClick={() => setSel(c.id)}>
                <td className="c">{ckDate(c).slice(5).replace('-', '/')}</td><td>{c.title || '(제목 없음)'}</td><td className="c">{count(c.id)}/{S.length}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="3" style={{ textAlign: 'center', color: 'var(--mute)', padding: 20 }}>{mo}월 체크리스트가 없습니다.</td></tr>}
          </tbody></table>
          <button style={{ marginTop: 10 }} onClick={create}>+ 새 체크리스트</button>
        </div>
        {cur ? (
          <div key={cur.id}>
            <table className="counseltable ckpanel"><tbody>
              <tr><th style={{ width: 70 }}>날짜</th><td><input type="date" defaultValue={ckDate(cur)} onBlur={(e) => e.target.value && e.target.value !== ckDate(cur) && upd('checklists', cur.id, { date: e.target.value })} /></td></tr>
              <tr><th>제목</th><td><input defaultValue={cur.title} placeholder="예: 가정통신문 제출" onBlur={(e) => e.target.value !== cur.title && upd('checklists', cur.id, { title: e.target.value })} /></td></tr>
              <tr><th className="tall">체크</th><td className="body">
                {S.length === 0 && <p style={{ margin: 12 }}>먼저 학급명렬에서 학생을 추가하세요.</p>}
                <div className="nums">
                  {S.map((s, i) => {
                    const on = db.checks.some((k) => k.checklist_id === cur.id && k.student_id === s.id);
                    return <button key={s.id} type="button" className={`chk ${on ? 'on' : ''}`} title={`${numOf(s, i)}번 ${s.name}`} onClick={() => toggle(cur.id, s.id, on)}><b>{numOf(s, i)}</b><span>{s.name}</span></button>;
                  })}
                </div>
              </td></tr>
            </tbody></table>
            <div className="actions">
              <button type="button" className="danger" onClick={() => { del('checklists', cur.id, `「${cur.title || '제목 없음'}」 체크리스트와 학생들의 체크 기록을 삭제할까요?`); setSel(null); }}>삭제</button>
              <span style={{ color: 'var(--mute)', fontSize: 14 }}>번호를 누르면 바로 저장됩니다 · {count(cur.id)}/{S.length}</span>
            </div>
          </div>
        ) : <p style={{ color: 'var(--mute)' }}>왼쪽에서 체크리스트를 고르거나 “+ 새 체크리스트”를 누르세요.</p>}
      </div>
    </>
  );
}

/* 상담기록 */
export function Counsel({ db, S, del, upd, load, focus }) {
  const busy = useRef(false);
  const fr = db.notes.find((n) => n.id === focus?.id);
  const [sid, setSid] = useState(fr?.student_id ?? S[0]?.id ?? '');
  const [date, setDate] = useState(today());
  const [target, setTarget] = useState('학생');
  const [method, setMethod] = useState('면담');
  const [text, setText] = useState('');
  const [editId, setEditId] = useState(null);
  const stu = S.find((s) => s.id === sid) ?? S[0];
  // 사진은 목록 불러오기에 넣지 않고(용량), 학생을 고를 때 그 학생 것만 가져온다
  const [photo, setPhoto] = useState(null);
  useEffect(() => {
    let off = false;
    setPhoto(stu?.photo ?? null);
    if (stu && stu.photo === undefined) {
      sb.from('students').select('photo').eq('id', stu.id).maybeSingle().then(({ data }) => { if (!off) setPhoto(data?.photo ?? null); });
    }
    return () => { off = true; };
  }, [stu?.id]);
  const photoError = (m) => alert(/photo/.test(m) ? '사진을 저장할 칸이 아직 없습니다. Supabase SQL Editor에서 migrate.sql을 한 번 실행해 주세요.' : m);
  const pickPhoto = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return alert('사진(이미지) 파일을 선택하세요.');
    try {
      const url = await resizePhoto(file);
      const { error } = await sb.from('students').update({ photo: url }).eq('id', stu.id);
      if (error) return photoError(error.message);
      setPhoto(url); saved();
    } catch (e) { alert(e.message); }
  };
  const removePhoto = async () => {
    if (!confirm(`${stu.name} 학생의 사진을 삭제할까요?`)) return;
    const { error } = await sb.from('students').update({ photo: null }).eq('id', stu.id);
    if (error) return photoError(error.message);
    setPhoto(null); saved();
  };
  const mine = db.notes.filter((n) => n.student_id === stu?.id).sort(dateDesc);
  // 상담 내용은 쓰다가 칸을 벗어나면(또는 대상·방법을 고르면) 자동 저장. 처음이면 새 기록을 만들고, 이후에는 그 기록을 고친다
  const persist = async (over = {}) => {
    const row = { date, target, method, text, ...over };
    if (!row.text.trim()) return;
    if (editId) {
      const c = db.notes.find((x) => x.id === editId);
      if (c && (c.date !== row.date || (c.target ?? '') !== row.target || (c.method ?? '') !== row.method || (c.text ?? '') !== row.text)) upd('notes', editId, row);
    } else if (!busy.current) {
      busy.current = true;
      const id = await createRow('notes', { ...row, student_id: stu.id }, load);
      busy.current = false;
      if (id) setEditId(id);
    }
  };
  const pick = (opts, val, set, key) => opts.map((o) => <td key={o} className={`pick ${val === o ? 'on' : ''}`} onClick={() => { set(o); persist({ [key]: o }); }}>{o}</td>);
  if (!S.length) return <p>먼저 학급명렬에서 학생을 추가하세요.</p>;
  return (
    <>
      <div className="searchbar">
        <select value={stu.id} onChange={(e) => { setSid(e.target.value); setEditId(null); setText(''); }}>
          {S.map((s, i) => <option key={s.id} value={s.id}>{numOf(s, i)}번 {s.name}</option>)}
        </select>
      </div>
      <div className="two counsel">
        <div>
          <table><tbody>
            <tr><td rowSpan="2" className="photo">
              <label className="photobox" title={photo ? '눌러서 사진 바꾸기' : '눌러서 사진 등록'}>
                {photo ? <img src={photo} alt={stu.name} /> : <span><Camera size={22} /><br />사진 등록</span>}
                <input type="file" accept="image/*" onChange={(e) => { pickPhoto(e.target.files[0]); e.target.value = ''; }} />
              </label>
              {photo && <button type="button" className="x photodel" onClick={removePhoto}>사진 삭제</button>}
            </td><th>이름</th><td>{stu.name}</td></tr>
            <tr><th>기록</th><td>{mine.length ? `${mine.length}회 · 최근 ${mine[0].date.slice(5).replace('-', '/')}` : '기록 없음'}</td></tr>
          </tbody></table>
          <div className="history">
            {mine.map((n) => (
              <div key={n.id} className={`note ${n.id === editId ? 'on' : ''} ${n.date === today() ? 'tdr' : ''}`} title="누르면 오른쪽에서 수정할 수 있습니다" onClick={() => { setEditId(n.id); setDate(n.date); setTarget(n.target ?? '학생'); setMethod(n.method ?? '면담'); setText(n.text); }}>
                <b>{n.date}</b> · {n.target} · {n.method} <Del onClick={(e) => { e.stopPropagation(); del('notes', n.id, `${n.date} 상담 기록을 삭제할까요?`); if (editId === n.id) { setEditId(null); setText(''); } }} />
                <div style={{ whiteSpace: 'pre-wrap' }}>{n.text}</div>
              </div>
            ))}
          </div>
        </div>
        <form onSubmit={(e) => e.preventDefault()}>
          <table className="counseltable"><tbody>
            <tr><th>날짜</th><td colSpan="3"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} onBlur={() => persist()} /></td></tr>
            <tr><th>대상</th>{pick(['학생', '학부모', '친구'], target, setTarget, 'target')}</tr>
            <tr><th>방법</th>{pick(['면담', '전화', '문자/인터넷'], method, setMethod, 'method')}</tr>
            <tr><th className="tall">상담<br />내용</th><td colSpan="3" className="body"><textarea value={text} onChange={(e) => setText(e.target.value)} onBlur={() => persist()} placeholder="쓰다가 칸을 벗어나면 자동으로 저장됩니다" /></td></tr>
          </tbody></table>
          <div className="actions">
            {editId ? <button type="button" onClick={() => { setEditId(null); setText(''); setDate(today()); }}>새로 쓰기</button> : <span />}
          </div>
        </form>
      </div>
    </>
  );
}

/* 메모하기: 날짜를 골라 쓰기. 왼쪽 목록 / 오른쪽 입력·수정 */
export function Memos({ db, del, upd, load, focus }) {
  const busy = useRef(false);
  const fr = db.memos.find((m) => m.id === focus?.id);
  const [sel, setSel] = useState(fr?.id ?? null);
  const cur = db.memos.find((m) => m.id === sel);
  const [f, setF] = useState({ date: today(), title: '', content: '' });
  const [edit, setEdit] = useState(fr ? { date: memoDate(fr), title: fr.title ?? '', content: fr.content } : null);
  const fields = (v, set) => (
    <table className="counseltable"><tbody>
      <tr><th style={{ width: 70 }}>날짜</th><td><input type="date" value={v.date} onChange={(e) => set({ ...v, date: e.target.value })} /></td></tr>
      <tr><th>제목</th><td><input value={v.title ?? ''} placeholder="제목" onChange={(e) => set({ ...v, title: e.target.value })} /></td></tr>
      <tr><th className="tall">메모</th><td className="body"><textarea value={v.content} onChange={(e) => set({ ...v, content: e.target.value })} /></td></tr>
    </tbody></table>
  );
  return (
    <div className="two split">
      <div>
        <table><tbody>
          <tr><th style={{ width: 70 }}>날짜</th><th>제목</th></tr>
          {[...db.memos].sort((a, b) => memoDate(b).localeCompare(memoDate(a))).map((m) => (
            <tr key={m.id} className={`pickrow ${m.id === sel ? 'on' : ''} ${memoDate(m) === today() ? 'tdr' : ''}`} onClick={() => { setSel(m.id); setEdit({ date: memoDate(m), title: m.title ?? '', content: m.content }); }}>
              <td className="c">{memoDate(m).slice(5).replace('-', '/')}</td><td>{m.title || '(제목 없음)'}</td>
            </tr>
          ))}
          {db.memos.length === 0 && <tr><td colSpan="2" style={{ textAlign: 'center', color: 'var(--mute)', padding: 20 }}>아직 메모가 없습니다.</td></tr>}
        </tbody></table>
        <button style={{ marginTop: 10 }} onClick={() => setSel(null)}>+ 새 메모 쓰기</button>
      </div>
      {cur && edit ? (
        <form key={cur.id} onSubmit={(e) => e.preventDefault()} onBlur={(e) => {
          if (!leaving(e)) return;
          if (edit.date !== memoDate(cur) || (edit.title ?? '') !== (cur.title ?? '') || edit.content !== (cur.content ?? '')) upd('memos', cur.id, edit);
        }}>
          {fields(edit, setEdit)}
          <div className="actions">
            <button type="button" className="danger" onClick={() => { del('memos', cur.id, `「${cur.title || '제목 없음'}」 메모를 삭제할까요?`); setSel(null); }}>삭제</button>
          </div>
        </form>
      ) : (
        <form onSubmit={(e) => e.preventDefault()} onBlur={async (e) => {
          if (!leaving(e) || busy.current || !(f.content.trim() || f.title.trim())) return;
          busy.current = true;
          const id = await createRow('memos', f, load);
          busy.current = false;
          if (id) { setSel(id); setEdit({ date: f.date, title: f.title, content: f.content }); setF({ date: f.date, title: '', content: '' }); }
        }}>
          {fields(f, setF)}
          <p className="hint" style={{ margin: '8px 0 0' }}>쓰다가 칸을 벗어나면 자동으로 저장됩니다.</p>
        </form>
      )}
    </div>
  );
}

/* 성적: 과목(시트) 탭 + 학생 × 평가(날짜) 표. 숫자 또는 '결석' 같은 글자, 점수 색 구분, 맨 아래 평균 */
export function Grades({ db, S, add, del, upd, setDb, load }) {
  const [extra, setExtra] = useState([]); // 평가를 아직 만들지 않은 새 과목(평가를 추가하면 저장된다)
  const subjects = [...new Set([...db.tests.map((t) => t.subject).filter(Boolean), ...extra])];
  const [sub, setSub] = useState('');
  const cur = subjects.includes(sub) ? sub : subjects[0] ?? '';
  const addSubject = () => {
    const n = (prompt('추가할 과목 이름을 입력하세요. (예: 수학)') || '').trim();
    if (!n) return;
    if (!subjects.includes(n)) setExtra((e) => [...e, n]);
    setSub(n);
  };
  const [editSub, setEditSub] = useState(false); // 지금 보는 과목 탭을 눌러서 이름을 고치는 중
  const renameSubject = async (raw) => {
    setEditSub(false);
    const n = (raw || '').trim();
    if (!n || n === cur) return;
    if (subjects.includes(n) && !confirm('「' + n + '」 과목이 이미 있습니다. 두 과목을 합칠까요?')) return;
    const hasSaved = db.tests.some((t) => t.subject === cur);
    if (hasSaved) {
      const { error } = await sb.from('tests').update({ subject: n }).eq('subject', cur);
      if (error) return alert(error.message);
      await load(); saved();
    }
    // 평가가 있는 과목은 저장된 이름으로, 아직 평가가 없는 새 과목은 임시 목록에서 새 이름으로 바꾼다
    setExtra((e) => [...e.filter((x) => x !== cur && x !== n), ...(hasSaved ? [] : [n])]);
    setSub(n);
  };
  // 과목별로 그 과목의 모든 평가를 날짜순으로 보여 준다
  const tDate = (t) => t.date ?? t.created_at?.slice(0, 10) ?? '';
  // 날짜순으로 보여 준다
  const tests = db.tests.filter((t) => t.subject === cur).sort((a, b) => tDate(a).localeCompare(tDate(b)));
  const newDate = today();
  // 비고: 점수 칸마다 하나씩 (scores.note)
  const [selRow, setSelRow] = useState(null); // 번호·이름을 눌러 선택한 학생 줄
  const [notePop, setNotePop] = useState(null); // 비고를 쓰는 중인 점수 칸 {tid, sid, x, y}
  const note = (tid, sid) => row(tid, sid)?.note ?? '';
  const saveNote = (tid, sid, raw) => {
    const t = raw.trim();
    if (t === note(tid, sid)) return;
    setDb((d) => ({ ...d, scores: [...d.scores.filter((x) => !(x.test_id === tid && x.student_id === sid)), { score: null, mark: null, ...(row(tid, sid) ?? {}), test_id: tid, student_id: sid, note: t }] }));
    sb.from('scores').upsert({ test_id: tid, student_id: sid, note: t })
      .then(({ error }) => (error ? alert(/note/.test(error.message) ? '비고를 저장할 곳이 아직 없습니다. Supabase SQL Editor에서 안내해 드린 SQL을 한 번 실행해 주세요.' : error.message) : saved()));
  };
  const row = (tid, sid) => db.scores.find((x) => x.test_id === tid && x.student_id === sid);
  const text = (tid, sid) => { const r = row(tid, sid); return r?.mark ?? (r?.score ?? ''); };
  const cls = (tid, sid) => {
    const r = row(tid, sid);
    if (r?.mark) return 'mk';
    if (r?.score === null || r?.score === undefined || r?.score === '') return '';
    return r.score >= 100 ? 'hi' : r.score < 90 ? 'lo' : '';
  };
  const avg = (tid) => {
    const a = db.scores.filter((x) => x.test_id === tid && !x.mark && x.score !== null && x.score !== undefined && x.score !== '').map((x) => +x.score);
    return a.length ? (a.reduce((p, c) => p + c, 0) / a.length).toFixed(2) : '';
  };
  // 점수 칸에는 숫자 말고 글자(결석, 미응시, 우수 …)도 넣을 수 있다. 숫자가 아니면 글자 표시로 저장한다.
  const okScore = () => true;
  const save = (test_id, student_id, raw) => {
    const v = raw.trim();
    if (!okScore(v)) { alert('점수는 숫자 또는 「결석」만 입력할 수 있습니다.'); return false; }
    const num = v !== '' && !Number.isNaN(+v);
    const score = num ? +v : null, mark = v === '' || num ? null : v;
    if (String(text(test_id, student_id)) === v) return true;
    setDb((d) => ({ ...d, scores: [...d.scores.filter((x) => !(x.test_id === test_id && x.student_id === student_id)), { ...(row(test_id, student_id) ?? {}), test_id, student_id, score, mark }] }));
    sb.from('scores').upsert({ test_id, student_id, score, mark }).then(({ error }) => (error ? alert(error.message) : saved()));
    return true;
  };
  // 번호가 1~15번, 50번~처럼 크게(10 이상) 건너뛰면 그 사이에 빈 줄을 하나 둔다(샘플의 기록부처럼 한 표에서 묶음만 나눔)
  const ordered = [...S].sort((a, b) => (a.num ?? 1e9) - (b.num ?? 1e9));
  let cut = -1, gap = 0;
  ordered.forEach((st, i) => { const g = i ? (st.num ?? 0) - (ordered[i - 1].num ?? 0) : 0; if (g >= 10 && g > gap) { gap = g; cut = i; } });
  // 엑셀/CSV 올리기: 시트 하나 = 과목 하나. 각 시트의 첫 줄 = 번호·이름·평가명들(평가 열 바로 오른쪽에 '비고' 열을 두면 그 평가의 비고), 아래 = 학생별 점수(숫자 또는 결석 같은 글자)
  const NL = String.fromCharCode(10);
  const importScores = async (file) => {
    if (!file) return;
    const sheets = (await readSheets(file)).map((sh) => {
      const hi = sh.rows.findIndex((r) => r.some((c) => c === '번호' || c === '이름'));
      return { ...sh, hi };
    });
    const usable = sheets.filter((sh) => sh.hi >= 0);
    if (!usable.length) return alert('"번호"와 "이름" 머리글이 있는 시트가 없습니다. 첫 줄에 번호, 이름, 평가 이름(예: 1급)을 적어 주세요.');
    const skipped = sheets.filter((sh) => sh.hi < 0).map((sh) => sh.sheet);
    const names = usable.map((sh) => sh.sheet);
    if (!confirm(['다음 ' + names.length + '개 시트를 과목으로 올립니다. (시트 이름 = 과목 이름)', '', names.join(', '), skipped.length ? '건너뛰는 시트(머리글 없음): ' + skipped.join(', ') : ''].filter((x, i) => i < 3 || x).join(NL))) return;
    // 평가 본 날짜를 직접 입력 (비워 두거나 형식이 틀리면 오늘 날짜). 예: 2026-10-13
    const askDate = (prompt('평가를 본 날짜를 입력하세요. (예: 2026-10-13)' + NL + '비워 두면 오늘 날짜로 저장합니다.', today()) ?? null);
    if (askDate === null) return;
    const typed = askDate.trim();
    const date = typed.length === 10 && !Number.isNaN(new Date(typed + 'T00:00:00').getTime()) ? typed : today();
    if (typed && typed !== date) alert('날짜 형식이 맞지 않아 오늘 날짜(' + date + ')로 저장합니다.');
    const byNum = Object.fromEntries(S.map((x, i) => [numOf(x, i), x]));
    const byName = Object.fromEntries(S.map((x) => [x.name, x]));
    const report = [];
    for (const sh of usable) {
      const head = sh.rows[sh.hi];
      const ci = head.findIndex((c) => c.includes('번호')), cn = head.findIndex((c) => c.includes('이름'));
      const body = sh.rows.slice(sh.hi + 1);
      const isNote = (h) => String(h ?? '').trim() === '비고';
      const noteCols = new Set(head.map((h, i) => (isNote(h) ? i : -1)).filter((i) => i >= 0));
      const noteOf = (i) => (noteCols.has(i + 1) ? i + 1 : -1); // 평가 열 바로 오른쪽 '비고' 열
      const cols = head.map((h, i) => ({ h, i, ni: noteOf(i) })).filter(({ h, i, ni }) => h && i !== ci && i !== cn && !noteCols.has(i) && body.some((rw) => (rw[i] ?? '').trim() !== '' || (ni >= 0 && (rw[ni] ?? '').trim() !== '')));
      const withNotes = cols.some((c) => c.ni >= 0);
      if (!cols.length) { report.push(sh.sheet + ': 평가 열 없음'); continue; }
      const ids = {};
      for (const { h } of cols) {
        let t = db.tests.find((x) => x.subject === sh.sheet && x.name === h);
        if (t && t.date !== date) { const u = await sb.from('tests').update({ date }).eq('id', t.id); if (u.error) return alert(u.error.message); }
        if (!t) {
          const res = await sb.from('tests').insert({ subject: sh.sheet, name: h, date }).select().single();
          if (res.error) return alert(res.error.message);
          t = res.data;
        }
        ids[h] = t.id;
      }
      const out = []; let miss = 0, bad = 0;
      sh.rows.slice(sh.hi + 1).forEach((r) => {
        const st = (ci >= 0 && byNum[+r[ci]]) || (cn >= 0 && byName[r[cn]]);
        if (!st) { if (r.some(Boolean)) miss++; return; }
        cols.forEach(({ h, i, ni }) => {
          const v = (r[i] ?? '').trim();
          const nv = ni >= 0 ? (r[ni] ?? '').trim() : '';
          if (v === '' && nv === '') return;
          if (!okScore(v)) { bad++; return; }
          const ex = db.scores.find((x) => x.test_id === ids[h] && x.student_id === st.id);
          const num = v !== '' && !Number.isNaN(+v);
          const row = v === '' ? { score: ex?.score ?? null, mark: ex?.mark ?? null } : { score: num ? +v : null, mark: num ? null : v };
          // 비고 열이 있는 파일일 때만 note 를 함께 저장한다(없는 파일은 기존 비고를 건드리지 않는다)
          out.push({ test_id: ids[h], student_id: st.id, ...row, ...(withNotes ? { note: ni >= 0 && nv !== '' ? nv : ex?.note ?? null } : {}) });
        });
      });
      if (out.length) { const res = await sb.from('scores').upsert(out); if (res.error) return alert(res.error.message); }
      report.push(sh.sheet + ': 평가 ' + cols.length + '개, 점수 ' + out.length + '개' + (miss ? ' (학생 못 찾음 ' + miss + '줄)' : '') + (bad ? ' (건너뜀 ' + bad + '칸)' : ''));
    }
    await load(); saved(); setSub(usable[0].sheet);
    alert(['저장했습니다.', '', ...report].join(NL));
  };
  // 양식 받기: 우리 반 학생(번호·이름)이 미리 들어 있고, 있는 점수도 함께 담긴 엑셀. 채워서 다시 올리면 된다
  const downloadTemplate = async () => {
    if (!S.length) return alert('먼저 학급명렬에서 학생을 등록하세요. 양식에 우리 반 학생이 미리 들어갑니다.');
    const { default: writeXlsxFile } = await import('write-excel-file/browser');
    const subs = subjects.length ? subjects : ['받아쓰기'];
    const head = (v) => ({ value: v, fontWeight: 'bold', backgroundColor: '#eef0f7', align: 'center' });
    const sheets = subs.map((sj) => {
      const ts = db.tests.filter((t) => t.subject === sj).sort((a, b) => tDate(a).localeCompare(tDate(b)));
      const spare = ts.length ? 2 : 3;
      const heads = [...ts.map((t) => t.name), ...Array.from({ length: spare }, (_, i) => (ts.length ? '' : '평가' + (i + 1)))];
      // 평가 열마다 바로 오른쪽에 '비고' 열을 둔다
      const data = [[head('번호'), head('이름'), ...heads.flatMap((h) => [head(h), head('비고')])]];
      ordered.forEach((st) => {
        data.push([{ value: numOf(st, S.indexOf(st)), align: 'center' }, { value: st.name, align: 'center' },
          ...heads.flatMap((_, i) => {
            const t = ts[i]; const v = t ? text(t.id, st.id) : ''; const n = t ? note(t.id, st.id) : '';
            return [v === '' ? null : { value: v, align: 'center' }, n === '' ? null : { value: n }];
          })]);
      });
      return { data, sheet: sj.slice(0, 28), columns: [{ width: 8 }, { width: 14 }, ...heads.flatMap(() => [{ width: 11 }, { width: 16 }])] };
    });
    await writeXlsxFile(sheets).toFile('우리반_성적양식.xlsx');
  };
  const csv = () => {
    // 비고가 있는 평가는 바로 오른쪽에 '비고' 열을 붙인다 (올리기와 같은 모양)
    const hasN = (t) => S.some((s) => note(t.id, s.id));
    const rows = [['번호', '이름', ...tests.flatMap((t) => (hasN(t) ? [`${t.name} ${t.date ?? ''}`, '비고'] : [`${t.name} ${t.date ?? ''}`]))],
      ...S.map((s, i) => [numOf(s, i), s.name, ...tests.flatMap((t) => (hasN(t) ? [text(t.id, s.id), note(t.id, s.id)] : [text(t.id, s.id)]))]),
      ['', '평균', ...tests.flatMap((t) => (hasN(t) ? [avg(t.id), ''] : [avg(t.id)]))]];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join(String.fromCharCode(10))]));
    a.download = (cur || '성적') + '.csv'; a.click();
  };
  return (
    <>
      <div className="numtabs sheets">
        {subjects.map((n) => (n === cur && editSub
          ? <input key={n} autoFocus className="subedit" defaultValue={n} onFocus={(e) => e.target.select()}
              onBlur={(e) => (e.target.dataset.skip ? setEditSub(false) : renameSubject(e.target.value))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.target.dataset.skip = '1'; renameSubject(e.target.value); } if (e.key === 'Escape') { e.target.dataset.skip = '1'; setEditSub(false); } }} />
          : <button key={n} className={n === cur ? 'on' : ''} title={n === cur ? '한 번 더 누르면 과목 이름을 고칠 수 있습니다' : ''} onClick={() => (n === cur ? setEditSub(true) : setSub(n))}>{n}{n === cur && <Pencil size={11} style={{ marginLeft: 6, opacity: 0.75 }} />}</button>))}
        <button type="button" className="subjbtn" onClick={addSubject}>과목 추가</button>
        {subjects.length === 0 && <span style={{ padding: '6px 4px', color: 'var(--mute)' }}>「+ 과목 추가」를 눌러 과목을 만드세요 (예: 받아쓰기, 수학)</span>}
      </div>
      <form className="gradeform" onSubmit={(e) => {
        const d = fd(e);
        const f = e.target;
        if (!d.subject?.trim()) { alert('과목 이름을 입력하세요. (예: 받아쓰기)'); f.elements.subject.focus(); return; }
        if (!d.name?.trim()) { alert('평가 이름을 입력하세요. (예: 1급, 단원평가1)'); f.elements.name.focus(); return; }
        add('tests', { subject: d.subject.trim(), name: d.name.trim(), date: d.date || null });
        setSub(d.subject.trim());
        f.elements.name.value = '';
      }}>
        <div className="gfields">
        <input name="subject" list="gsubs" placeholder="과목 (예: 받아쓰기)" defaultValue={cur} key={cur} size="12" />
        <datalist id="gsubs">{subjects.map((n) => <option key={n} value={n} />)}</datalist>
        <input name="name" placeholder="평가명 (예: 1급)" size="12" />
        <input type="date" name="date" key={newDate} defaultValue={newDate} />
        </div>
        <div className="gbtns">
        <button className="evalbtn">평가(열) 추가</button>
        </div>
      </form>
      <div className="toolbar">
        <label className="btn primary"><Upload size={16} /> 성적 파일 올리기<input type="file" accept=".xlsx,.csv" onChange={(e) => { importScores(e.target.files[0]); e.target.value = ''; }} /></label>
        <button type="button" className="btn" onClick={downloadTemplate}><Download size={16} /> 성적 양식 받기 (우리 반 학생 포함)</button>
        <button type="button" className="btn" onClick={csv}><Download size={16} /> 이 과목 내보내기(CSV)</button>
        <span className="hint">양식에 점수를 채워 다시 올리거나, 아래 표에서 바로 입력하세요. 점수는 숫자, 결석·미응시 같은 글자도 가능 / 올릴 때 평가 날짜를 입력합니다</span>
      </div>
      {S.length === 0 ? <p>먼저 학급명렬에서 학생을 추가하세요.</p> : (
        <>
        {!db.tests.some((t) => t.subject === cur) ? <p style={{ color: 'var(--mute)' }}>「{cur}」 과목을 만들었습니다. 위쪽에서 <b>평가 이름</b>을 쓰고 <b>평가(열) 추가</b>를 누르면 이 표에 열이 생깁니다.</p> : null}
        <div className="gradewrap">
          <table className="grades"><tbody>
            <tr><th style={{ width: 54 }}>번호</th><th style={{ width: 90 }}>이름</th>
              {tests.map((t) => <th key={t.id}>
                <textarea className="hname" rows="1" key={t.name} defaultValue={t.name} title="평가 이름 (눌러서 수정)" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== t.name && upd('tests', t.id, { name: e.target.value.trim() })} />
                <input type="date" className="hdate" key={t.date ?? ''} defaultValue={t.date ?? ''} title="평가 날짜 (눌러서 수정)" onBlur={(e) => e.target.value !== (t.date ?? '') && upd('tests', t.id, { date: e.target.value || null })} /><button className="tdel" title="이 평가(열) 삭제 — 점수도 함께 지워집니다" onClick={() => del('tests', t.id, `${cur} 「${t.name}」 평가(열)를 삭제할까요?` + NLX + '모든 학생의 이 평가 점수가 함께 지워집니다.')}><Trash2 size={13} /></button></th>)}
            </tr>
            {ordered.map((s, i) => (
              <Fragment key={s.id}>
                {i === cut && i > 0 && <tr className="gaprow"><td colSpan={2 + tests.length} /></tr>}
                <tr className={selRow === s.id ? 'rowsel' : ''} onClick={() => setSelRow(s.id)}><td className="c">{numOf(s, S.indexOf(s))}</td><td className="c">{s.name}</td>
                  {tests.map((t) => {
                    const nt = note(t.id, s.id);
                    return (
                      <td key={t.id} className={`c scell ${nt ? 'hasnote' : ''}`} title={nt ? '비고: ' + nt : undefined}>
                        <input className={cls(t.id, s.id)} key={String(text(t.id, s.id))} defaultValue={text(t.id, s.id)} onBlur={(e) => { if (!save(t.id, s.id, e.target.value)) e.target.value = String(text(t.id, s.id)); }} />
                        <button type="button" className="notebtn" title={nt ? '비고 보기·고치기' : '비고 쓰기'} onClick={(e) => { const b = e.currentTarget.getBoundingClientRect(); setNotePop({ tid: t.id, sid: s.id, x: Math.min(b.left, window.innerWidth - 270), y: b.bottom + 4 }); }}><StickyNote size={12} strokeWidth={2.4} /></button>
                      </td>
                    );
                  })}
                </tr>
              </Fragment>
            ))}
            <tr className="avgrow"><td className="c" colSpan="2">전체평균</td>{tests.map((t) => <td key={t.id} className="c">{avg(t.id)}</td>)}</tr>
          </tbody></table>
        </div>
        {notePop && (
          <div className="notepop" style={{ left: Math.max(8, notePop.x), top: notePop.y }}>
            <div className="notepopt">{S.find((x) => x.id === notePop.sid)?.name} · {db.tests.find((x) => x.id === notePop.tid)?.name} 비고</div>
            <textarea autoFocus rows="3" defaultValue={note(notePop.tid, notePop.sid)} placeholder="예: 지각, 재시험 예정" id="notetxt"
              onKeyDown={(e) => { if (e.key === 'Escape') setNotePop(null); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveNote(notePop.tid, notePop.sid, e.target.value); setNotePop(null); } }} />
            <div className="notepopb">
              <button type="button" onClick={() => setNotePop(null)}>닫기</button>
              {note(notePop.tid, notePop.sid) && <button type="button" className="danger" onClick={() => { saveNote(notePop.tid, notePop.sid, ''); setNotePop(null); }}>지우기</button>}
              <button type="button" className="primary" onClick={() => { saveNote(notePop.tid, notePop.sid, document.getElementById('notetxt').value); setNotePop(null); }}>저장</button>
            </div>
          </div>
        )}
        </>
      )}
    </>
  );
}


/* 간단한 꺾은선 그래프(SVG): series[].pts 는 평가 순서대로의 값(없으면 null). invert면 작은 값이 위(등수) */
function LineChart({ labels, series, min, max, invert, unit = '' }) {
  const W = 620, H = 170, pl = 38, pr = 14, pt = 18, pb = 34;
  const n = labels.length;
  const X = (i) => (n > 1 ? pl + (i * (W - pl - pr)) / (n - 1) : (pl + W - pr) / 2);
  const Y = (val) => { const k = (val - min) / (max - min || 1); return pt + (invert ? k : 1 - k) * (H - pt - pb); };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="linechart" role="img">
      {[min, max].map((t) => <g key={t}><line x1={pl} x2={W - pr} y1={Y(t)} y2={Y(t)} stroke="#e3e5ef" /><text x={pl - 6} y={Y(t) + 4} textAnchor="end" fontSize="11" fill="#8a8da3">{t}{unit}</text></g>)}
      {labels.map((l, i) => <text key={i} x={X(i)} y={H - 12} textAnchor="middle" fontSize="11" fill="#8a8da3">{l.length > 6 ? l.slice(0, 6) + '…' : l}</text>)}
      {series.map((s, si) => {
        const segs = []; let cur = [];
        s.pts.forEach((val, i) => { if (val === null || val === undefined) { if (cur.length) segs.push(cur); cur = []; } else cur.push([X(i), Y(val)]); });
        if (cur.length) segs.push(cur);
        return (
          <g key={si}>
            {segs.map((sg, k) => sg.length > 1 && <polyline key={k} points={sg.map((q) => q.join(',')).join(' ')} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? '5 4' : undefined} />)}
            {!s.dashed && s.pts.map((val, i) => val !== null && val !== undefined && <g key={i}><circle cx={X(i)} cy={Y(val)} r="4" fill={s.color} /><text x={X(i)} y={Y(val) - 9} textAnchor="middle" fontSize="11" fill="#444">{Math.round(val * 10) / 10}{unit}</text></g>)}
          </g>
        );
      })}
    </svg>
  );
}

/* 지난기록: 새 학년도를 시작할 때 보관해 둔 이전 학급의 명단·성적·상담·체크리스트·시간표 (읽기 전용) */
export function Archive({ db, load }) {
  const list = [...(db.archives ?? [])].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  const [sel, setSel] = useState(null);
  const [part, setPart] = useState('grades');
  const [sub, setSub] = useState('');
  const [who, setWho] = useState('');
  const [q, setQ] = useState(''); // 전체 학년도 학생 검색
  const cur = list.find((a) => a.id === sel) ?? list[0];
  const d = cur?.data ?? {};
  const stu = [...(d.students ?? [])].sort((a, b) => (a.num ?? 1e9) - (b.num ?? 1e9));
  const nm = (id) => stu.find((s) => s.id === id);
  const subs = [...new Set((d.tests ?? []).map((t) => t.subject).filter(Boolean))];
  const subCur = subs.includes(sub) ? sub : subs[0] ?? '';
  const tests = (d.tests ?? []).filter((t) => t.subject === subCur).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const sc = Object.fromEntries((d.scores ?? []).map((x) => [x.test_id + '|' + x.student_id, x]));
  const show = (r) => (r ? r.mark ?? (r.score ?? '') : '');
  const avg = (t) => { const a = stu.map((s) => sc[t.id + '|' + s.id]).filter((r) => r && !r.mark && r.score !== null && r.score !== undefined).map((r) => +r.score); return a.length ? (a.reduce((p, c) => p + c, 0) / a.length).toFixed(2) : ''; };
  const rename = async (label) => { if (label.trim() && label.trim() !== cur.label) { const { error } = await sb.from('archives').update({ label: label.trim() }).eq('id', cur.id); if (error) alert(error.message); else { saved(); load(); } } };
  const remove = async () => {
    if (!confirm(`「${cur.label}」 보관 기록을 완전히 삭제할까요?` + String.fromCharCode(10) + '되돌릴 수 없습니다.')) return;
    const { error } = await sb.from('archives').delete().eq('id', cur.id);
    if (error) return alert(error.message);
    setSel(null); saved(); load();
  };
  if (!list.length) return <p style={{ color: 'var(--mute)' }}>아직 보관된 지난 기록이 없습니다. <b>학급명렬</b>의 <b>새 학년도 시작</b>을 누르면 그때까지의 명단·성적·상담·체크리스트·시간표가 여기에 보관됩니다.</p>;
  const key = q.trim();
  const found = key ? list.flatMap((a) => (a.data?.students ?? []).filter((s) => (s.name ?? '').includes(key)).map((s) => ({ a, s }))) : [];
  const notes = [...(d.notes ?? [])].filter((n) => !who || nm(n.student_id)?.name?.includes(who)).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return (
    <>
      <div className="archsearch">
        <input placeholder="학생 이름으로 모든 학년도 기록 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        {key && <button type="button" onClick={() => setQ('')}>검색 지우기</button>}
      </div>
      {key ? (
        found.length === 0 ? <p className="hint">「{key}」 이름의 학생이 보관된 기록에 없습니다.</p> : found.map(({ a, s }) => {
          const D = a.data ?? {};
          const tsc = Object.fromEntries((D.scores ?? []).filter((x) => x.student_id === s.id).map((x) => [x.test_id, x]));
          const mine = (D.tests ?? []).filter((t) => tsc[t.id]).sort((x, y) => (x.subject ?? '').localeCompare(y.subject ?? '') || (x.date ?? '').localeCompare(y.date ?? ''));
          const sn = (D.notes ?? []).filter((n) => n.student_id === s.id).sort((x, y) => (y.date ?? '').localeCompare(x.date ?? ''));
          const ck = (D.checklists ?? []).filter((c) => (D.checks ?? []).some((k) => k.checklist_id === c.id && k.student_id === s.id));
          return (
            <div key={a.id + s.id} className="archcard">
              <h3>{a.label} · {s.num ?? ''}번 {s.name}</h3>
              <p className="hint">{[s.phone && '학생 ' + s.phone, s.parent_phone && '학부모1 ' + s.parent_phone, s.parent_phone2 && '학부모2 ' + s.parent_phone2].filter(Boolean).join(' · ')}</p>
              {mine.length > 0 && (
                <div className="gradewrap"><table className="stattable"><tbody>
                  <tr><th>과목</th><th>평가</th><th>날짜</th><th>점수</th><th>비고</th></tr>
                  {mine.map((t) => { const r = tsc[t.id]; return <tr key={t.id}><td className="c">{t.subject}</td><td className="c">{t.name}</td><td className="c">{(t.date ?? '').slice(5).replace('-', '/')}</td><td className="c">{r.mark ?? (r.score ?? '')}</td><td className="notecell">{r.note ?? ''}</td></tr>; })}
                </tbody></table></div>
              )}
              {sn.length > 0 && (
                <div className="gradewrap"><table className="stattable"><tbody>
                  <tr><th>상담 날짜</th><th>대상</th><th>방법</th><th>내용</th></tr>
                  {sn.map((n, i) => <tr key={i}><td className="c">{n.date}</td><td className="c">{n.target}</td><td className="c">{n.method}</td><td className="notecell" style={{ whiteSpace: 'pre-wrap' }}>{n.text}</td></tr>)}
                </tbody></table></div>
              )}
              {ck.length > 0 && <p className="hint">체크리스트에 체크된 항목: {ck.map((c) => `${c.title || '체크리스트'}(${c.date})`).join(', ')}</p>}
              {!mine.length && !sn.length && !ck.length && <p className="hint">보관된 성적·상담·체크 기록이 없습니다.</p>}
            </div>
          );
        })
      ) : <>
      <div className="numtabs sheets">
        {list.map((a) => <button key={a.id} className={a.id === cur.id ? 'on' : ''} onClick={() => { setSel(a.id); setSub(''); }}>{a.label}</button>)}
      </div>
      <div className="archbar">
        <input key={cur.id + cur.label} defaultValue={cur.label} title="이름 고치기" onBlur={(e) => rename(e.target.value)} />
        <span className="hint">{(cur.created_at ?? '').slice(0, 10)} 보관 · 학생 {stu.length}명 · 읽기 전용</span>
        <button type="button" className="danger" onClick={remove}>이 보관 기록 삭제</button>
      </div>
      <div className="numtabs months">
        {[['grades', '성적'], ['roster', '명단'], ['notes', '상담기록'], ['checks', '체크리스트'], ['tt', '시간표']].map(([k, n]) => <button key={k} className={k === part ? 'on' : ''} onClick={() => setPart(k)}>{n}</button>)}
      </div>

      {part === 'roster' && (
        <div className="gradewrap"><table className="stattable"><tbody>
          <tr><th>번호</th><th>이름</th><th>학생 연락처</th><th>학부모 연락처1</th><th>학부모 연락처2</th></tr>
          {stu.map((s) => <tr key={s.id}><td className="c">{s.num ?? ''}</td><td className="c">{s.name}</td><td className="c">{s.phone}</td><td className="c">{s.parent_phone}</td><td className="c">{s.parent_phone2}</td></tr>)}
        </tbody></table></div>
      )}

      {part === 'grades' && (subs.length === 0 ? <p className="hint">보관된 성적이 없습니다.</p> : (
        <>
          <div className="numtabs sheets">{subs.map((n) => <button key={n} className={n === subCur ? 'on' : ''} onClick={() => setSub(n)}>{n}</button>)}</div>
          <div className="gradewrap"><table className="stattable"><tbody>
            <tr><th>번호</th><th>이름</th>{tests.map((t) => <th key={t.id}>{t.name}<br /><small>{(t.date ?? '').slice(5).replace('-', '/')}</small></th>)}</tr>
            {stu.map((s) => (
              <tr key={s.id}><td className="c">{s.num ?? ''}</td><td className="c">{s.name}</td>
                {tests.map((t) => { const r = sc[t.id + '|' + s.id]; return <td key={t.id} className="c" title={r?.note ? '비고: ' + r.note : undefined}>{show(r)}{r?.note ? <sup title={r.note}> ●</sup> : null}</td>; })}
              </tr>
            ))}
            <tr className="avgrow"><td className="c" colSpan="2">전체평균</td>{tests.map((t) => <td key={t.id} className="c">{avg(t)}</td>)}</tr>
          </tbody></table></div>
          <p className="hint">● 표시가 있는 칸은 비고가 있습니다(마우스를 올리면 보입니다).</p>
        </>
      ))}

      {part === 'notes' && (
        <>
          <p><input placeholder="학생 이름 검색" value={who} onChange={(e) => setWho(e.target.value)} /></p>
          {notes.length === 0 ? <p className="hint">보관된 상담기록이 없습니다.</p> : (
            <div className="gradewrap"><table className="stattable"><tbody>
              <tr><th>날짜</th><th>학생</th><th>대상</th><th>방법</th><th>내용</th></tr>
              {notes.map((n, i) => <tr key={i}><td className="c">{n.date}</td><td className="c">{nm(n.student_id)?.name}</td><td className="c">{n.target}</td><td className="c">{n.method}</td><td className="notecell" style={{ whiteSpace: 'pre-wrap' }}>{n.text}</td></tr>)}
            </tbody></table></div>
          )}
        </>
      )}

      {part === 'checks' && ((d.checklists ?? []).length === 0 ? <p className="hint">보관된 체크리스트가 없습니다.</p> : (
        <div className="gradewrap"><table className="stattable"><tbody>
          <tr><th style={{ width: 90 }}>날짜</th><th style={{ width: 200 }}>제목</th><th>체크한 학생</th></tr>
          {[...(d.checklists ?? [])].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')).map((c) => {
            const names = (d.checks ?? []).filter((k) => k.checklist_id === c.id).map((k) => nm(k.student_id)).filter(Boolean).sort((a, b) => (a.num ?? 1e9) - (b.num ?? 1e9));
            return <tr key={c.id}><td className="c">{c.date}</td><td className="c">{c.title}</td><td className="notecell">{names.map((s) => `${s.num ?? ''} ${s.name}`).join(', ')} <small style={{ color: 'var(--mute)' }}>({names.length}/{stu.length})</small></td></tr>;
          })}
        </tbody></table></div>
      ))}

      {part === 'tt' && (
        <div className="gradewrap"><table className="stattable"><tbody>
          <tr><th style={{ width: 54 }}>교시</th>{['월', '화', '수', '목', '금'].map((x) => <th key={x}>{x}</th>)}</tr>
          {[1, 2, 3, 4, 5, 6].map((pe) => <tr key={pe}><td className="c">{pe}</td>{[1, 2, 3, 4, 5].map((dy) => <td key={dy} className="c">{(d.timetable ?? []).find((t) => t.day === dy && t.period === pe)?.text ?? ''}</td>)}</tr>)}
        </tbody></table></div>
      )}
      </>}
    </>
  );
}

/* 성적 통계: 과목 + 월(또는 전체)을 골라 자동으로 집계. 평균·분포·학생별 점수와 등수 */
export function Stats({ db, S }) {
  const subjects = [...new Set(db.tests.map((t) => t.subject).filter(Boolean))];
  const [sub, setSub] = useState('');
  const cur = subjects.includes(sub) ? sub : subjects[0] ?? '';
  const now = new Date();
  const sy = now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear();
  const MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2];
  const mo = 'all'; // 월 탭은 없애고 과목별 전체를 본다
  // 확인이 필요한 학생 기준 점수(이 브라우저에 기억)
  const [thr, setThr] = useState(() => { try { const x = +localStorage.getItem('thr'); return x > 0 ? x : 80; } catch { return 80; } });
  const setThrSave = (n) => { setThr(n); try { localStorage.setItem('thr', String(n)); } catch {} };
  const [pid, setPid] = useState('');
  const [mode, setMode] = useState('class'); // 'class' 학급 통계 | 'person' 개인별 통계
  const [order, setOrder] = useState('num');
  const monthKey = (m) => `${m >= 3 ? sy : sy + 1}-${String(m).padStart(2, '0')}`;
  const tDate = (t) => t.date ?? t.created_at?.slice(0, 10) ?? '';
  const mine = db.tests.filter((t) => t.subject === cur);
  const tests = mine.filter((t) => mo === 'all' || tDate(t).startsWith(monthKey(mo))).sort((a, b) => tDate(a).localeCompare(tDate(b)));
  const sc = Object.fromEntries(db.scores.map((x) => [x.test_id + '|' + x.student_id, x]));
  const isNum = (r) => r && !r.mark && r.score !== null && r.score !== undefined && r.score !== '';
  const f2 = (n) => (n === null || n === undefined ? '-' : (Math.round(n * 100) / 100).toFixed(2));
  const f0 = (n) => (n === null || n === undefined ? '-' : String(Math.round(n * 10) / 10));
  const avgOf = (a) => (a.length ? a.reduce((p, c) => p + c, 0) / a.length : null);
  const median = (a) => { if (!a.length) return null; const z = [...a].sort((x, y) => x - y); const n = z.length; return n % 2 ? z[(n - 1) / 2] : (z[n / 2 - 1] + z[n / 2]) / 2; };
  // 등수: 높은 점수가 1위, 같은 점수는 공동 등수(1, 2, 2, 4 …)
  const rankMap = (pairs) => {
    const z = [...pairs].sort((a, b) => b.v - a.v);
    const m = {};
    z.forEach((x, i) => { m[x.id] = i > 0 && z[i - 1].v === x.v ? m[z[i - 1].id] : i + 1; });
    return m;
  };

  // 평가(열)별 집계
  const per = tests.map((t) => {
    const nums = [];
    let abs = 0;
    S.forEach((st) => { const r = sc[t.id + '|' + st.id]; if (isNum(r)) nums.push(+r.score); else if (r?.mark && String(r.mark).includes('결석')) abs++; });
    const bins = [nums.filter((x) => x >= 100).length, nums.filter((x) => x >= 90 && x < 100).length, nums.filter((x) => x >= 80 && x < 90).length, nums.filter((x) => x >= 70 && x < 80).length, nums.filter((x) => x < 70).length];
    const rk = rankMap(S.filter((st) => isNum(sc[t.id + '|' + st.id])).map((st) => ({ id: st.id, v: +sc[t.id + '|' + st.id].score })));
    const wc = {};
    S.forEach((st) => { const m = String(sc[t.id + '|' + st.id]?.mark ?? '').trim(); if (m && !m.includes('결석')) wc[m] = (wc[m] ?? 0) + 1; });
    const words = Object.entries(wc).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return { t, nums, abs, rk, words, avg: avgOf(nums), max: nums.length ? Math.max(...nums) : null, min: nums.length ? Math.min(...nums) : null, med: median(nums), bins };
  });
  const all = per.flatMap((x) => x.nums);
  const absAll = per.reduce((p, c) => p + c.abs, 0);
  const BIN = [['100점 이상', '#d4301f'], ['90~99', '#e8a24a'], ['80~89', '#8fcf9a'], ['70~79', '#7fb2ea'], ['70 미만', '#8c8cd8']];

  // 학생별 집계
  const stu = S.map((st, i) => {
    const vals = tests.map((t) => sc[t.id + '|' + st.id]).filter(isNum).map((r) => +r.score);
    const abs = tests.filter((t) => { const r = sc[t.id + '|' + st.id]; return r?.mark && String(r.mark).includes('결석'); }).length;
    const last = vals.length ? vals[vals.length - 1] : null;
    const before = avgOf(vals.slice(0, -1));
    return { st, n: numOf(st, i), avg: avgOf(vals), cnt: vals.length, abs, last, delta: vals.length > 1 ? last - before : null };
  });
  const ranked = stu.filter((x) => x.avg !== null);
  const rankAvg = rankMap(ranked.map((x) => ({ id: x.st.id, v: Math.round(x.avg * 100) / 100 })));
  const rows = [...stu].sort((a, b) => (order === 'rank' ? (rankAvg[a.st.id] ?? 1e9) - (rankAvg[b.st.id] ?? 1e9) || a.n - b.n : a.n - b.n));
  const need = ranked.filter((x) => x.avg < thr);
  const top = [...ranked].sort((a, b) => rankAvg[a.st.id] - rankAvg[b.st.id] || a.n - b.n).slice(0, 3);
  const classAvg = avgOf(ranked.map((x) => x.avg));

  // 월별 평균 추이 (전체 보기에서만)
  const trend = MONTHS.map((m) => {
    const ts = mine.filter((t) => tDate(t).startsWith(monthKey(m)));
    const v = ts.flatMap((t) => S.map((st) => sc[t.id + '|' + st.id]).filter(isNum).map((r) => +r.score));
    return { m, avg: avgOf(v), cnt: ts.length };
  }).filter((x) => x.avg !== null);
  const trendMax = Math.max(100, ...trend.map((x) => x.avg));

  if (!subjects.length) return <p style={{ color: 'var(--mute)' }}>아직 성적이 없습니다. <b>성적</b> 화면에서 평가를 추가하거나 파일을 올리면 여기에 자동으로 집계됩니다.</p>;
  return (
    <>
      <div className="statmode">
        <button className={mode === 'class' ? 'on' : ''} onClick={() => setMode('class')}>학급 통계</button>
        <button className={mode === 'person' ? 'on' : ''} onClick={() => setMode('person')}>개인별 통계</button>
      </div>
      <div className="numtabs sheets">
        {subjects.map((n) => <button key={n} className={n === cur ? 'on' : ''} onClick={() => setSub(n)}>{n}</button>)}
      </div>

      {tests.length === 0 ? <p style={{ color: 'var(--mute)' }}>「{cur}」 평가가 없습니다. 다른 과목을 눌러 보세요.</p> : (
        <>
          {mode === 'class' && <>
          <div className="statcards">
            <div><small>평가</small><b>{tests.length}개</b></div>
            <div><small>전체 평균 (점수 기준)</small><b>{f2(avgOf(all))}</b></div>
            <div><small>학생 평균의 평균</small><b>{f2(classAvg)}</b></div>
            <div><small>최고 / 최저</small><b>{f0(all.length ? Math.max(...all) : null)} / {f0(all.length ? Math.min(...all) : null)}</b></div>
            <div><small>중앙값</small><b>{f0(median(all))}</b></div>
            <div><small>응시 점수</small><b>{all.length}개</b></div>
            <div><small>결석</small><b>{absAll}회</b></div>
          </div>

          <h3>평가별 통계</h3>
          <div className="gradewrap">
            <table className="stattable"><tbody>
              <tr><th>평가</th><th>날짜</th><th>응시</th><th>평균</th><th>최고</th><th>최저</th><th>중앙값</th><th>결석</th><th style={{ width: '34%' }}>점수 분포 · 글자 평가</th></tr>
              {per.map((x) => (
                <tr key={x.t.id}>
                  <td className="c"><b>{x.t.name}</b></td><td className="c">{tDate(x.t).slice(5).replace('-', '/')}</td>
                  <td className="c">{x.nums.length + x.words.reduce((p, w) => p + w[1], 0)}명</td><td className="c"><b>{f2(x.avg)}</b></td><td className="c">{f0(x.max)}</td><td className="c">{f0(x.min)}</td><td className="c">{f0(x.med)}</td><td className="c">{x.abs || '-'}</td>
                  <td>
                    <div className="dist" title={BIN.map(([l], i) => l + ' ' + x.bins[i] + '명').join(' · ')}>
                      {x.bins.map((c, i) => c > 0 && <i key={i} style={{ flex: c, background: BIN[i][1] }}>{c}</i>)}
                    </div>
                    {x.words.length > 0 && <div className="wchips">{x.words.map(([w, c]) => <span key={w} className="wchip">{w} <b>{c}명</b></span>)}</div>}
                  </td>
                </tr>
              ))}
            </tbody></table>
          </div>
          <div className="legendline">{BIN.map(([l, c]) => <span key={l}><i style={{ background: c }} />{l}</span>)}</div>

          {mo === 'all' && trend.length > 1 && (
            <>
              <h3>월별 평균 추이</h3>
              <div className="trend">
                {trend.map((x) => (
                  <div key={x.m}><span className="val">{f0(x.avg)}</span><i style={{ height: Math.round((x.avg / trendMax) * 110) + 'px' }} /><span className="lab">{x.m}월<small>{x.cnt}회</small></span></div>
                ))}
              </div>
            </>
          )}

          <div className="two">
            <div>
              <h3>평균 상위 3명</h3>
              <div className="chips">{top.length ? top.map((x) => <span key={x.st.id} className="chip good">{rankAvg[x.st.id]}위 · {x.n}번 {x.st.name} · {f2(x.avg)}</span>) : <span className="hint">점수가 없습니다</span>}</div>
            </div>
          </div>

          <h3>확인이 필요한 학생 (평균 <input type="number" min="0" max="100" className="thrin" value={thr} onChange={(e) => setThrSave(+e.target.value || 0)} /> 미만) <small style={{ color: 'var(--mute)', fontWeight: 400 }}>— 기준 점수를 바꾸면 바로 바뀝니다</small></h3>
          {need.length ? (
            <div className="gradewrap">
              <table className="stattable"><tbody>
                <tr><th style={{ width: 46 }}>번호</th><th style={{ width: 80 }}>이름</th><th>평균</th>{per.map((x) => <th key={x.t.id}>{x.t.name}<br /><small>{tDate(x.t).slice(5).replace('-', '/')}</small></th>)}</tr>
                {[...need].sort((a, b) => a.avg - b.avg).map((x) => (
                  <tr key={x.st.id}>
                    <td className="c">{x.n}</td><td className="c">{x.st.name}</td><td className="c lo"><b>{f2(x.avg)}</b></td>
                    {per.map((p) => { const r0 = sc[p.t.id + '|' + x.st.id]; return <td key={p.t.id} className={`c ${isNum(r0) && +r0.score < thr ? 'lo' : ''}`}>{isNum(r0) ? f0(+r0.score) : r0?.mark || '-'}</td>; })}
                  </tr>
                ))}
              </tbody></table>
            </div>
          ) : <p className="hint">평균 {thr}점 미만인 학생이 없습니다.</p>}

          <h3>학생별 점수와 등수
            <span className="seg">
              <button className={order === 'num' ? 'on' : ''} onClick={() => setOrder('num')}>번호순</button>
              <button className={order === 'rank' ? 'on' : ''} onClick={() => setOrder('rank')}>등수순</button>
            </span>
          </h3>
          <p className="hint" style={{ margin: '0 0 6px' }}>칸의 작은 숫자는 그 평가의 등수입니다. 같은 점수는 공동 등수입니다. 결석한 평가는 등수에서 빠집니다.</p>
          <div className="gradewrap">
            <table className="stattable"><tbody>
              <tr><th style={{ width: 46 }}>번호</th><th style={{ width: 80 }}>이름</th>
                {per.map((x) => <th key={x.t.id}>{x.t.name}<br /><small>{tDate(x.t).slice(5).replace('-', '/')}</small></th>)}
                <th>평균</th><th>등수</th><th>직전 평균 대비</th><th>결석</th>
              </tr>
              {rows.map((x) => {
                const rk = rankAvg[x.st.id];
                return (
                  <tr key={x.st.id}>
                    <td className="c">{x.n}</td><td className="c">{x.st.name}</td>
                    {per.map((p) => {
                      const r = sc[p.t.id + '|' + x.st.id];
                      if (isNum(r)) return <td key={p.t.id} className={`c ${+r.score >= 100 ? 'hi' : +r.score < 90 ? 'lo' : ''}`}>{f0(+r.score)} <sup>{p.rk[x.st.id]}</sup></td>;
                      return <td key={p.t.id} className={`c ${r?.mark ? 'lo' : ''}`}>{r?.mark || '-'}</td>;
                    })}
                    <td className={`c ${x.avg !== null && x.avg < thr ? 'lo' : x.avg >= 100 ? 'hi' : ''}`}><b>{f2(x.avg)}</b></td>
                    <td className={`c rank ${rk && rk <= 3 ? 'top' : ''}`}>{rk ? rk + '위' : '-'}<small>{rk ? ' / ' + ranked.length : ''}</small></td>
                    <td className={`c ${x.delta > 0 ? 'hi' : x.delta < 0 ? 'lo' : ''}`}>{x.delta === null ? '-' : (x.delta > 0 ? '▲ ' : x.delta < 0 ? '▼ ' : '') + f0(Math.abs(x.delta))}</td>
                    <td className="c">{x.abs || '-'}</td>
                  </tr>
                );
              })}
            </tbody></table>
          </div>

          </>}

          {mode === 'person' && (() => {
            const me = S.find((s) => s.id === pid) ?? S[0];
            if (!me) return null;
            const mi = S.indexOf(me), my = stu[mi];
            const myRank = rankAvg[me.id];
            const diff = my.avg !== null && classAvg !== null ? my.avg - classAvg : null;
            // 모든 과목 요약
            const bySub = subjects.map((sj) => {
              const ts = db.tests.filter((t) => t.subject === sj);
              const avgFor = (st) => avgOf(ts.map((t) => sc[t.id + '|' + st.id]).filter(isNum).map((x) => +x.score));
              const mine2 = avgFor(me);
              const allAvg = S.map(avgFor).filter((a) => a !== null);
              const rm = rankMap(S.map((st) => ({ id: st.id, v: avgFor(st) })).filter((x) => x.v !== null).map((x) => ({ id: x.id, v: Math.round(x.v * 100) / 100 })));
              return { sj, mine: mine2, cls: avgOf(allAvg), rk: rm[me.id], n: allAvg.length };
            });
            return (
              <>
                <div className="pidbar">
                  <select className="pidsel" value={me.id} onChange={(e) => setPid(e.target.value)}>
                    {S.map((s, i) => <option key={s.id} value={s.id}>{numOf(s, i)}번 {s.name}</option>)}
                  </select>
                </div>
                <div className="statcards">
                  <div><small>「{cur}」 평균</small><b className={my.avg !== null && my.avg < thr ? 'lo' : ''}>{f2(my.avg)}</b></div>
                  <div><small>등수</small><b>{myRank ? myRank + '위 / ' + ranked.length : '-'}</b></div>
                  <div><small>학급 평균과 차이</small><b className={diff > 0 ? 'hi' : diff < 0 ? 'lo' : ''}>{diff === null ? '-' : (diff > 0 ? '▲ ' : diff < 0 ? '▼ ' : '') + f2(Math.abs(diff))}</b></div>
                  <div><small>응시 / 결석</small><b>{my.cnt}회 / {my.abs}회</b></div>
                </div>
                {(() => {
                  const labels = per.map((x) => x.t.name);
                  const sPts = per.map((x) => { const r0 = sc[x.t.id + '|' + me.id]; return isNum(r0) ? +r0.score : null; });
                  const cPts = per.map((x) => x.avg);
                  const vals = [...sPts, ...cPts].filter((q) => q !== null);
                  const rPts = per.map((x) => x.rk[me.id] ?? null);
                  if (!vals.length) return null;
                  const lo = Math.max(0, Math.floor((Math.min(...vals) - 5) / 10) * 10), hi = Math.max(lo + 10, Math.ceil(Math.max(...vals) / 10) * 10);
                  const nmax = Math.max(2, ...per.map((x) => Object.keys(x.rk).length));
                  return (
                    <div className="bigcharts">
                      <div><h3>성적 추이 <small style={{ fontWeight: 400, color: 'var(--mute)' }}>● {me.name} &nbsp;┅ 학급 평균</small></h3>
                        <LineChart labels={labels} min={lo} max={hi} series={[{ pts: cPts, color: '#b7bad0', dashed: true }, { pts: sPts, color: '#6f78c9' }]} /></div>
                      <div><h3>등수 추이 <small style={{ fontWeight: 400, color: 'var(--mute)' }}>위쪽일수록 높은 등수</small></h3>
                        <LineChart labels={labels} min={1} max={nmax} invert unit="위" series={[{ pts: rPts, color: '#e0883f' }]} /></div>
                    </div>
                  );
                })()}
                <div className="gradewrap">
                  <table className="stattable"><tbody>
                    <tr><th>평가</th><th>날짜</th><th>점수</th><th>학급 평균</th><th>차이</th><th>등수</th><th>비고</th></tr>
                    {per.map((x) => {
                      const r0 = sc[x.t.id + '|' + me.id];
                      const d = isNum(r0) && x.avg !== null ? +r0.score - x.avg : null;
                      return (
                        <tr key={x.t.id}>
                          <td className="c"><b>{x.t.name}</b></td><td className="c">{tDate(x.t).slice(5).replace('-', '/')}</td>
                          <td className={`c ${isNum(r0) && +r0.score < thr ? 'lo' : ''}`}>{isNum(r0) ? f0(+r0.score) : r0?.mark || '-'}</td>
                          <td className="c">{f2(x.avg)}</td>
                          <td className={`c ${d > 0 ? 'hi' : d < 0 ? 'lo' : ''}`}>{d === null ? '-' : (d > 0 ? '▲ ' : d < 0 ? '▼ ' : '') + f2(Math.abs(d))}</td>
                          <td className="c">{x.rk[me.id] ? x.rk[me.id] + '위' : '-'}</td>
                          <td className="notecell">{r0?.note ?? ''}</td>
                        </tr>
                      );
                    })}
                  </tbody></table>
                </div>
                {subjects.length > 1 && (
                  <>
                    <h3>과목별 평균</h3>
                    <div className="gradewrap">
                      <table className="stattable"><tbody>
                        <tr><th>과목</th><th>{me.name} 평균</th><th>학급 평균</th><th>등수</th></tr>
                        {bySub.map((b) => (
                          <tr key={b.sj}><td className="c"><b>{b.sj}</b></td><td className={`c ${b.mine !== null && b.mine < thr ? 'lo' : ''}`}>{f2(b.mine)}</td><td className="c">{f2(b.cls)}</td><td className="c">{b.rk ? b.rk + '위 / ' + b.n : '-'}</td></tr>
                        ))}
                      </tbody></table>
                    </div>
                  </>
                )}
              </>
            );
          })()}
        </>
      )}
    </>
  );
}
