export const metadata = { title: '앱으로 설치하기 · 학급일지' };

const S = { maxWidth: 720, margin: '0 auto', padding: '28px 18px 60px', lineHeight: 1.8, color: '#333', fontSize: 16 };
const box = { border: '1px solid #e3e5ef', borderRadius: 14, padding: '6px 18px 14px', margin: '0 0 18px', background: '#fff' };
const note = { background: '#f4f5fb', borderRadius: 10, padding: '10px 14px', fontSize: 14, color: '#555' };

export default function Guide() {
  return (
    <main style={S}>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>학급일지를 앱처럼 설치하기</h1>
      <p style={{ color: '#666', marginTop: 0 }}>스토어에서 받는 것이 아니라, 사이트를 <b>홈 화면에 추가</b>하면 앱 아이콘이 생기고 주소창 없이 전체 화면으로 열립니다. 무료이고 1분이면 됩니다.</p>

      <div style={note}>
        <b>사이트 주소</b>: <a href="https://teacher-kim.vercel.app">https://teacher-kim.vercel.app</a><br />
        설치한 뒤에도 같은 이메일·비밀번호로 로그인하면 컴퓨터와 <b>같은 데이터</b>가 보입니다.
      </div>

      <h2 style={{ marginTop: 28 }}>아이폰 · 아이패드 (사파리)</h2>
      <div style={box}>
        <p style={{ color: '#c0392b', fontSize: 14 }}>※ 반드시 <b>사파리</b>로 열어야 합니다. 크롬·네이버 앱에서는 "홈 화면에 추가"가 앱 모양으로 되지 않습니다.</p>
        <ol>
          <li>사파리에서 위 주소를 엽니다.</li>
          <li><b>공유 버튼</b>(네모에서 위로 화살표가 나온 모양)을 누릅니다.
            <br /><small>아이폰은 화면 아래 가운데, 아이패드는 주소창 오른쪽 위에 있습니다.</small></li>
          <li>목록을 아래로 내려서 <b>"홈 화면에 추가"</b>를 누릅니다.</li>
          <li>이름이 <b>학급일지</b>로 나오면 오른쪽 위 <b>추가</b>를 누릅니다.</li>
          <li>홈 화면에 생긴 <b>학급일지 아이콘</b>으로 열면 앱처럼 열립니다.</li>
        </ol>
      </div>

      <h2>안드로이드 (크롬)</h2>
      <div style={box}>
        <ol>
          <li>크롬에서 위 주소를 엽니다.</li>
          <li>오른쪽 위 <b>점 세 개(⋮)</b> 메뉴를 누릅니다.</li>
          <li><b>"앱 설치"</b> 또는 <b>"홈 화면에 추가"</b>를 누릅니다.</li>
          <li>안내가 뜨면 <b>설치</b>를 누릅니다. 홈 화면에 아이콘이 생깁니다.</li>
        </ol>
      </div>

      <h2>컴퓨터 (크롬·엣지)</h2>
      <div style={box}>
        <ol>
          <li>주소창 오른쪽 끝의 <b>설치 아이콘</b>(모니터에 아래 화살표)을 누릅니다.</li>
          <li>또는 메뉴(⋮) → <b>학급일지 설치</b>를 누릅니다.</li>
        </ol>
      </div>

      <h2>자주 묻는 질문</h2>
      <div style={box}>
        <p><b>"홈 화면에 추가"가 안 보여요.</b><br />아이폰·아이패드는 사파리에서만 보입니다. 사파리로 주소를 다시 열어 보세요.</p>
        <p><b>로그인이 안 돼요.</b><br />컴퓨터에서 쓰던 이메일과 비밀번호를 그대로 입력합니다. 처음이면 로그인 화면의 "처음이세요? 회원가입"으로 가입합니다.</p>
        <p><b>아이콘이나 화면이 예전 모양이에요.</b><br />앱을 완전히 종료했다가 다시 열거나, 사이트를 한 번 새로고침해 보세요.</p>
        <p><b>구글 캘린더 연동이 안 돼요.</b><br />홈 화면 앱으로 연 상태에서는 구글 허용 창이 안 뜰 수 있습니다. 사파리(또는 크롬)에서 사이트를 직접 열어서 하세요.</p>
        <p><b>삭제하고 싶어요.</b><br />아이콘을 길게 눌러 삭제하면 됩니다. 입력한 데이터는 사이트에 그대로 남아 있습니다.</p>
      </div>

      <p style={{ color: '#888', fontSize: 14 }}>문의: banny0922@gmail.com</p>
    </main>
  );
}
