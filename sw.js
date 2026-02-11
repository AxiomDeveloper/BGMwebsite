self.addEventListener('fetch', (event) => {
    // Simple pass-through for now to satisfy PWA requirements
    event.respondWith(fetch(event.request));
});
