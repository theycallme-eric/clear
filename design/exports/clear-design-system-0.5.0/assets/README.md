# CLEAR Assets

- `favicon.svg` — App favicon (C glyph, CLEAR orange). `favicon-vapour.svg` / `favicon-signal.svg` match the other skins; favicons can't read CSS tokens, so an app links the one matching its skin.
- `og-image.svg` — Social preview card (1200×630).
- `icons.tsx` — **The complete custom icon set** — 75 solid geometric icons in 24×24 viewBox. `fill="currentColor"`. Orthogonal + 45° edges only; zero circles and zero curves. Always use this file for icons. No Lucide, no Heroicons, no emoji.
- `ClearLogo.tsx` — Wordmark + icon logo component with optional boot animation (clip-reveal + scanline sweep).
