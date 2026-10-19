export const metadata = { title: '개인정보처리방침 · 학급일지' };

const S = { maxWidth: 760, margin: '40px auto', padding: '0 20px', lineHeight: 1.8, color: '#333' };

export default function Privacy() {
  return (
    <main style={S}>
      <h1>학급일지 개인정보처리방침</h1>
      <p>최종 수정일: 2026년 10월 19일</p>

      <h2>1. 수집하는 정보</h2>
      <p>학급일지(이하 &quot;서비스&quot;)는 로그인에 쓰는 이메일 주소, 그리고 이용자가 직접 입력한 학사일정·시간표·성적·상담기록·메모 등의 학급 운영 기록을 저장합니다. 이 기록은 이용자 본인에게만 보이며 다른 이용자와 공유되지 않습니다.</p>

      <h2>2. 이용 목적</h2>
      <p>입력한 기록을 이용자에게 다시 보여 주기 위해서만 사용합니다. 광고, 분석, 제3자 제공 목적으로 사용하지 않습니다.</p>

      <h2>3. 구글 캘린더 연동 (선택 기능)</h2>
      <p>이용자가 &quot;구글 캘린더로 보내기&quot; 또는 &quot;구글 캘린더에서 가져오기&quot;를 직접 눌렀을 때에만 구글 계정 접근을 요청합니다. 요청하는 권한은 보내는 방식에 따라 다음과 같습니다.</p>
      <ul>
        <li>앱이 직접 만든 &quot;학급일지&quot; 캘린더의 일정 생성·수정 (calendar.app.created)</li>
        <li>이용자가 &quot;내 기존 캘린더에 추가&quot;를 고른 경우에만, 그 캘린더에 일정을 추가·수정 (calendar.events)</li>
        <li>이용자가 &quot;구글 캘린더에서 가져오기&quot;를 누른 경우에만, 기본 캘린더의 이번 학년도 일정을 읽기 전용으로 조회 (calendar.events.readonly)</li>
        <li>캘린더가 둘 이상일 때 고를 수 있도록 이용자 캘린더 목록(이름) 조회 (calendar.calendarlist.readonly)</li>
      </ul>
      <p>서비스는 이용자가 보내기·가져오기를 누른 경우 외에는 구글 캘린더의 일정을 읽거나 고치지 않으며, 가져온 일정은 이용자의 학사일정으로만 저장합니다. 구글 접근 토큰은 이용자의 브라우저에서만 사용되며 서버에 저장하지 않습니다. 서비스의 구글 사용자 데이터 사용은 제한된 사용(Limited Use) 요구사항을 포함한 <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API 서비스 사용자 데이터 정책</a>을 준수합니다.</p>

      <h2>4. 보관 및 삭제</h2>
      <p>기록은 이용자가 삭제하거나 탈퇴를 요청할 때까지 보관합니다. 삭제나 탈퇴를 원하시면 아래 연락처로 요청해 주세요. 구글 쪽 연결은 구글 계정의 &quot;보안 &gt; 타사 앱 및 서비스&quot;에서 언제든 해제할 수 있습니다.</p>

      <h2>5. 저장 위치</h2>
      <p>데이터는 클라우드 데이터베이스(Supabase)에 저장되며, 이용자별로 접근이 분리되어 있습니다.</p>

      <h2>6. 문의</h2>
      <p>개인정보 관련 문의: banny0922@gmail.com</p>
    </main>
  );
}
