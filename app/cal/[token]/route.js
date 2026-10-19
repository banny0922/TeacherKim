import { createClient } from '@supabase/supabase-js';

// 구글 캘린더 '구독 URL'용 ICS. 주소 속 비밀 토큰(uuid)으로 그 선생님의 학사일정만 내보낸다.
export const dynamic = 'force-dynamic';

const esc = (s) => String(s ?? '').split('\\').join('\\\\').split(';').join('\\;').split(',').join('\\,').split(/\r?\n/).join('\\n');
const ymd = (d) => d.replaceAll('-', '');
const nextDay = (d) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };

export async function GET(_req, ctx) {
  const { token } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response('Not found', { status: 404 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data, error } = await sb.rpc('ics_events', { t: token });
  if (error) return new Response('Error', { status: 500 });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TeacherKim//ko', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:학급일지 학사일정', 'X-WR-TIMEZONE:Asia/Seoul', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
  for (const e of data ?? []) {
    const [first, ...rest] = String(e.title).split(/\r?\n/);
    lines.push('BEGIN:VEVENT', `UID:${e.id}@teacher-kim`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${ymd(nextDay(e.date))}`, `SUMMARY:${esc(first)}`);
    if (rest.some(Boolean)) lines.push(`DESCRIPTION:${esc(rest.join('\n'))}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return new Response(lines.join('\r\n') + '\r\n', { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' } });
}
