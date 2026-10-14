import './globals.css';

export const metadata = { title: '학급일지' };

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
