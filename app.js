const App = {
    data: null,
    container: document.getElementById('app'),

    async init() {
        try {
            // Fetch content with cache-busting
            const res = await fetch(`content.json?t=${Date.now()}`);
            this.data = await res.json();

            // Handle Navigation
            window.addEventListener('popstate', () => this.router());
            window.addEventListener('scroll', this.handleScroll);
            this.router();
        } catch (e) {
            console.error(e);
            this.container.innerHTML = `<h1 style="color:white; text-align:center; margin-top:40vh">System Offline</h1>`;
        }
    },

    async router() {
        const params = new URLSearchParams(window.location.search);
        const articleSlug = params.get('article');

        // Use View Transition API if available
        if (document.startViewTransition) {
            await document.startViewTransition(() => {
                this.updateView(articleSlug);
                window.scrollTo(0, 0);
            }).updateCallbackDone;
        } else {
            this.updateView(articleSlug);
            window.scrollTo(0, 0);
        }
    },

    updateView(articleSlug) {
        if (articleSlug) {
            this.renderArticle(articleSlug);
        } else {
            this.renderHome();
        }
    },

    /* --- HOME VIEW --- */
    renderHome() {
        const { featured, categories } = this.data;

        // Handle Hero Media (Image or Video)
        let heroMedia = '';
        if (featured.videoBrief) {
            // Using a loop for cinematic effect if video exists
            heroMedia = `
                <video class="hero-bg" autoplay muted loop playsinline poster="${featured.image}">
                    <source src="https://www.youtube.com/embed/${featured.videoBrief}?autoplay=1&mute=1&controls=0&loop=1&playlist=${featured.videoBrief}" type="video/mp4"> 
                    <!-- Fallback to image -->
                    <img src="${featured.image}" class="hero-bg">
                </video>`;
        } else {
            heroMedia = `<img src="${featured.image}" class="hero-bg">`;
        }

        // Cleaned up for fallback since YouTube embeds don't loop nicely in video tags without direct MP4
        // Reverting to Image for stability unless we have direct MP4
        heroMedia = `<img src="${featured.image}" class="hero-bg">`;

        let html = `
            <nav class="nav-bar" id="navbar">
                <div class="brand">BGM</div>
            </nav>

            <header class="hero-section">
                ${heroMedia}
                <div class="hero-overlay"></div>
                <div class="hero-content">
                    <span class="hero-tag">Featured Story</span>
                    <h1 class="hero-title">${featured.headline}</h1>
                    <p class="hero-sub">${featured.subhead}</p>
                    <div>
                        <button onclick="App.nav('${featured.linkId}')" class="btn btn-primary">Read Story</button>
                    </div>
                </div>
            </header>
            
            <div class="feed-section">
        `;

        // CATEGORIES RENDERER
        categories.forEach(cat => {
            html += `
                <div class="section-header">
                    <h2>${cat.title}</h2>
                    <span>${cat.type === 'shorts' ? 'INSTAGRAM REELS' : 'SCROLL'}</span>
                </div>
                <div class="carousel">
            `;

            cat.items.forEach(item => {
                // TYPE 1: CLIPS (Shorts)
                if (cat.type === 'shorts') {
                    const link = item.link || `https://instagram.com/reel/${item.id}`;
                    html += `
                        <a href="${link}" target="_blank" class="card card-clip">
                            <img src="${item.image}" loading="lazy">
                            <div class="clip-overlay">
                                <span class="clip-icon">▶</span>
                                <div class="clip-title">${item.title}</div>
                            </div>
                        </a>`;
                }
                // TYPE 2: WIDGETS (Live Data)
                else if (cat.type === 'widgets') {
                    html += this.renderWidgetCard(item);
                }
                // TYPE 3: STANDARD ARTICLES
                else {
                    html += `
                        <div class="card card-std" onclick="App.nav('${item.id}')">
                            <img src="${item.image}" loading="lazy" style="view-transition-name: thumb-${item.id}">
                            <div class="card-info">
                                <span class="card-tag">${item.category || 'Article'}</span>
                                <h3 class="card-title">${item.title}</h3>
                            </div>
                        </div>`;
                }
            });
            html += `</div><br>`;
        });

        html += `</div>`; // End Feed
        this.container.innerHTML = html;
        this.animateWidgets();
    },

    /* --- ARTICLE VIEW --- */
    renderArticle(id) {
        const art = this.data.articles[id];
        if (!art) return this.router(); // Safety redirect if not found

        // Dynamic Back Button
        let html = `
            <button onclick="history.back()" class="nav-back">←</button>
            <article class="article-view">
                <header class="art-hero">
                    <img src="${art.hero}" style="view-transition-name: thumb-${id}">
                    <div class="hero-overlay"></div>
                    <div class="art-header">
                        <span class="hero-tag">${art.label || 'CINEMATIC'}</span>
                        <h1 class="art-h1">${art.title}</h1>
                        <p style="color:var(--text-muted); font-size:1.1rem">${art.sub || ''}</p>
                    </div>
                </header>
                <div class="art-body">
        `;

        // BLOCK RENDERER
        if (art.blocks) {
            art.blocks.forEach(b => {
                if (b.type === 'text') {
                    html += `<p class="block-text">${b.content}</p>`;
                }
                else if (b.type === 'image') {
                    html += `
                        <div class="block-media">
                            <img src="${b.content}" loading="lazy">
                        </div>`;
                }
                else if (b.type === 'video') {
                    let vidId = b.content;
                    if (vidId.includes('v=')) vidId = vidId.split('v=')[1];
                    html += `
                        <div class="block-media" style="aspect-ratio:16/9; position:relative;">
                            <iframe src="https://www.youtube.com/embed/${vidId}" 
                                style="position:absolute; inset:0; width:100%; height:100%; border:none;" 
                                allowfullscreen>
                            </iframe>
                        </div>`;
                }
                else if (b.type === 'infographic') {
                    html += `
                        <div class="block-data">
                            <span class="hero-tag" style="background:rgba(255,255,255,0.1); color:#fff">LIVE DATA</span>
                            <h3 style="margin:10px 0 0">${b.caption || 'Data Visualization'}</h3>
                            <div class="data-bar-wrap">
                                <div class="data-bar" data-h="40%"></div>
                                <div class="data-bar" data-h="75%"></div>
                                <div class="data-bar" data-h="55%"></div>
                                <div class="data-bar" data-h="90%" style="background:#fff; box-shadow:0 0 15px white;"></div>
                                <div class="data-bar" data-h="60%"></div>
                            </div>
                        </div>`;
                }
            });
        }

        html += `</div></article>`;
        this.container.innerHTML = html;
        this.animateWidgets();
    },

    /* --- HELPERS & WIDGETS --- */
    renderWidgetCard(item) {
        // Placeholder for Sparklines / Heatmaps in the carousel
        let content = '';
        if (item.type === 'sparkline') {
            content = `<svg viewBox="0 0 100 40" class="spark-line" style="width:100%; height:80px; stroke:var(--accent); fill:none; stroke-width:3;">
                <path d="M0 20 Q 25 5, 50 20 T 100 20" />
             </svg>`;
        } else if (item.type === 'heat') {
            content = `<div style="display:flex; gap:2px; height:80px; align-items:flex-end;">
                <div style="flex:1; height:30%; background:#222"></div>
                <div style="flex:1; height:50%; background:#333"></div>
                <div style="flex:1; height:80%; background:var(--accent)"></div>
                <div style="flex:1; height:40%; background:#444"></div>
             </div>`;
        }

        return `
            <div class="card card-std" style="background:#111; display:flex; flex-direction:column; justify-content:center; padding:1.5rem;">
                <div style="font-size:0.75rem; color:#888; text-transform:uppercase; margin-bottom:1rem;">${item.title}</div>
                ${content}
            </div>
        `;
    },

    animateWidgets() {
        // Animate Data Bars
        requestAnimationFrame(() => {
            document.querySelectorAll('.data-bar').forEach(bar => {
                const h = bar.getAttribute('data-h');
                if (h) bar.style.height = h;
            });
        });
    },

    nav(id) {
        const url = `?article=${id}`;
        window.history.pushState({ path: url }, '', url);
        this.router();
    },

    handleScroll() {
        const nav = document.getElementById('navbar');
        if (nav) {
            if (window.scrollY > 50) nav.classList.add('scrolled');
            else nav.classList.remove('scrolled');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
