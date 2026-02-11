const DEFAULT_OPTIONS = {
  contentUrl: "content.json",
  mountSelector: "#app",
  enableViewTransitions: true,
  pollIntervalMs: 7000,
  onRouteChange: () => {}
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
    month: "short",
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
    this.handleRouteChange();
  }

  parseHashRoute() {
    const value = window.location.hash.replace(/^#/, "").trim();
    return value || this.state.content?.meta?.defaultRoute || "home";
  }

  normalizeRoute(routeCandidate) {
    if (routeCandidate === "home" || routeCandidate === "latest") {
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
    const navItems =
      this.state.content?.navigation?.primary ||
      [
        { id: "home", label: "Home", href: "#home" },
        { id: "latest", label: "Latest", href: "#latest" }
      ];

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
    if (!this.state.content || this.state.isNavigating) {
      return;
    }

    this.state.currentRoute = route;
    this.paintActiveNav(route);
    this.options.onRouteChange(route);

    const routeRenderer = () => {
      if (route === "home" || route === "latest") {
        this.routeTitle.textContent = "Editorial Theater";
        this.renderHome(route);
      } else {
        const article = this.state.articlesById.get(route);
        this.routeTitle.textContent = article?.kicker || "Featured";
        this.router.article(route);
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
    const activeRoute = route === "latest" ? "latest" : route === "home" ? "home" : null;
    for (const button of this.nav.querySelectorAll(".nav-pill")) {
      const isActive = button.getAttribute("data-route") === activeRoute;
      button.classList.toggle("is-active", isActive);
    }
  }

  renderHome(route = "home") {
    const content = this.state.content || {};
    const featuredIds = content.home?.featured || [];
    const feedItems = content.home?.feed || [];
    const featuredId = route === "latest" ? feedItems[0]?.articleId : featuredIds[0] || feedItems[0]?.articleId;
    const featuredArticle = this.state.articlesById.get(featuredId);

    if (!featuredArticle) {
      this.mount.innerHTML = `
        <section class="home-grid">
          <article class="card feature-card">
            <div class="feature-copy">
              <h2>No featured story available</h2>
              <p>Update <code>content.json</code> from BGMstudio Control Room to publish an entry.</p>
            </div>
          </article>
        </section>
      `;
      return;
    }

    const transitionName = `hero-${featuredArticle.id.replace(/[^a-z0-9-]/gi, "")}`;
    const heroSrc = featuredArticle.hero?.image?.src || "";
    const heroAlt = featuredArticle.hero?.image?.alt || featuredArticle.title;
    const readingMinutes = Number(featuredArticle.readingMinutes) || 5;
    const feedCards = feedItems
      .map((item) => this.state.articlesById.get(item.articleId))
      .filter(Boolean)
      .map(
        (article) => `
          <article class="card">
            <div class="feature-copy">
              <div class="chip-row">
                <span class="chip">${escapeHTML(article.kicker || "Coverage")}</span>
                <span class="chip">${escapeHTML(String(article.readingMinutes || 4))} min</span>
              </div>
              <h2>${escapeHTML(article.title)}</h2>
              <p>${escapeHTML(article.dek || "")}</p>
              <button class="nav-pill" data-route-link="${escapeHTML(article.id)}">Open Story</button>
            </div>
          </article>
        `
      )
      .join("");

    this.mount.innerHTML = `
      <section class="home-grid">
        <article class="card feature-card">
          <button class="hero-frame" data-route-link="${escapeHTML(featuredArticle.id)}">
            <img
              class="hero-media"
              src="${escapeHTML(heroSrc)}"
              alt="${escapeHTML(heroAlt)}"
              loading="lazy"
              style="view-transition-name: ${transitionName};"
            >
          </button>
          <div class="feature-copy">
            <div class="chip-row">
              <span class="chip">${escapeHTML(featuredArticle.kicker || "Featured")}</span>
              <span class="chip">${readingMinutes} min</span>
            </div>
            <h2>${escapeHTML(featuredArticle.title)}</h2>
            <p>${escapeHTML(featuredArticle.dek || "")}</p>
          </div>
        </article>
        ${feedCards}
      </section>
    `;
  }

  renderArticle(id) {
    const article = this.state.articlesById.get(id);
    if (!article) {
      this.renderHome();
      return;
    }

    const widgetsById = new Map((article.widgets || []).map((widget) => [widget.id, widget]));
    const transitionName = `hero-${article.id.replace(/[^a-z0-9-]/gi, "")}`;
    const heroSrc = article.hero?.image?.src || "";
    const heroAlt = article.hero?.image?.alt || article.title;

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
          if (!widget) {
            return "";
          }
          const widgetPayload =
            widget.data ||
            article.widget_data?.[widget.dataRef || ""] || {
              label: "Missing widget payload"
            };
          return `
            <section class="widget-slot" data-widget="${escapeHTML(widget.type)}">
              ${this.renderWidget(widget.type, widgetPayload)}
            </section>
          `;
        }
        if (block.type === "image") {
          return `
            <figure class="widget-slot">
              <img
                class="hero-media"
                src="${escapeHTML(block.src || "")}"
                alt="${escapeHTML(block.alt || "")}"
                loading="${escapeHTML(block.loading || "lazy")}"
              >
              <figcaption class="widget-title">${escapeHTML(block.caption || "")}</figcaption>
            </figure>
          `;
        }
        return "";
      })
      .join("");

    this.mount.innerHTML = `
      <article class="article-shell card">
        <div class="hero-frame">
          <img
            class="hero-media"
            src="${escapeHTML(heroSrc)}"
            alt="${escapeHTML(heroAlt)}"
            loading="lazy"
            style="view-transition-name: ${transitionName};"
          >
        </div>
        <div class="article-meta">
          <div class="chip-row">
            <span class="chip">${escapeHTML(article.kicker || "Featured")}</span>
            <span class="chip">${escapeHTML(formatDate(article.publishedAt))}</span>
          </div>
          <h2>${escapeHTML(article.title)}</h2>
          <p>${escapeHTML(article.dek || "")}</p>
        </div>
        <section class="article-content">
          ${blocksHtml}
        </section>
      </article>
    `;
  }

  renderWidget(type, data) {
    const renderer = this.widgetRegistry.get(type);
    if (!renderer) {
      return `
        <span class="widget-title">Unsupported widget: ${escapeHTML(type)}</span>
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
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline
            fill="none"
            stroke="${escapeHTML(data.color || "#D4AF37")}"
            stroke-width="2.5"
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
        const strength = index <= activeIndex ? 0.85 : 0.2;
        return `<rect x="${index * 25}" y="${20 + index * 6}" width="18" height="${65 - index * 6}" fill="rgba(212,175,55,${strength})"></rect>`;
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
