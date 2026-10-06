# Bundled fonts

Noto Sans Display, Onest and JetBrains Mono variable fonts are bundled from the Google Fonts repository (retrieved 2026-10-06). They use the SIL Open Font License 1.1. Sources and licenses:

- https://github.com/google/fonts/tree/main/ofl/notosansdisplay
- https://github.com/google/fonts/tree/main/ofl/onest
- https://github.com/google/fonts/tree/main/ofl/jetbrainsmono

Next.js uses next/font/local with WOFF2 subsets. Builds and visitors require no Google Fonts requests. All nine Kazakh letters (both cases) were verified against the cmap tables of Noto Sans Display and Onest. Monospaced technical data uses JetBrains Mono with Onest fallback for unsupported glyphs.
