const DEFAULT_OPTIONS = {
  contentUrl: "content.json",
  mountSelector: "#app",
  enableViewTransitions: true,
  pollIntervalMs: 8000,
  onRouteChange: () => { }
};

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(isoValue) {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

class ObservableContentStore {
  constructor(contentUrl, intervalMs = 7000) {
    this.contentUrl = contentUrl;
    this.intervalMs = intervalMs;
    this.observers = new Set();
    this.data = null;
    this.signature = "";
    this.timerId = null;
  }

  subscribe(observer) {
    this.observers.add(observer);
    if (this.data) {
      observer(this.data);
    }
    return () => this.observers.delete(observer);
  }

  notify() {
    for (const observer of this.observers) {
      observer(this.data);
    }
  }

  async load({ force = false } = {}) {
    const cacheBust = force ? Date.now() : Math.floor(Date.now() / this.intervalMs);
    const separator = this.contentUrl.includes("?") ? "&" : "?";
    const requestUrl = `${this.contentUrl}${separator}v=${cacheBust}`;
    try {
      const response = await fetch(requestUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed to load content.json (${response.status})`);
      }

      const nextData = await response.json();
      const nextSignature = JSON.stringify(nextData);
      if (nextSignature !== this.signature) {
        this.signature = nextSignature;
        this.data = nextData;
        this.notify();
      }
      return this.data;
    } catch (e) {
      console.warn("Using offline fallback if available", e);
      return this.data; // Return stale data if fetch fails
    }
  }

  start() {
    if (this.timerId) {
      return;
    }
    this.timerId = window.setInterval(() => {
      this.load().catch((error) => {
        console.error("[BGM_Core] content observer poll failed", error);
      });
    }, this.intervalMs);
  }

  stop() {
    if (!this.timerId) {
      return;
    }
    window.clearInterval(this.timerId);
    this.timerId = null;
  }
}

class BGM_Core {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.mount = document.querySelector(this.options.mountSelector);
    this.nav = document.querySelector("#bottom-nav");
    this.routeTitle = document.querySelector("#route-title");

    if (!this.mount || !this.nav || !this.routeTitle) {
      throw new Error("BGM_Core mount points are missing in index.html");
    }

    this.store = new ObservableContentStore(this.options.contentUrl, this.options.pollIntervalMs);
    this.state = {
      content: null,
      articlesById: new Map(),
      currentRoute: "home",
      isNavigating: false
    };

    this.router = {
      home: () => this.renderHome(),
      latest: () => this.renderHome(),
      watch: () => this.renderHome(), // Alias for now
      article: (id) => this.renderArticle(id)
    };

    this.widgetRegistry = new Map([
      ["sparkline", (data) => this.renderSparklineWidget(data)],
      ["heat", (data) => this.renderHeatWidget(data)]
    ]);

    this.unsubscribeStore = this.store.subscribe((content) => this.onContentUpdate(content));
    this.nav.addEventListener("click", (event) => this.onNavClick(event));
    this.mount.addEventListener("click", (event) => this.onMountClick(event));
    window.addEventListener("hashchange", () => this.handleRouteChange());
  }

  async init() {
    await this.store.load({ force: true });
    this.store.start();
    this.handleRouteChange();
  }

  onContentUpdate(content) {
    this.state.content = content;
    this.state.articlesById = new Map((content.articles || []).map((article) => [article.id, article]));
    this.renderNavigation();
    if (!this.state.isNavigating) {
      // Re-render current route if we aren't mid-transition
      this.renderRoute(this.state.currentRoute);
    }
  }

  parseHashRoute() {
    const value = window.location.hash.replace(/^#/, "").trim();
    return value || this.state.content?.meta?.defaultRoute || "home";
  }

  normalizeRoute(routeCandidate) {
    if (["home", "latest", "watch"].includes(routeCandidate)) {
      return routeCandidate;
    }
    if (this.state.articlesById.has(routeCandidate)) {
      return routeCandidate;
    }
    return "home";
  }

  navigate(route) {
    const normalizedRoute = this.normalizeRoute(route);
    const targetHash = `#${normalizedRoute}`;
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
      return;
    }
    this.renderRoute(normalizedRoute);
  }

  handleRouteChange() {
    const requestedRoute = this.parseHashRoute();
    const normalizedRoute = this.normalizeRoute(requestedRoute);
    if (normalizedRoute !== requestedRoute) {
      this.navigate(normalizedRoute);
      return;
    }
    this.renderRoute(normalizedRoute);
  }

  onNavClick(event) {
    const button = event.target.closest("[data-route]");
    if (!button) {
      return;
    }
    const route = button.getAttribute("data-route") || "home";
    this.navigate(route);
  }

  onMountClick(event) {
    const target = event.target.closest("[data-route-link]");
    if (!target) {
      return;
    }
    const route = target.getAttribute("data-route-link");
    if (route) {
      this.navigate(route);
    }
  }

  renderNavigation() {
    const navItems = this.state.content?.navigation?.primary || [];
    this.nav.innerHTML = navItems
      .map(
        (item) => `
        <button class="nav-pill" data-route="${escapeHTML(item.id)}">
          ${escapeHTML(item.label)}
        </button>
      `
      )
      .join("");
    this.paintActiveNav(this.state.currentRoute);
  }

  renderRoute(route) {
    if (!this.state.content) return;

    // Prevent redundant rendering if simply validating hash
    // (though in this simple router, re-rendering is safe/idempotent)

    this.state.currentRoute = route;
    this.paintActiveNav(route);
    this.options.onRouteChange(route);

    const routeRenderer = () => {
      if (["home", "latest", "watch"].includes(route)) {
        this.routeTitle.textContent = "Editorial Theater";
        this.renderHome(route);
      } else {
        const article = this.state.articlesById.get(route);
        this.routeTitle.textContent = article?.kicker || "Featured";
        this.renderArticle(route);
      }
    };

    const commitDOM = () =>
      new Promise((resolve) => {
        window.requestAnimationFrame(() => {
          routeRenderer();
          resolve();
        });
      });

    this.state.isNavigating = true;
    if (this.options.enableViewTransitions && "startViewTransition" in document) {
      /* @ANTIGRAVITY_INJECT: [MORPHING_HERO_IMAGE_TRANSITION] */
      document
        .startViewTransition(() => commitDOM())
        .finished.finally(() => {
          this.state.isNavigating = false;
        });
    } else {
      commitDOM().finally(() => {
        this.state.isNavigating = false;
      });
    }
  }

  paintActiveNav(route) {
    // Map specific article routes back to 'home' or 'latest' if needed, though for now simple matching
    // For this UI, article view might not highlight any bottom nav, which is fine
    const activeRoute = ["home", "latest", "watch"].includes(route) ? route : null;
    for (const button of this.nav.querySelectorAll(".nav-pill")) {
      const isActive = button.getAttribute("data-route") === activeRoute;
      button.classList.toggle("is-active", isActive);
    }
  }

  renderHome(route = "home") {
    const content = this.state.content || {};
    const featuredIds = content.home?.featured || [];

    // Pick featured article
    const featuredId = featuredIds[0];
    const featuredArticle = this.state.articlesById.get(featuredId);

    // Build Hero
    let heroHtml = "";
    if (featuredArticle) {
      const transitionName = `hero-${featuredArticle.id}`;
      const heroSrc = featuredArticle.hero?.image?.src || "";

      heroHtml = `
          <div class="hero-section">
            <div class="hero-frame" data-route-link="${escapeHTML(featuredArticle.id)}">
                <img
                    class="hero-media"
                    src="${escapeHTML(heroSrc)}"
                    alt="${escapeHTML(featuredArticle.title)}"
                    style="view-transition-name: ${transitionName}"
                >
                <div class="hero-overlay">
                     <div class="chip-row">
                        <span class="chip">${escapeHTML(featuredArticle.kicker || "Featured")}</span>
                        <span class="chip">${featuredArticle.readingMinutes} min</span>
                     </div>
                     <h2 style="font-size: 1.8rem; margin: 0; line-height: 1.1;">${escapeHTML(featuredArticle.title)}</h2>
                     <p style="color: var(--text-muted); margin-top: 8px;">${escapeHTML(featuredArticle.dek)}</p>
                </div>
            </div>
          </div>
        `;
    }

    // Build Rails
    const railsConfig = content.home?.rails || [];
    const railsHtml = railsConfig.map(rail => this.renderRail(rail)).join("");

    this.mount.innerHTML = `
      <section class="home-grid">
        ${heroHtml}
        ${railsHtml}
      </section>
    `;
  }

  renderRail(railConfig) {
    const items = railConfig.items || [];
    const articles = items.map(id => this.state.articlesById.get(id)).filter(Boolean);

    if (articles.length === 0) return "";

    const cardTypeClass = railConfig.type === "videos" ? "card-video" :
      railConfig.type === "clips" ? "card-poster" : "card-standard";

    const cardsHtml = articles.map(article => {
      const heroSrc = article.hero?.image?.src || "";

      return `
            <div class="rail-card ${cardTypeClass}" data-route-link="${escapeHTML(article.id)}">
                <img class="card-media" src="${escapeHTML(heroSrc)}" loading="lazy" alt="">
                <div class="card-content">
                    <h3 class="card-title">${escapeHTML(article.title)}</h3>
                    <div class="card-meta">
                        <span>${escapeHTML(article.kicker || "Story")}</span>
                        ${railConfig.type === 'videos' && article.duration ?
          `• <span>${escapeHTML(article.duration)}</span>` :
          `• <span>${article.readingMinutes} min</span>`}
                    </div>
                </div>
            </div>
          `;
    }).join("");

    return `
        <div class="rail-section">
            <div class="rail-header">
                ${escapeHTML(railConfig.title)}
            </div>
            <div class="rail-container">
                ${cardsHtml}
            </div>
        </div>
      `;
  }

  renderArticle(id) {
    const article = this.state.articlesById.get(id);
    if (!article) {
      this.renderHome();
      return;
    }

    const widgetsById = new Map((article.widgets || []).map((widget) => [widget.id, widget]));
    const transitionName = `hero-${article.id}`;
    const heroSrc = article.hero?.image?.src || "";

    // Render Blocks
    const blocksHtml = (article.blocks || [])
      .map((block) => {
        if (block.type === "paragraph") {
          return `<p>${escapeHTML(block.text)}</p>`;
        }
        if (block.type === "heading") {
          const level = Math.min(Math.max(Number(block.level) || 2, 2), 4);
          return `<h${level}>${escapeHTML(block.text)}</h${level}>`;
        }
        if (block.type === "widget") {
          const widget = widgetsById.get(block.widgetRef);
          if (!widget) return "";

          const widgetPayload = widget.data || article.widget_data?.[widget.dataRef || ""] || { label: "Missing Data" };

          return `
            <section class="widget-slot" data-widget="${escapeHTML(widget.type)}">
              ${this.renderWidget(widget.type, widgetPayload)}
            </section>
          `;
        }
        if (block.type === "image") {
          return `
            <figure class="widget-slot" style="padding:0; overflow:hidden; border:none;">
              <img
                src="${escapeHTML(block.src || "")}"
                alt="${escapeHTML(block.alt || "")}"
                style="width:100%; display:block;"
                loading="lazy"
              >
              ${block.caption ? `<figcaption class="widget-title" style="padding:12px;">${escapeHTML(block.caption)}</figcaption>` : ""}
            </figure>
          `;
        }
        return "";
      })
      .join("");

    this.mount.innerHTML = `
      <article class="article-shell">
        <div class="article-hero">
            <img
                class="hero-media"
                src="${escapeHTML(heroSrc)}"
                alt="${escapeHTML(article.title)}"
                style="view-transition-name: ${transitionName}"
            >
        </div>
        
        <div class="article-header">
             <div class="chip-row">
                <span class="chip">${escapeHTML(article.kicker || "Featured")}</span>
                <span class="chip">${formatDate(article.publishedAt)}</span>
             </div>
             <h1 class="article-title">${escapeHTML(article.title)}</h1>
             <p class="article-dek">${escapeHTML(article.dek || "")}</p>
        </div>

        <div class="article-body">
            ${blocksHtml}
        </div>
      </article>
    `;

    // Scroll to top of article
    this.mount.closest('.route-shell').scrollTop = 0;
  }

  renderWidget(type, data) {
    const renderer = this.widgetRegistry.get(type);
    if (!renderer) {
      return `
        <span class="widget-title">Unsupported: ${escapeHTML(type)}</span>
        <span class="widget-placeholder"></span>
      `;
    }
    return renderer(data);
  }

  renderSparklineWidget(data) {
    const points = Array.isArray(data.points) ? data.points.map((value) => Number(value) || 0) : [0, 0];
    const max = Math.max(...points, 1);
    const min = Math.min(...points, 0);
    const range = Math.max(max - min, 1);
    const polyline = points
      .map((point, index) => {
        const x = (index / Math.max(points.length - 1, 1)) * 100;
        const y = 100 - ((point - min) / range) * 100;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");

    /* @ANTIGRAVITY_INJECT: [SPARKLINE_SVG_PATH_DRAW] */
    return `
      <span class="widget-title">${escapeHTML(data.label || "Sparkline")}</span>
      <span class="widget-placeholder">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style="overflow:visible">
          <polyline
            fill="none"
            stroke="${escapeHTML(data.color || "#D4AF37")}"
            stroke-width="2"
            vector-effect="non-scaling-stroke"
            points="${polyline}"
          ></polyline>
        </svg>
      </span>
    `;
  }

  renderHeatWidget(data) {
    const riskScale = Array.isArray(data.riskScale) ? data.riskScale : ["Low", "Moderate", "High", "Severe"];
    const activeIndex = Math.min(
      Math.max(Number(data.currentIndex) || 0, 0),
      Math.max(riskScale.length - 1, 0)
    );
    const bars = riskScale
      .map((label, index) => {
        const isActive = index <= activeIndex;
        const opacity = isActive ? 0.9 : 0.15;
        // Simple heatmap gradient logic
        const hue = 60 - (index * 20); // Yellow to Red-ish
        return `<rect x="${index * 25}" y="${isActive ? 20 : 40}" width="20" height="${isActive ? 60 : 40}" rx="4" fill="hsla(${hue}, 80%, 50%, ${opacity})"></rect>`;
      })
      .join("");

    /* @ANTIGRAVITY_INJECT: [HEATMAP_GLOW_AND_PULSE] */
    return `
      <span class="widget-title">${escapeHTML(data.label || "Heat Index")}</span>
      <span class="widget-placeholder">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          ${bars}
        </svg>
      </span>
    `;
  }
}

window.BGM_Core = BGM_Core;

const bgmApp = new BGM_Core();
bgmApp.init().catch((error) => {
  console.error("[BGM_Core] init failed", error);
  const mount = document.querySelector("#app");
  if (mount) {
    mount.innerHTML = `<p>Engine init failed. Check console for details.</p>`;
  }
});
