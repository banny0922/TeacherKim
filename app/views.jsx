'use client';
import { Fragment, useEffect, useState } from 'react';
import { sb, today, saved } from './sb';
import { holidayName } from './holidays';
import { readSheets, readTable } from './readTable';
import { CalendarDays, PenLine, ListChecks, StickyNote, BookOpen, Users, MessageCircle, Upload, Download, Trash2, Plus, Pencil, Camera } from 'lucide-react';

const fd = (e) => { e.preventDefault(); return Object.fromEntries(new FormData(e.target)); };
const Del = ({ onClick }) => <button className="x" onClick={onClick}>삭제</button>;
const dateDesc = (a, b) => b.date.localeCompare(a.date);
const numOf = (s, i) => s.num ?? i + 1;
const NLX = String.fromCharCode(10);

// 사진을 긴 쪽 320px로 줄여서 JPEG data URL로 만든다 (DB에 작게 저장하기 위해)
async function resizePhoto(file, max = 320) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('사진을 읽을 수 없습니다.')); i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    let q = 0.85, out = c.toDataURL('image/jpeg', q);
    while (out.length > 90000 && q > 0.4) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
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
        <div key={k} className={`ev it ${tab ? 'go' : ''}`} title={text} onClick={tab && go ? (e) => { e.stopPropagation(); go(tab, id); } : undefined}><Icon size={12} strokeWidth={2.4} color={color} /><span>{text}</span></div>
      ))}
      {max && items.length > max && <div className="more">+{items.length - max}개 더</div>}
    </>
  );
}

/* 학사일정 (월간 달력) */
export function Calendar({ db, add, del, uid, load, go }) {
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
          {Array.from({ length: 12 }, (_, k) => <MiniMonth key={k} year={year} k={k} onMonth={(kk) => showMonth(year, kk)} onWeek={showWeek} />)}
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

// 연간 캘린더의 한 달: 숫자만 보인다. 가로 한 줄(주)을 누르면 그 주로, 달 이름을 누르면 그 달로
function MiniMonth({ year, k, onMonth, onWeek }) {
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
          {w.map((d, i) => d ? (
            <span key={i} title={holidayName(iso(d)) || ''} className={`${holidayName(iso(d)) || i === 6 ? 'sun' : i === 5 ? 'sat' : ''} ${iso(d) === t ? 'today' : ''}`}>{d}</span>
          ) : <span key={i} />)}
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
  // 시간표 탭의 내용을 교시 칸 위에 보여 준다 (월~금, 공휴일 제외). 학급 시간표 = 보라, 수업 시간표 = 주황.
  // 그 날만 바뀐 시간표(tt_changes)가 있으면 그것을 보여 주고 빨간색으로 표시한다.
  const base = (kind, i, period) => db.timetable.find((t) => t.kind === kind && t.day === i + 1 && t.period === period)?.text?.trim() ?? '';
  const chg = (kind, date, period) => (db.tt_changes ?? []).find((c) => c.date === date && c.kind === kind && c.period === period);
  const tt = (kind, i, period) => { if (i >= 5 || holidayName(days[i])) return ''; const c = chg(kind, days[i], period); return c ? (c.text ?? '') : base(kind, i, period); };
  // 한 칸(날짜·교시)의 시간표를 고친다. 바뀐 칸은 "바뀐 값"을 고치고, 안 바뀐 칸은 눌린 과목을 고친다.
  // 그 칸의 메모에 취소선을 켜고 끈다 (메모가 없거나 period_notes.struck 칸이 아직 없으면 조용히 무시)
  const strike = (d, p, on) => sb.from('period_notes').update({ struck: on }).eq('date', d).eq('period', p).then(() => {}, () => {});
  const clearTT = async (d, p) => {
    const { error } = await sb.from('tt_changes').delete().eq('date', d).eq('period', p);
    if (error) return alert(error.message);
    await strike(d, p, true); // 변경이 취소되었으니 이유를 적어 둔 메모도 취소선
    setEditCell(null); saved(); load();
  };
  // 이 날 이 교시가 원래와 다르게 바뀌었는지, 어느 종류(학급/수업)에 바뀐 값이 저장돼 있는지
  const changedKind = (d, i, p) => (i < 5 && !holidayName(d) ? ['class', 'subject'].find((kind) => { const c = chg(kind, d, p); return !!c && (c.text ?? '') !== base(kind, i, p); }) : undefined);
  const ttChanged = (d, i, p) => !!changedKind(d, i, p);
  const saveTT = async (d, i, p, kind, value) => {
    const v = (value ?? '').trim();
    const originals = [base('class', i, p), base('subject', i, p)].filter(Boolean);
    // 원래 시간표 값을 그대로 쓰면 = 변경 취소
    if (ttChanged(d, i, p) && originals.includes(v)) return clearTT(d, p);
    const b = base(kind, i, p), c = chg(kind, d, p);
    if (v === b) {
      if (c) { const { error } = await sb.from('tt_changes').delete().eq('id', c.id); if (error) return alert(error.message); await strike(d, p, true); }
    } else {
      const { error } = await sb.from('tt_changes').upsert({ user_id: uid, date: d, kind, period: p, text: v }, { onConflict: 'user_id,date,kind,period' });
      if (error) return alert(/tt_changes/.test(error.message) ? '시간표 변경을 저장할 곳이 아직 없습니다. Supabase SQL Editor에서 migrate.sql을 한 번 실행해 주세요.' : error.message);
      await strike(d, p, false); // 새로 바꿨으니 취소선 해제
    }
    setEditCell(null); saved(); load();
  };
  const ttCell = (d, i, p) => {
    if (i >= 5 || holidayName(d)) return null;
    const key = d + '|' + p;
    const ck = changedKind(d, i, p);
    // 바뀐 칸이면 어느 과목을 눌러도(또는 ✎) 바뀐 값을 고친다. 안 바뀐 칸은 눌린 과목, ✎는 학급 → 수업 순
    const defKind = tt('class', i, p) || !tt('subject', i, p) ? 'class' : 'subject';
    const open = (kind) => setEditCell(key + '|' + (ck ?? kind));
    const editing = editCell && editCell.startsWith(key + '|') ? editCell.split('|')[2] : null;
    // 고치는 중: 그 칸 안에서 바로 입력. 저장(Enter) / 취소 — 바뀐 칸에서 취소 = 변경 취소(원래 시간표로), Esc = 그냥 닫기
    if (editing) {
      return (
        <form className="ttinline" onSubmit={(e) => { e.preventDefault(); saveTT(d, i, p, editing, new FormData(e.target).get('v')); }}
          onKeyDown={(e) => { if (e.key === 'Escape') setEditCell(null); }}>
          <input name="v" className={editing === 'subject' ? 'k2' : 'k1'} defaultValue={tt(editing, i, p)} placeholder={editing === 'subject' ? '수업 시간표' : '학급 시간표'} autoFocus onFocus={(e) => e.target.select()} />
          <div className="ttbtns">
            <button>저장</button>
            {ck ? <button type="button" onClick={() => clearTT(d, p)} title="이 날만 바꾼 것을 지우고 원래 시간표로 되돌립니다">변경 취소</button>
              : <button type="button" onClick={() => setEditCell(null)}>취소</button>}
          </div>
        </form>
      );
    }
    // 바뀐 칸은 바뀐 값만 보여 준다 (원래 값은 보여 주지 않음)
    const pill = (kind, cls) => {
      const v = tt(kind, i, p);
      if (!v) return null;
      const changed = ck === kind;
      if (ck && !changed) return null;
      return <b className={`${cls} ${changed ? 'chg' : ''}`} onClick={() => open(kind)} title={(changed ? '이 날만 바뀐 시간표' : kind === 'class' ? '학급 시간표' : '수업 시간표') + ' (눌러서 고치기)'}>{v}</b>;
    };
    return (
      <div className="ttlabel">
        {pill('class', 'c1')}{pill('subject', 'c2')}
        <button type="button" className="ttedit" title="이 날 시간표 고치기" onClick={() => open(defKind)}>✎</button>
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
      {hasTT && <p className="hint" style={{ margin: '0 0 6px' }}>교시 칸 위의 글씨는 시간표에서 가져온 것입니다. <b className="ttkey c1">학급 시간표</b> <b className="ttkey c2">수업 시간표</b> <b className="ttkey c1 chg">이 날만 변경</b> — 칸에 마우스를 올리면 나오는 ✎로 그 날만 바꿉니다. 늘 바뀌는 것은 시간표 탭에서 고치세요.</p>}
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
      <h3 className="pill">{title}</h3>
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
  return <div className="two">{grid('class', '학기 / 학급')}{grid('subject', '학기 / 수업')}</div>;
}

/* 수업진도: 학년도 월 탭(3~2), 왼쪽 목록 / 오른쪽 입력·수정 */
export function Progress({ db, add, del, upd, focus }) {
  const fr = db.progress.find((m) => m.id === focus?.id);
  const now = fr ? new Date(fr.date + 'T00:00:00') : new Date();
  const sy = now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear();
  const MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2];
  const [mo, setMo] = useState(now.getMonth() + 1);
  const key = `${mo >= 3 ? sy : sy + 1}-${String(mo).padStart(2, '0')}`;
  const rows = db.progress.filter((p) => p.date.startsWith(key)).sort((a, b) => a.date.localeCompare(b.date));
  const [sel, setSel] = useState(fr?.id ?? null);
  const cur = db.progress.find((p) => p.id === sel);
  const [f, setF] = useState({ date: today(), subject: '', content: '' });
  const subjects = [...new Set(['국어', '수학', '사회', '과학', '영어', '체육', '음악', '미술', '도덕', '실과', ...db.progress.map((p) => p.subject).filter(Boolean)])];
  const pickMonth = (n) => { setMo(n); setSel(null); setF({ ...f, date: `${n >= 3 ? sy : sy + 1}-${String(n).padStart(2, '0')}-01`, content: '' }); };
  const fields = (v, set) => (
    <table className="counseltable"><tbody>
      <tr><th style={{ width: 70 }}>날짜</th><td><input type="date" name="date" value={v.date} onChange={(e) => set({ ...v, date: e.target.value })} /></td></tr>
      <tr><th>과목</th><td><input name="subject" list="subjects" value={v.subject ?? ''} placeholder="과목" onChange={(e) => set({ ...v, subject: e.target.value })} />
        <datalist id="subjects">{subjects.map((n) => <option key={n} value={n} />)}</datalist></td></tr>
      <tr><th className="tall">진도</th><td className="body"><textarea value={v.content} placeholder="예: 3단원 2차시 분수의 덧셈" onChange={(e) => set({ ...v, content: e.target.value })} /></td></tr>
    </tbody></table>
  );
  const [edit, setEdit] = useState(fr ? { date: fr.date, subject: fr.subject, content: fr.content } : null);
  return (
    <>
      <div className="numtabs">
        {MONTHS.map((n) => <button key={n} className={n === mo ? 'on' : ''} onClick={() => pickMonth(n)}>{n}</button>)}
      </div>
      <div className="two split">
        <div>
          <table><tbody>
            <tr><th style={{ width: 70 }}>날짜</th><th style={{ width: 70 }}>과목</th><th>진도</th></tr>
            {rows.map((p) => (
              <tr key={p.id} className={`pickrow ${p.id === sel ? 'on' : ''} ${p.date === today() ? 'tdr' : ''}`} onClick={() => { setSel(p.id); setEdit({ date: p.date, subject: p.subject, content: p.content }); }}>
                <td className="c">{p.date.slice(5).replace('-', '/')}</td><td className="c">{p.subject}</td><td>{p.content}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="3" style={{ textAlign: 'center', color: 'var(--mute)', padding: 20 }}>{mo}월 기록이 없습니다.</td></tr>}
          </tbody></table>
          <button style={{ marginTop: 10 }} onClick={() => setSel(null)}>+ 새 진도 쓰기</button>
        </div>
        {cur && edit ? (
          <form key={cur.id} onSubmit={(e) => { e.preventDefault(); upd('progress', cur.id, edit); }}>
            {fields(edit, setEdit)}
            <div className="actions">
              <button type="button" className="danger" onClick={() => { del('progress', cur.id, `${cur.date.slice(5)} ${cur.subject ?? ''} 진도 기록을 삭제할까요?`); setSel(null); }}>삭제</button>
              <button>수정 저장</button>
            </div>
          </form>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); if (f.content.trim()) { add('progress', f); setF({ ...f, content: '' }); } }}>
            {fields(f, setF)}
            <button>저장</button>
          </form>
        )}
      </div>
    </>
  );
}

/* 교무회의: 학년도 월 탭(3~2), 왼쪽 제목 목록 / 오른쪽 입력·내용 */
export function Meetings({ db, add, del, upd, focus }) {
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
          <form key={cur.id} onSubmit={(e) => { const d = fd(e); upd('meetings', cur.id, { date: d.date, title: d.title, content: d.content }); }}>
            <table className="counseltable"><tbody>
              <tr><th style={{ width: 70 }}>날짜</th><td><input type="date" name="date" defaultValue={cur.date} /></td></tr>
              <tr><th>제목</th><td><input name="title" defaultValue={cur.title ?? ''} /></td></tr>
              <tr><th className="tall">회의<br />내용</th><td className="body"><textarea name="content" defaultValue={cur.content} /></td></tr>
            </tbody></table>
            <div className="actions">
              <button type="button" className="danger" onClick={() => { del('meetings', cur.id, `${cur.date.slice(5)} 「${cur.title || '제목 없음'}」 회의 기록을 삭제할까요?`); setSel(null); }}>삭제</button>
              <button>수정 저장</button>
            </div>
          </form>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); if (f.title.trim() || f.content.trim()) { add('meetings', f); setF({ ...f, title: '', content: '' }); } }}>
            <table className="counseltable"><tbody>
              <tr><th style={{ width: 70 }}>날짜</th><td><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></td></tr>
              <tr><th>제목</th><td><input value={f.title} placeholder="회의 제목" onChange={(e) => setF({ ...f, title: e.target.value })} /></td></tr>
              <tr><th className="tall">회의<br />내용</th><td className="body"><textarea value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} /></td></tr>
            </tbody></table>
            <button>저장</button>
          </form>
        )}
      </div>
    </>
  );
}

/* 학급명렬 */
export function Roster({ S, add, del, upd, load }) {
  const importXlsx = async (file) => {
    if (!file) return;
    const rows = await readTable(file);
    // 첫 줄에 '이름'이 있으면 머리글로 보고 열 위치를 찾고, 없으면 번호·이름·학생연락처·학부모연락처 순서로 간주
    const h = rows[0]?.findIndex((c) => c.includes('이름')) >= 0 ? rows.shift() : ['번호', '이름', '학생', '학부모'];
    const col = (k) => h.findIndex((c) => c.includes(k));
    const [ci, cn, cp, cq] = [col('번호'), col('이름'), col('학생'), col('학부모')];
    let fi = 0;
    const free = nextFree(rows.length);
    const list = rows.filter((r) => r[cn]).map((r) => ({ num: +r[ci] || free[fi++], name: r[cn], phone: r[cp] || null, parent_phone: r[cq] || null }));
    if (list.length && confirm(`${list.length}명을 등록할까요?`)) add('students', list);
  };
  // 학급명렬 번호 칸: 왼쪽은 1~15번, 오른쪽은 50번부터. 그 밖의 번호(16~49, 65~)도 있으면 해당 칸 아래에 이어서 보인다.
  const sorted = [...S].sort((a, b) => (a.num ?? 1e9) - (b.num ?? 1e9));
  const used = new Set(sorted.map((s) => s.num).filter(Boolean));
  const byNum = Object.fromEntries(sorted.filter((s) => s.num).map((s) => [s.num, s]));
  const nextFree = (k) => {
    const out = [];
    for (const c of [...Array.from({ length: 15 }, (_, i) => i + 1), ...Array.from({ length: 300 }, (_, i) => 50 + i)]) {
      if (!used.has(c)) { out.push(c); if (out.length === k) break; }
    }
    return out;
  };
  const column = (slots, extra, loose) => {
    const nums = [...new Set([...slots, ...extra])].sort((a, b) => a - b);
    const last = nums[nums.length - 1];
    const rows = nums.map((n) => (byNum[n] ? { s: byNum[n] } : { n }));
    loose.forEach((s) => rows.push({ s }));
    [1, 2].forEach((k) => { if (loose.length === 0 && (last + k < 50 || last >= 50)) rows.push({ n: last + k }); });
    return rows;
  };
  const clearAll = async () => {
    if (!S.length || !confirm('학생 ' + S.length + '명과 그 성적·체크·상담 기록이 모두 지워집니다. 정말 지울까요?')) return;
    if (!confirm('되돌릴 수 없습니다. 한 번 더 확인합니다. 모두 지울까요?')) return;
    const { error } = await sb.from('students').delete().in('id', S.map((x) => x.id));
    if (error) alert(error.message); else { await load(); saved(); }
  };
  const colA = column(Array.from({ length: 15 }, (_, i) => i + 1), sorted.filter((s) => s.num > 15 && s.num < 50).map((s) => s.num), sorted.filter((s) => !s.num));
  const colB = column(Array.from({ length: 15 }, (_, i) => 50 + i), sorted.filter((s) => s.num >= 65).map((s) => s.num), []);
  const addRow = (e) => {
    const tr = e.target.closest('tr');
    if (e.relatedTarget && tr.contains(e.relatedTarget)) return; // 같은 줄 안에서 옮겨 가는 중이면 아직 저장하지 않음
    const g = (f) => tr.querySelector(`[data-f="${f}"]`)?.value.trim() ?? '';
    const num = +g('num'), name = g('name'), phone = g('phone'), pp = g('parent_phone');
    if (num && (name || phone || pp)) add('students', { num, name, phone: phone || null, parent_phone: pp || null });
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
        <span className="hint">열 순서: 번호 · 이름 · 학생 연락처 · 학부모 연락처 (첫 줄은 머리글)</span>
      </div>
      <div className="two">
        {[colA, colB].map((part, k) => (
          <table key={k}><tbody>
            <tr><th style={{ width: 62 }}>번호</th><th>이름</th><th>학생 연락처</th><th>학부모 연락처</th></tr>
            {part.map(({ s, n }) => (
              <tr key={s ? s.id : `b${n}`}>
                <td className="c"><input type="number" data-f="num" key={s ? s.num : `n${n}`} defaultValue={s ? s.num ?? '' : n}
                  onBlur={(e) => { if (!s) return addRow(e); if (+e.target.value && +e.target.value !== s.num) upd('students', s.id, { num: +e.target.value }); }} /></td>
                {field(s, 'name', n)}{field(s, 'phone', n)}{field(s, 'parent_phone', n)}
              </tr>
            ))}
          </tbody></table>
        ))}
      </div>
      <details style={{ marginTop: 10 }}><summary style={{ cursor: 'pointer', color: 'var(--mute)' }}>학생 삭제</summary>
        <button type="button" className="danger" style={{ margin: '8px 0' }} onClick={clearAll}>학생 전체 삭제</button><br />
        {S.map((s, i) => <button key={s.id} className="x" onClick={() => del('students', s.id, `${numOf(s, i)}번 ${s.name} 학생을 삭제할까요?` + NLX + '이 학생의 성적·체크·상담 기록도 모두 함께 지워집니다.')}>{numOf(s, i)}번 {s.name} 삭제</button>)}
      </details>
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
export function Counsel({ db, S, add, del, upd, focus }) {
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
  const pick = (opts, val, set) => opts.map((o) => <td key={o} className={`pick ${val === o ? 'on' : ''}`} onClick={() => set(o)}>{o}</td>);
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
        <form onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; if (editId) { upd('notes', editId, { date, target, method, text }); setEditId(null); } else add('notes', { date, student_id: stu.id, target, method, text }); setText(''); }}>
          <table className="counseltable"><tbody>
            <tr><th>날짜</th><td colSpan="3"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></td></tr>
            <tr><th>대상</th>{pick(['학생', '학부모', '친구'], target, setTarget)}</tr>
            <tr><th>방법</th>{pick(['면담', '전화', '문자/인터넷'], method, setMethod)}</tr>
            <tr><th className="tall">상담<br />내용</th><td colSpan="3" className="body"><textarea value={text} onChange={(e) => setText(e.target.value)} /></td></tr>
          </tbody></table>
          <div className="actions">
            {editId ? <button type="button" onClick={() => { setEditId(null); setText(''); setDate(today()); }}>새로 쓰기</button> : <span />}
            <button>{editId ? '수정 저장' : '저장'}</button>
          </div>
        </form>
      </div>
    </>
  );
}

/* 메모하기: 날짜를 골라 쓰기. 왼쪽 목록 / 오른쪽 입력·수정 */
export function Memos({ db, add, del, upd, focus }) {
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
        <form key={cur.id} onSubmit={(e) => { e.preventDefault(); upd('memos', cur.id, edit); }}>
          {fields(edit, setEdit)}
          <div className="actions">
            <button type="button" className="danger" onClick={() => { del('memos', cur.id, `「${cur.title || '제목 없음'}」 메모를 삭제할까요?`); setSel(null); }}>삭제</button>
            <button>수정 저장</button>
          </div>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (f.content.trim() || f.title.trim()) { add('memos', f); setF({ ...f, title: '', content: '' }); } }}>
          {fields(f, setF)}
          <button>저장</button>
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
  // 학년도 월 탭(3~2): 시험은 매달 있으므로 달별로 모아 본다
  const now = new Date();
  const sy = now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear();
  const MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2];
  const [mo, setMo] = useState(now.getMonth() + 1);
  const monthKey = (m) => `${m >= 3 ? sy : sy + 1}-${String(m).padStart(2, '0')}`;
  const tDate = (t) => t.date ?? t.created_at?.slice(0, 10) ?? '';
  const inMonth = (t, m) => tDate(t).startsWith(monthKey(m));
  const hasTests = (m) => db.tests.some((t) => t.subject === cur && inMonth(t, m));
  const tests = db.tests.filter((t) => t.subject === cur && inMonth(t, mo)).sort((a, b) => tDate(a).localeCompare(tDate(b)));
  const newDate = mo === now.getMonth() + 1 ? today() : monthKey(mo) + '-01';
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
  // 점수 칸에는 숫자(0 이상) 또는 '결석'만 넣을 수 있다
  const okScore = (v) => v === '' || v === '결석' || (/^[0-9.]+$/.test(v) && Number.isFinite(+v));
  const save = (test_id, student_id, raw) => {
    const v = raw.trim();
    if (!okScore(v)) { alert('점수는 숫자 또는 「결석」만 입력할 수 있습니다.'); return false; }
    const num = v !== '' && !Number.isNaN(+v);
    const score = num ? +v : null, mark = v === '' || num ? null : v;
    if (String(text(test_id, student_id)) === v) return true;
    setDb((d) => ({ ...d, scores: [...d.scores.filter((x) => !(x.test_id === test_id && x.student_id === student_id)), { test_id, student_id, score, mark }] }));
    sb.from('scores').upsert({ test_id, student_id, score, mark }).then(({ error }) => (error ? alert(error.message) : saved()));
    return true;
  };
  // 번호가 1~15번, 50번~처럼 크게(10 이상) 건너뛰면 그 사이에 빈 줄을 하나 둔다(샘플의 기록부처럼 한 표에서 묶음만 나눔)
  const ordered = [...S].sort((a, b) => (a.num ?? 1e9) - (b.num ?? 1e9));
  let cut = -1, gap = 0;
  ordered.forEach((st, i) => { const g = i ? (st.num ?? 0) - (ordered[i - 1].num ?? 0) : 0; if (g >= 10 && g > gap) { gap = g; cut = i; } });
  // 엑셀/CSV 올리기: 시트 하나 = 과목 하나. 각 시트의 첫 줄 = 번호·이름·평가명들, 아래 = 학생별 점수(숫자 또는 결석 같은 글자)
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
      const cols = head.map((h, i) => ({ h, i })).filter(({ h, i }) => h && i !== ci && i !== cn && body.some((rw) => (rw[i] ?? '').trim() !== ''));
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
        cols.forEach(({ h, i }) => {
          const v = (r[i] ?? '').trim();
          if (v === '') return;
          if (!okScore(v)) { bad++; return; }
          const num = v !== '결석';
          out.push({ test_id: ids[h], student_id: st.id, score: num ? +v : null, mark: num ? null : v });
        });
      });
      if (out.length) { const res = await sb.from('scores').upsert(out); if (res.error) return alert(res.error.message); }
      report.push(sh.sheet + ': 평가 ' + cols.length + '개, 점수 ' + out.length + '개' + (miss ? ' (학생 못 찾음 ' + miss + '줄)' : '') + (bad ? ' (숫자·결석이 아니라 건너뜀 ' + bad + '칸)' : ''));
    }
    await load(); saved(); setSub(usable[0].sheet); setMo(+date.slice(5, 7));
    alert(['저장했습니다.', '', ...report].join(NL));
  };
  // 양식 받기: 우리 반 학생(번호·이름)이 미리 들어 있고, 있는 점수도 함께 담긴 엑셀. 채워서 다시 올리면 된다
  const downloadTemplate = async () => {
    if (!S.length) return alert('먼저 학급명렬에서 학생을 등록하세요. 양식에 우리 반 학생이 미리 들어갑니다.');
    const { default: writeXlsxFile } = await import('write-excel-file/browser');
    const subs = subjects.length ? subjects : ['받아쓰기'];
    const head = (v) => ({ value: v, fontWeight: 'bold', backgroundColor: '#eef0f7', align: 'center' });
    const sheets = subs.map((sj) => {
      const ts = db.tests.filter((t) => t.subject === sj && inMonth(t, mo)).sort((a, b) => tDate(a).localeCompare(tDate(b)));
      const spare = ts.length ? 2 : 3;
      const heads = [...ts.map((t) => t.name), ...Array.from({ length: spare }, (_, i) => (ts.length ? '' : '평가' + (i + 1)))];
      const data = [[head('번호'), head('이름'), ...heads.map((h) => head(h))]];
      ordered.forEach((st) => {
        data.push([{ value: numOf(st, S.indexOf(st)), align: 'center' }, { value: st.name, align: 'center' },
          ...heads.map((_, i) => { const t = ts[i]; const v = t ? text(t.id, st.id) : ''; return v === '' ? null : { value: v, align: 'center' }; })]);
      });
      return { data, sheet: sj.slice(0, 28), columns: [{ width: 8 }, { width: 14 }, ...heads.map(() => ({ width: 11 }))] };
    });
    await writeXlsxFile(sheets).toFile('우리반_성적양식.xlsx');
  };
  const csv = () => {
    const rows = [['번호', '이름', ...tests.map((t) => `${t.name} ${t.date ?? ''}`)],
      ...S.map((s, i) => [numOf(s, i), s.name, ...tests.map((t) => text(t.id, s.id))]),
      ['', '평균', ...tests.map((t) => avg(t.id))]];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join(String.fromCharCode(10))]));
    a.download = (cur || '성적') + '.csv'; a.click();
  };
  return (
    <>
      <div className="numtabs months">
        {MONTHS.map((n) => <button key={n} className={`${n === mo ? 'on' : ''} ${hasTests(n) ? 'has' : ''}`} onClick={() => setMo(n)}>{n}</button>)}
      </div>
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
        if (d.date) setMo(+d.date.slice(5, 7)); // 다른 달 날짜로 추가해도 그 달 탭으로 이동해서 바로 보이게
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
        <span className="hint">양식에 점수를 채워 다시 올리거나, 아래 표에서 바로 입력하세요. 점수는 숫자, 결석은 글자로 / 올릴 때 평가 날짜를 입력합니다</span>
      </div>
      {S.length === 0 ? <p>먼저 학급명렬에서 학생을 추가하세요.</p> : (
        <>
        {!db.tests.some((t) => t.subject === cur) ? <p style={{ color: 'var(--mute)' }}>「{cur}」 과목을 만들었습니다. 위쪽에서 <b>평가 이름</b>을 쓰고 <b>평가(열) 추가</b>를 누르면 이 표에 열이 생깁니다.</p> : tests.length === 0 ? <p style={{ color: 'var(--mute)' }}>{mo}월에는 「{cur}」 평가가 없습니다. 위쪽에서 <b>평가(열) 추가</b>로 열을 만들거나 다른 달을 눌러 보세요.</p> : null}
        <div className="gradewrap">
          <table className="grades"><tbody>
            <tr><th style={{ width: 54 }}>번호</th><th style={{ width: 90 }}>이름</th>
              {tests.map((t) => <th key={t.id}>
                <input className="hname" key={t.name} defaultValue={t.name} title="평가 이름 (눌러서 수정)" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== t.name && upd('tests', t.id, { name: e.target.value.trim() })} /><br />
                <input type="date" className="hdate" key={t.date ?? ''} defaultValue={t.date ?? ''} title="평가 날짜 (눌러서 수정)" onBlur={(e) => e.target.value !== (t.date ?? '') && upd('tests', t.id, { date: e.target.value || null })} /><button className="tdel" title="이 평가(열) 삭제 — 점수도 함께 지워집니다" onClick={() => del('tests', t.id, `${cur} 「${t.name}」 평가(열)를 삭제할까요?` + NLX + '모든 학생의 이 평가 점수가 함께 지워집니다.')}><Trash2 size={13} /></button></th>)}
            </tr>
            {ordered.map((s, i) => (
              <Fragment key={s.id}>
                {i === cut && i > 0 && <tr className="gaprow"><td colSpan={2 + tests.length} /></tr>}
                <tr><td className="c">{numOf(s, S.indexOf(s))}</td><td className="c">{s.name}</td>
                  {tests.map((t) => <td key={t.id} className="c"><input className={cls(t.id, s.id)} key={String(text(t.id, s.id))} defaultValue={text(t.id, s.id)} onBlur={(e) => { if (!save(t.id, s.id, e.target.value)) e.target.value = String(text(t.id, s.id)); }} /></td>)}
                </tr>
              </Fragment>
            ))}
            <tr className="avgrow"><td className="c" colSpan="2">전체평균</td>{tests.map((t) => <td key={t.id} className="c">{avg(t.id)}</td>)}</tr>
          </tbody></table>
        </div>
        </>
      )}
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
  const [mo, setMo] = useState('all');
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
    return { t, nums, abs, rk, avg: avgOf(nums), max: nums.length ? Math.max(...nums) : null, min: nums.length ? Math.min(...nums) : null, med: median(nums), bins };
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
  const need = ranked.filter((x) => x.avg < 80);
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
      <div className="numtabs months">
        <button className={mo === 'all' ? 'on' : ''} onClick={() => setMo('all')}>전체</button>
        {MONTHS.map((n) => <button key={n} className={`${n === mo ? 'on' : ''} ${mine.some((t) => tDate(t).startsWith(monthKey(n))) ? 'has' : ''}`} onClick={() => setMo(n)}>{n}</button>)}
      </div>
      <div className="numtabs sheets">
        {subjects.map((n) => <button key={n} className={n === cur ? 'on' : ''} onClick={() => setSub(n)}>{n}</button>)}
      </div>

      {tests.length === 0 ? <p style={{ color: 'var(--mute)' }}>{mo === 'all' ? '' : mo + '월에는 '}「{cur}」 평가가 없습니다. 다른 달이나 과목을 눌러 보세요.</p> : (
        <>
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
              <tr><th>평가</th><th>날짜</th><th>응시</th><th>평균</th><th>최고</th><th>최저</th><th>중앙값</th><th>결석</th><th style={{ width: '34%' }}>점수 분포</th></tr>
              {per.map((x) => (
                <tr key={x.t.id}>
                  <td className="c"><b>{x.t.name}</b></td><td className="c">{tDate(x.t).slice(5).replace('-', '/')}</td>
                  <td className="c">{x.nums.length}명</td><td className="c"><b>{f2(x.avg)}</b></td><td className="c">{f0(x.max)}</td><td className="c">{f0(x.min)}</td><td className="c">{f0(x.med)}</td><td className="c">{x.abs || '-'}</td>
                  <td>
                    <div className="dist" title={BIN.map(([l], i) => l + ' ' + x.bins[i] + '명').join(' · ')}>
                      {x.bins.map((c, i) => c > 0 && <i key={i} style={{ flex: c, background: BIN[i][1] }}>{c}</i>)}
                    </div>
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
            <div>
              <h3>확인이 필요한 학생 (평균 80 미만)</h3>
              <div className="chips">{need.length ? need.map((x) => <span key={x.st.id} className="chip warn">{x.n}번 {x.st.name} · {f2(x.avg)}</span>) : <span className="hint">없습니다</span>}</div>
            </div>
          </div>

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
                    <td className={`c ${x.avg !== null && x.avg < 80 ? 'lo' : x.avg >= 100 ? 'hi' : ''}`}><b>{f2(x.avg)}</b></td>
                    <td className={`c rank ${rk && rk <= 3 ? 'top' : ''}`}>{rk ? rk + '위' : '-'}<small>{rk ? ' / ' + ranked.length : ''}</small></td>
                    <td className={`c ${x.delta > 0 ? 'hi' : x.delta < 0 ? 'lo' : ''}`}>{x.delta === null ? '-' : (x.delta > 0 ? '▲ ' : x.delta < 0 ? '▼ ' : '') + f0(Math.abs(x.delta))}</td>
                    <td className="c">{x.abs || '-'}</td>
                  </tr>
                );
              })}
            </tbody></table>
          </div>
        </>
      )}
    </>
  );
}
