const CACHE_NAME = 'codeai-static-v1.274.2';
const ASSETS = [
'/',
'/styles.css',
'/app.js',
'/index.html',
'/manifest.json',
'/icons/icon-192x192.png', 
'/icons/icon-512x512.png'];
// 1. مرحلة التثبيت (Install)
self.addEventListener('install', (e) => {
  // تخزين الأصول الجديدة في الكاش الجديد
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  // تخطي الانتظار للانتقال مباشرة إلى حالة "الانتظار"
  self.skipWaiting(); 
});
// 2. مرحلة التفعيل (Activate) - لإزالة الكاش القديم
self.addEventListener('activate', (e) => {
    // كود تنظيف الكاش القديم
    const cacheWhitelist = [CACHE_NAME];
    e.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // يحذف أي كاش لا يتطابق مع CACHE_NAME الحالي
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
  );
});

// 3. استقبال رسالة التفعيل اليدوي من الصفحة
self.addEventListener('message', (event) => {
  // عندما تستقبل رسالة بنوع 'SKIP_WAITING' من index.html
  if (event.data && event.data.type === 'SKIP_WAITING') {
    // نطلب من Service Worker تخطي الانتظار وتفعيل نفسه فوراً
    self.skipWaiting();
  }
});

// 4. استراتيجية جلب البيانات (Fetch) - استخدام الكاش أولاً
self.addEventListener('fetch', (e) => {
  if(e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request)
      .then(r => r || fetch(e.request))
  );
});
