'use client';
import { useState } from 'react';
import { sb, today } from './sb';

const fd = (e) => { e.preventDefault(); return Object.fromEntries(new FormData(e.target)); };
const Del = ({ onClick }) => <button className="x" onClick={onClick}>삭제</button>;
const dateDesc = (a, b) => b.date.localeCompare(a.date);
const numOf = (s, i) => s.num ?? i + 1;

/* 학사일정 (월간 달력) */
export function Calendar({ db, add, del, uid, load }) {
  const [m, setM] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [sel, setSel] = useState(today());
  const y = m.getFullYear(), mo = m.getMonth();
  const days = new Date(y, mo + 1, 0).getDate();
  const iso = (d) => `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const cells = [...Array(m.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  return (
    <>
      <h3>
        <button onClick={() => setM(new Date(y, mo - 1, 1))}>◀</button> {y}년 {mo + 1}월 <button onClick={() => setM(new Date(y, mo + 1, 1))}>▶</button>
      </h3>
      <div className="cal">
        {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => <div key={d} className={`h ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>{d}</div>)}
        {cells.map((d, i) => d === null ? <div key={i} className="h" /> : (
          <div key={i} className={`${iso(d) === today() ? 'td' : ''} ${iso(d) === sel ? 'sel' : ''}`} onClick={() => setSel(iso(d))}>
            <span className={i % 7 === 0 ? 'sun' : i % 7 === 6 ? 'sat' : ''}>{d}</span>
            {db.events.filter((e) => e.date === iso(d)).map((e) => <div key={e.id} className="ev">{e.title} <button className="x" onClick={(ev) => { ev.stopPropagation(); del('events', e.id); }}>×</button></div>)}
          </div>
        ))}
      </div>
      <Week sel={sel} db={db} add={add} del={del} uid={uid} load={load} />
    </>
  );
}


/* 선택한 날짜가 속한 한 주(일~토) 펼침: 일정 + 날짜별 메모 */
function Week({ sel, db, add, del, uid, load }) {
  const start = new Date(sel + 'T00:00:00'); start.setDate(start.getDate() - start.getDay());
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d.toLocaleDateString('sv'); });
  const memo = (date) => db.day_memos.find((m) => m.date === date)?.text ?? '';
  const saveMemo = async (date, text) => {
    if (text === memo(date)) return;
    const { error } = await sb.from('day_memos').upsert({ user_id: uid, date, text }, { onConflict: 'user_id,date' });
    if (error) alert(error.message);
    load();
  };
  return (
    <>
      <h3>{days[0]} ~ {days[6]}</h3>
      <div className="week">
        {days.map((d, i) => (
          <div className={`card ${d === sel ? 'sel' : ''}`} key={d}>
            <b className={i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>{d.slice(5)} ({'일월화수목금토'[i]})</b>
            {db.events.filter((e) => e.date === d).map((e) => <div key={e.id} className="ev">{e.title} <button className="x" onClick={() => del('events', e.id)}>×</button></div>)}
            <form onSubmit={(e) => { const t = fd(e).title; if (t) add('events', { date: d, title: t }); e.target.reset(); }}>
              <input name="title" placeholder="+ 일정" style={{ width: '90%' }} />
            </form>
            <textarea key={memo(d)} defaultValue={memo(d)} placeholder="메모" rows="4" onBlur={(e) => saveMemo(d, e.target.value)} />
          </div>
        ))}
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
    if (error) alert(error.message);
    load();
  };
  const grid = (kind, title) => (
    <div>
      <h3>{title}</h3>
      <table><tbody>
        <tr><th>교시</th>{DAYS.map((d) => <th key={d}>{d}</th>)}</tr>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
          <tr key={p}><th>{p}</th>
            {DAYS.map((_, d) => <td key={d}><input key={get(kind, d + 1, p)} defaultValue={get(kind, d + 1, p)} onBlur={(e) => save(kind, d + 1, p, e.target.value)} /></td>)}
          </tr>
        ))}
      </tbody></table>
    </div>
  );
  return <div className="two">{grid('class', '학급 시간표')}{grid('subject', '수업 시간표')}</div>;
}

/* 수업진도 */
export function Progress({ db, add, del }) {
  return (
    <>
      <form onSubmit={(e) => { const d = fd(e); if (d.content) { add('progress', d); e.target.reset(); } }}>
        <input type="date" name="date" defaultValue={today()} /><input name="subject" placeholder="과목" size="8" /><input name="content" placeholder="진도 (예: 3단원 2차시)" size="40" /><button>추가</button>
      </form>
      <table><tbody>
        <tr><th>날짜</th><th>과목</th><th>진도</th><th></th></tr>
        {[...db.progress].sort(dateDesc).map((p) => <tr key={p.id}><td>{p.date}</td><td>{p.subject}</td><td>{p.content}</td><td><Del onClick={() => del('progress', p.id)} /></td></tr>)}
      </tbody></table>
    </>
  );
}

/* 교무회의 */
export function Meetings({ db, add, del }) {
  return (
    <>
      <form onSubmit={(e) => { const d = fd(e); if (d.content) { add('meetings', d); e.target.reset(); } }}>
        <input type="date" name="date" defaultValue={today()} /><br />
        <textarea name="content" rows="6" placeholder="회의 내용" /><br /><button>저장</button>
      </form>
      {[...db.meetings].sort(dateDesc).map((m) => (
        <div className="card" key={m.id}><b>{m.date}</b> <Del onClick={() => del('meetings', m.id)} /><div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div></div>
      ))}
    </>
  );
}

/* 학급명렬 */
export function Roster({ S, add, del, upd }) {
  const importXlsx = async (file) => {
    if (!file) return;
    const { readSheet } = await import('read-excel-file/browser');
    const rows = (await readSheet(file)).map((r) => r.map((c) => (c == null ? '' : String(c).trim())));
    // 첫 줄에 '이름'이 있으면 머리글로 보고 열 위치를 찾고, 없으면 번호·이름·학생연락처·학부모연락처 순서로 간주
    const h = rows[0]?.findIndex((c) => c.includes('이름')) >= 0 ? rows.shift() : ['번호', '이름', '학생', '학부모'];
    const col = (k) => h.findIndex((c) => c.includes(k));
    const [ci, cn, cp, cq] = [col('번호'), col('이름'), col('학생'), col('학부모')];
    const list = rows.filter((r) => r[cn]).map((r, i) => ({ num: +r[ci] || next + i, name: r[cn], phone: r[cp] || null, parent_phone: r[cq] || null }));
    if (list.length && confirm(`${list.length}명을 등록할까요?`)) add('students', list);
  };
  const next = Math.max(0, ...S.map((s) => s.num ?? 0)) + 1;
  const cell = (s, k) => <td><input key={s[k]} defaultValue={s[k] ?? ''} onBlur={(e) => e.target.value !== (s[k] ?? '') && upd('students', s.id, { [k]: e.target.value })} /></td>;
  return (
    <>
      <form onSubmit={(e) => {
        const names = fd(e).names.split('\n').map((s) => s.trim()).filter(Boolean);
        if (names.length) add('students', names.map((name, i) => ({ name, num: next + i })));
        e.target.reset();
      }}>
        <textarea name="names" rows="3" placeholder="이름을 한 줄에 한 명씩 붙여넣기" /><br /><button>학생 추가</button>
      </form>
      <p>엑셀(.xlsx) 일괄 등록: <input type="file" accept=".xlsx" onChange={(e) => { importXlsx(e.target.files[0]); e.target.value = ''; }} />
        <small>열 순서: 번호 · 이름 · 학생 연락처 · 학부모 연락처 (첫 줄은 머리글)</small></p>
      <table><tbody>
        <tr><th style={{ width: 60 }}>번호</th><th>이름</th><th>학생 연락처</th><th>학부모 연락처</th><th></th></tr>
        {S.map((s, i) => (
          <tr key={s.id}>
            <td><input type="number" key={s.num} defaultValue={numOf(s, i)} onBlur={(e) => +e.target.value !== numOf(s, i) && upd('students', s.id, { num: +e.target.value || null })} /></td>
            {cell(s, 'name')}{cell(s, 'phone')}{cell(s, 'parent_phone')}
            <td><Del onClick={() => del('students', s.id)} /></td>
          </tr>
        ))}
      </tbody></table>
    </>
  );
}

/* 체크리스트 */
export function Checklists({ db, S, add, del, upd, write }) {
  const toggle = (cid, sid, on) => write(on
    ? sb.from('checks').delete().match({ checklist_id: cid, student_id: sid })
    : sb.from('checks').insert({ checklist_id: cid, student_id: sid }));
  return (
    <>
      <button onClick={() => add('checklists', { title: '' })}>+ 체크리스트 추가</button>
      {S.length === 0 && <p>먼저 학급명렬에서 학생을 추가하세요.</p>}
      {db.checklists.map((c) => (
        <div className="card" key={c.id}>
          <input key={c.title} defaultValue={c.title} placeholder="항목 이름 (예: 가정통신문 제출)" size="30" onBlur={(e) => e.target.value !== c.title && upd('checklists', c.id, { title: e.target.value })} />
          <Del onClick={() => del('checklists', c.id)} />
          <div className="nums">
            {S.map((s, i) => {
              const on = db.checks.some((k) => k.checklist_id === c.id && k.student_id === s.id);
              return <button key={s.id} className={`chk ${on ? 'on' : ''}`} title={s.name} onClick={() => toggle(c.id, s.id, on)}>{numOf(s, i)}</button>;
            })}
          </div>
        </div>
      ))}
    </>
  );
}

/* 상담기록 */
export function Counsel({ db, S, add, del }) {
  const [sid, setSid] = useState('');
  const stu = S.find((s) => s.id === sid);
  const name = (id) => db.students.find((s) => s.id === id)?.name ?? '(삭제됨)';
  const radios = (n, opts) => opts.map((o, i) => <label key={o} style={{ marginRight: 12 }}><input type="radio" name={n} value={o} defaultChecked={i === 0} />{o}</label>);
  return (
    <>
      <div className="tabs">
        <button className={sid === '' ? 'on' : ''} onClick={() => setSid('')}>전체</button>
        {S.map((s, i) => <button key={s.id} title={s.name} className={sid === s.id ? 'on' : ''} onClick={() => setSid(s.id)}>{numOf(s, i)}</button>)}
      </div>
      {stu && (
        <form key={sid} onSubmit={(e) => { const d = fd(e); if (d.text) { add('notes', { ...d, student_id: sid }); e.target.reset(); } }}>
          <h3>{stu.name}</h3>
          <div>날짜 <input type="date" name="date" defaultValue={today()} /></div>
          <div>대상 {radios('target', ['학생', '학부모', '친구'])}</div>
          <div>방법 {radios('method', ['면담', '전화', '문자/인터넷'])}</div>
          <textarea name="text" rows="5" placeholder="상담 내용" /><br /><button>저장</button>
        </form>
      )}
      {[...db.notes].filter((n) => !sid || n.student_id === sid).sort(dateDesc).map((n) => (
        <div className="card" key={n.id}>
          <b>{n.date}</b> · {name(n.student_id)} · {n.target} · {n.method} <Del onClick={() => del('notes', n.id)} />
          <div style={{ whiteSpace: 'pre-wrap' }}>{n.text}</div>
        </div>
      ))}
    </>
  );
}

/* 메모하기 */
export function Memos({ db, add, del }) {
  return (
    <>
      <form onSubmit={(e) => { const d = fd(e); if (d.content) { add('memos', d); e.target.reset(); } }}>
        <input name="title" placeholder="제목" size="30" /><br />
        <textarea name="content" rows="4" placeholder="메모" /><br /><button>저장</button>
      </form>
      {[...db.memos].reverse().map((m) => (
        <div className="card" key={m.id}><b>{m.title}</b> <Del onClick={() => del('memos', m.id)} /><div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div></div>
      ))}
    </>
  );
}

/* 성적 */
export function Grades({ db, S, add, del, setDb }) {
  const score = (tid, sid) => db.scores.find((x) => x.test_id === tid && x.student_id === sid)?.score ?? '';
  const avg = (sid) => {
    const a = db.tests.map((t) => score(t.id, sid)).filter((x) => x !== '' && x !== null);
    return a.length ? (a.reduce((p, c) => p + +c, 0) / a.length).toFixed(1) : '-';
  };
  const setScore = (test_id, student_id, val) => {
    const score = val === '' ? null : +val;
    setDb((d) => ({ ...d, scores: [...d.scores.filter((x) => !(x.test_id === test_id && x.student_id === student_id)), { test_id, student_id, score }] }));
    sb.from('scores').upsert({ test_id, student_id, score }).then(({ error }) => error && alert(error.message));
  };
  const csv = () => {
    const rows = [['번호', '이름', ...db.tests.map((t) => `${t.subject} ${t.name}`), '평균'],
      ...S.map((s, i) => [numOf(s, i), s.name, ...db.tests.map((t) => score(t.id, s.id)), avg(s.id)])];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')]));
    a.download = '성적.csv'; a.click();
  };
  return (
    <>
      <form onSubmit={(e) => { const d = fd(e); if (d.subject && d.name) add('tests', { ...d, date: d.date || null }); e.target.reset(); }}>
        <input name="subject" placeholder="과목" size="8" /><input name="name" placeholder="평가명 (예: 단원평가1)" size="20" /><input type="date" name="date" defaultValue={today()} />
        <button>평가 추가</button><button type="button" onClick={csv}>엑셀(CSV) 내보내기</button>
      </form>
      {S.length ? (
        <table><tbody>
          <tr><th>번호</th><th>이름</th>{db.tests.map((t) => <th key={t.id}>{t.subject}<br />{t.name}<br /><small>{t.date}</small> <Del onClick={() => del('tests', t.id)} /></th>)}<th>평균</th></tr>
          {S.map((s, i) => (
            <tr key={s.id}><td>{numOf(s, i)}</td><td>{s.name}</td>
              {db.tests.map((t) => <td key={t.id}><input type="number" min="0" max="100" value={score(t.id, s.id)} onChange={(e) => setScore(t.id, s.id, e.target.value)} /></td>)}
              <td>{avg(s.id)}</td></tr>
          ))}
        </tbody></table>
      ) : <p>먼저 학급명렬에서 학생을 추가하세요.</p>}
    </>
  );
}
