import './globals.css';

export const metadata = { title: '교사 플래너' };

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
