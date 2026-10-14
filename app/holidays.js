import KoreanLunarCalendar from 'korean-lunar-calendar';

// 연도별 공휴일 {'YYYY-MM-DD': 이름}. 음력(설날·추석·부처님오신날)은 변환으로 구하고 대체공휴일 규칙도 계산한다.
// 선거일·임시공휴일은 법으로 따로 정해지므로 EXTRA에 직접 추가해야 한다.
const EXTRA = { '2026-06-03': '지방선거일' };

const cache = {};
const iso = (d) => d.toLocaleDateString('sv');
const add = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const solar = (y, m, d) => { const c = new KoreanLunarCalendar(); c.setLunarDate(y, m, d, false); const s = c.getSolarCalendar(); return new Date(s.year, s.month - 1, s.day); };

export function holidays(year) {
  if (cache[year]) return cache[year];
  const H = {}, clash = new Set();
  const put = (d, name) => { const k = iso(d); if (H[k]) { H[k] += ' · ' + name; clash.add(k); } else H[k] = name; };

  const fixed = [[1, 1, '신정'], [3, 1, '삼일절'], [5, 5, '어린이날'], [6, 6, '현충일'], [8, 15, '광복절'], [10, 3, '개천절'], [10, 9, '한글날'], [12, 25, '성탄절']];
  if (year >= 2026) fixed.push([5, 1, '노동절'], [7, 17, '제헌절']);
  fixed.forEach(([m, d, n]) => put(new Date(year, m - 1, d), n));
  const seol = solar(year, 1, 1), chu = solar(year, 8, 15), buddha = solar(year, 4, 8);
  put(buddha, '부처님오신날');
  [-1, 0, 1].forEach((k) => { put(add(seol, k), k ? '설날 연휴' : '설날'); put(add(chu, k), k ? '추석 연휴' : '추석'); });

  // 대체공휴일 발생 조건
  //  - 설날·추석 연휴: 일요일과 겹칠 때 / 어린이날·삼일절·광복절·개천절·한글날·부처님오신날·성탄절: 토·일과 겹칠 때
  //  - 그 밖에 다른 공휴일과 겹치는 날마다 1일
  //  신정·현충일·노동절·제헌절은 대체공휴일이 없다.
  const triggers = [];
  [seol, chu].forEach((c) => { const days = [-1, 0, 1].map((k) => add(c, k)); if (days.some((d) => d.getDay() === 0)) triggers.push(days[2]); });
  [[5, 5], [3, 1], [8, 15], [10, 3], [10, 9], [12, 25]].forEach(([m, d]) => { const x = new Date(year, m - 1, d); if (x.getDay() === 0 || x.getDay() === 6) triggers.push(x); });
  if (buddha.getDay() === 0 || buddha.getDay() === 6) triggers.push(buddha);
  clash.forEach((k) => triggers.push(new Date(k + 'T00:00:00')));

  triggers.sort((a, b) => a - b).forEach((t) => {
    let d = add(t, 1);
    while (d.getDay() === 0 || d.getDay() === 6 || H[iso(d)]) d = add(d, 1);
    H[iso(d)] = '대체공휴일';
  });
  Object.entries(EXTRA).forEach(([k, v]) => { if (k.startsWith(String(year))) H[k] = v; });
  return (cache[year] = H);
}

export const holidayName = (dateStr) => holidays(+dateStr.slice(0, 4))[dateStr];
