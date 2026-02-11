# BGM Engine Specification (Sprint 0)

## 1) Scope
This spec defines:
- The JSON contract for `content.json` (local headless CMS source).
- The public API signatures for `BGM_Engine` in `main.js`.

Out of scope for this document:
- Full implementation code.
- Final animation design details.

## 2) Runtime + Delivery Constraints
- Platform: GitHub Pages (static hosting).
- Stack: Vanilla JS, HTML5, CSS3 only.
- App model: SPA with hash routing (`#<article-id>`).
- Rendering target: 60fps updates using `requestAnimationFrame` for UI mutations/transitions.
- Asset strategy: lazy-load non-critical assets (images, videos, heavy widgets).
- Mobile UX: primary interactions reachable in bottom ~40% viewport; no 300ms tap delay.

## 3) `content.json` Contract

### 3.1 Top-Level Shape
```json
{
  "meta": {
    "siteName": "Breaking Ground Media",
    "version": "1.0.0",
    "generatedAt": "2026-02-11T00:00:00.000Z",
    "defaultRoute": "home"
  },
  "navigation": {
    "primary": [
      { "id": "home", "label": "Home", "href": "#home", "icon": "grid" },
      { "id": "latest", "label": "Latest", "href": "#latest", "icon": "bolt" }
    ]
  },
  "home": {
    "headline": "Top Stories",
    "featured": ["article-id-1"],
    "feed": [
      {
        "articleId": "article-id-1",
        "priority": 1,
        "layout": { "colSpan": 2, "rowSpan": 2, "aspect": "16:9" }
      }
    ]
  },
  "articles": [
    {
      "id": "article-id-1",
      "slug": "sample-story",
      "title": "Story Title",
      "dek": "Short summary",
      "kicker": "Investigations",
      "authors": ["Reporter Name"],
      "publishedAt": "2026-02-10T16:00:00.000Z",
      "updatedAt": "2026-02-11T09:00:00.000Z",
      "readingMinutes": 7,
      "tags": ["policy", "climate"],
      "hero": {
        "image": {
          "src": "assets/hero/story-1.jpg",
          "alt": "Descriptive alt text",
          "width": 1920,
          "height": 1080,
          "loading": "lazy"
        },
        "video": null
      },
      "widgets": [
        {
          "id": "widget-1",
          "type": "sparkline",
          "data": {
            "label": "Approval",
            "points": [32, 35, 33, 39, 41],
            "unit": "%",
            "color": "#D4AF37"
          }
        }
      ],
      "blocks": [
        { "type": "paragraph", "text": "Lead paragraph..." },
        { "type": "heading", "level": 2, "text": "Section Header" },
        {
          "type": "widget",
          "widgetRef": "widget-1"
        },
        {
          "type": "image",
          "src": "assets/body/story-1-1.jpg",
          "alt": "Body image alt",
          "caption": "Photo caption",
          "credit": "Photo Credit",
          "width": 1600,
          "height": 900,
          "loading": "lazy"
        }
      ],
      "seo": {
        "description": "Meta description",
        "ogImage": "assets/og/story-1.jpg"
      }
    }
  ]
}
```

### 3.2 Required Fields
- `meta.siteName`, `meta.version`, `meta.generatedAt`.
- `home.feed[]` entries with `articleId` and `layout`.
- `articles[]` entries with:
  - `id` (must match hash route key).
  - `title`, `publishedAt`, `blocks[]`.
- Any `blocks[]` item of `type: "widget"` must include `widgetRef` that exists in `article.widgets[]`.

### 3.3 ID and Routing Rules
- `articles[].id` must be unique and URL-safe (`[a-z0-9-]+`).
- Route mapping:
  - `#home` or empty hash -> home feed.
  - `#<article-id>` -> article view.
  - Unknown hash -> fallback to home.

### 3.4 Widget Data Schemas

#### `sparkline`
```json
{
  "label": "string",
  "points": [0, 1, 2],
  "unit": "string",
  "color": "#D4AF37"
}
```

#### `heatmap`
```json
{
  "xLabels": ["Mon", "Tue"],
  "yLabels": ["AM", "PM"],
  "values": [[1, 0], [3, 2]],
  "min": 0,
  "max": 10,
  "palette": ["#111111", "#D4AF37"]
}
```

#### `video-player`
```json
{
  "src": "assets/video/story.mp4",
  "poster": "assets/video/story-poster.jpg",
  "captions": "assets/video/story.vtt",
  "autoplay": false,
  "muted": true,
  "controls": true,
  "preload": "metadata"
}
```

## 4) `BGM_Engine` API (Function Signatures)

```js
/** Global singleton in main.js */
const BGM_Engine = {
  /**
   * Bootstraps app:
   * - Fetches local content.json
   * - Caches parsed content
   * - Registers hash router + listeners
   * - Renders initial route
   */
  async init(options = {}) {},

  /**
   * Renders cinematic home bento feed into root mount.
   * Uses requestAnimationFrame for batched DOM writes.
   */
  renderHome() {},

  /**
   * Renders full article view by article id.
   * @param {string} id - articles[].id
   */
  renderArticle(id) {},

  /**
   * Widget factory. Returns HTML string for supported widgets.
   * @param {'sparkline'|'heatmap'|'video-player'} type
   * @param {object} data - widget payload per schema
   * @returns {string}
   */
  renderWidget(type, data) {}
};
```

### 4.1 `init(options)` Option Contract
```js
{
  contentUrl: 'content.json',
  mountSelector: '#app',
  enableViewTransitions: true,
  onRouteChange: (route) => {}
}
```

### 4.2 Internal State Contract (non-public)
```js
{
  content: null,
  articlesById: new Map(),
  currentRoute: 'home',
  rafToken: null,
  isNavigating: false
}
```

## 5) Rendering and Performance Requirements
- Home and article renders must batch DOM writes in `requestAnimationFrame`.
- Use `loading="lazy"` for images and `preload="metadata"` for videos unless critical.
- Defer heavy widget hydration until visible (IntersectionObserver recommended).
- Keep route transitions refresh-free; only hash changes trigger navigation.

## 6) Theme Integration Hooks (for `theme.css`)
- Engine assumes these CSS variables exist:
  - `--bg: #000000`
  - `--text: #FFFFFF`
  - `--accent: #D4AF37`
  - `--glass: rgba(255,255,255,0.05)`
- Engine may apply `glass-morphism` class to widget/article surfaces.
- Engine will use named transition classes only; animation logic deferred to future sprint.

## 7) Validation Checklist (Spec Approval Gate)
- `content.json` can represent home feed + long-form articles + 3 widget types.
- Route key is stable and derived from `articles[].id`.
- `BGM_Engine` exposes exactly required methods (`init`, `renderHome`, `renderArticle`, `renderWidget`).
- Schema supports lazy-loading metadata for media assets.
- No framework/runtime dependency beyond browser APIs.
