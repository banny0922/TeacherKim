export default function manifest() {
  return {
    name: '학급일지',
    short_name: '학급일지',
    description: '학급 운영 일정·성적·상담 기록',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#5b5a8f',
    lang: 'ko',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
