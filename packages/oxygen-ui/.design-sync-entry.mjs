/**
 * design-sync bundle entry (tooling only — not part of the published package).
 *
 * Why this file exists
 * --------------------
 * `@wso2/oxygen-ui-charts-react` and `@wso2/oxygen-ui-icons-react` both export
 * the names `AreaChart`, `BarChart`, `LineChart`, `PieChart` and `Radar` — the
 * charts package as real chart components, the icons package as lucide icons of
 * the same name.
 *
 * The design-sync converter merges sibling packages into one global with
 * `export *`, and ESM drops *ambiguous* star re-exports to `undefined`. So all
 * five names landed `undefined` on `window.OxygenUI`: the four chart previews
 * rendered empty (`[RENDER] root empty`) and RadarChart's story threw
 * "Element type is invalid ... got: undefined" because `Radar` was missing.
 * Note it is not a case of one side winning — ambiguity kills both.
 *
 * The fix
 * -------
 * Explicit named re-exports beat `export *` *within a module*, and the
 * converter exports this module's namespace as `__dsMainNs` and
 * `Object.assign`s it over the merged global **last**. Binding the five names
 * explicitly here therefore makes the real chart components win.
 *
 * Consequence, deliberately chosen: on `window.OxygenUI` these five names are
 * the CHART components, not the same-named lucide icons. Charts are five real
 * components with their own cards; the icons are five of ~1000 and remain
 * importable from the icons package directly.
 *
 * Wired up via `"entry"` in .design-sync/config.json. It must live inside
 * packages/oxygen-ui/ because the converter derives PKG_DIR by walking up from
 * the entry to the first named package.json (package-build.mjs:164) — from
 * .design-sync/ that walk would reach the workspace root and break type
 * extraction and the reported version.
 */
export * from './dist/index.js';
export {AreaChart, BarChart, LineChart, PieChart, Radar} from '@wso2/oxygen-ui-charts-react';
