import './globals.css';

export const metadata = {
  title: '학급일지',
  applicationName: '학급일지',
  appleWebApp: { capable: true, title: '학급일지', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png' },
};
export const viewport = { themeColor: '#5b5a8f', viewportFit: 'cover' };

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
