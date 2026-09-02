/**
 * The bundled mascots.
 *
 * These are imported rather than fetched from `public/`, so Vite inlines each
 * one as a data URI (they are all well under the inline limit). That means no
 * network request, correct rendering offline from the very first load, and a
 * build that still works when the whole app is bundled into a single file.
 *
 * User-supplied artwork still lives in `public/decor/` and is referenced by
 * path - see `decorUrl` in `components/ThemeScope.tsx`.
 */
import fruitSpirit from './decor/mascot-fruit-spirit.svg';
import grimoire from './decor/mascot-grimoire.svg';
import leafNinja from './decor/mascot-leaf-ninja.svg';
import pastelSky from './decor/mascot-pastel-sky.svg';
import spark from './decor/mascot-spark.svg';
import titanRunner from './decor/mascot-titan-runner.svg';

export const BUNDLED_DECOR: Record<string, string> = {
  'mascot-fruit-spirit': fruitSpirit,
  'mascot-grimoire': grimoire,
  'mascot-leaf-ninja': leafNinja,
  'mascot-pastel-sky': pastelSky,
  'mascot-spark': spark,
  'mascot-titan-runner': titanRunner,
};
