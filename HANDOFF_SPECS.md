# BGM Antigravity Handoff Specs

This file defines DOM selectors Gemini Antigravity is authorized to style while preserving BGM runtime logic.

## Logic Constraints

- Do not rename or remove IDs listed below.
- Do not remove `data-route`, `data-route-link`, or `data-widget` attributes.
- Do not rename JS entry files (`main.js`) or JSON bridge file (`content.json`).
- Visual styling changes are allowed for listed classes and IDs.

## BGMwebsite Authorized Selectors

### DOM IDs

- `#bgm-shell`
- `#top-bar`
- `#brand-label`
- `#route-title`
- `#app`
- `#bottom-nav`

### CSS Classes

- `.shell`
- `.glass-panel`
- `.brand-eyebrow`
- `.route-shell`
- `.home-grid`
- `.article-shell`
- `.card`
- `.feature-card`
- `.hero-frame`
- `.hero-media`
- `.feature-copy`
- `.article-content`
- `.article-meta`
- `.chip-row`
- `.chip`
- `.widget-slot`
- `.widget-title`
- `.widget-placeholder`
- `.bottom-nav`
- `.nav-pill`
- `.nav-pill.is-active`
- `.gpu-layer`

## BGMstudio Authorized Selectors

### DOM IDs

- `#studio-shell`
- `#studio-topbar`
- `#studio-eyebrow`
- `#studio-title`
- `#bridge-target`
- `#status-panel`
- `#bridge-status`
- `#json-status`
- `#ship-status`
- `#editor-panel`
- `#json-editor`
- `#ship-panel`
- `#gh-owner`
- `#gh-repo`
- `#gh-branch`
- `#gh-token`
- `#gh-path`
- `#gh-message`
- `#reload-btn`
- `#ship-btn`

### CSS Classes

- `.studio-shell`
- `.glass`
- `.panel`
- `.status-row`
- `.status-label`
- `.status-chip`
- `.chip-good`
- `.chip-warn`
- `.chip-bad`
- `.grid`
- `.actions`
- `.btn`
- `.btn-ship`
- `.gpu-layer`

## Antigravity Injection Tags Present

- `@ANTIGRAVITY_INJECT: [OLED_MORPHED_ROUTE_TRANSITIONS]`
- `@ANTIGRAVITY_INJECT: [SVG_WIDGET_DRAWING]`
- `@ANTIGRAVITY_INJECT: [MORPHING_HERO_IMAGE_TRANSITION]`
- `@ANTIGRAVITY_INJECT: [SPARKLINE_SVG_PATH_DRAW]`
- `@ANTIGRAVITY_INJECT: [HEATMAP_GLOW_AND_PULSE]`
- `@ANTIGRAVITY_INJECT: [CONTROL_ROOM_BLUR_AND_DOCK_MOTION]`
- `@ANTIGRAVITY_INJECT: [SHIP_BUTTON_HAPTIC_PULSE_VISUAL]`
- `@ANTIGRAVITY_INJECT: [SHIP_SEQUENCE_HUD_AND_TACTILE_TIMELINE]`
