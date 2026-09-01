# Decoration assets

Two kinds of file live here.

## 1. Original mascots (shipped and used by default)

`mascot-*.svg` are original, anime-inspired decorative mascots drawn for this
project. They are safe to ship and are what the app renders out of the box.

| File | Page | Inspiration slot |
| --- | --- | --- |
| `mascot-leaf-ninja.svg` | Tasks | Naruto slot |
| `mascot-fruit-spirit.svg` | Nutrition | Jujutsu Kaisen slot |
| `mascot-titan-runner.svg` | Fitness | Attack on Titan slot |
| `mascot-grimoire.svg` | Study | Black Clover slot |
| `mascot-spark.svg` | Today / Analytics | - |
| `mascot-pastel-sky.svg` | Calendar | - |

## 2. Franchise placeholders (empty by design)

`franchise-placeholders/*.svg` are clearly named, empty slots for the four
franchises requested (Naruto, Jujutsu Kaisen, Attack on Titan, Black Clover).

**No character art is scraped, bundled, or hot-linked.** Copyrighted character
artwork is not included because lawful use has not been confirmed for it. To use
your own licensed or personally owned images:

1. Replace a placeholder file with your image (`.webp` or `.avif` preferred,
   compressed, roughly 400x400 or larger).
2. Keep the same file name, or add a new file and pick it in
   **Settings > Appearance > Page themes > Decoration**.
3. Decorations are rendered behind content at 8-15% opacity, are marked
   `aria-hidden`, use empty alt text, and can be switched off entirely.

Do not add dialogue or logos from a series: the app's motivational microcopy is
original text.
