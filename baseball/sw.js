// 홈 화면 설치용 최소 서비스 워커 — 아무것도 저장하지 않고 그대로 인터넷에서 받는다(항상 최신 판)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
