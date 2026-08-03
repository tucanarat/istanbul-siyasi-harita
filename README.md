# Istanbul District Political Map

A self-contained, dependency-free interactive map of Istanbul's 39 districts, built for
embedding inside a news article. Editorial style (Financial Times / Reuters Graphics /
Datawrapper): white background, thin borders, no gradients, no shadows, minimal motion.

Two views, switched with a segmented control:

1. **31 Mart 2024 Yerel Seçimleri** — the party that won each district in March 2024.
2. **Mevcut Durum** — the party currently in control of each municipality,
   with a diagonal hatch over any district whose elected mayor is currently under arrest.
   Whether a district's control has changed since 2024 (and to which party) is shown
   in that district's detail card, not as a separate map.

A district search box sits above the detail panel (type a name and press Enter, or
pick from the autocomplete list) and jumps/zooms the map to that district. The map
frame also has +/− zoom buttons, mouse-wheel zoom, and click-and-drag panning once
zoomed in.

## Files

```
index.html      Markup: header, segmented control, map container, legend, detail panel
style.css       All styling (no external CSS framework)
script.js       All behavior (vanilla JS, no build step, no dependencies)
data.json       One record per district — the only place district facts live
assets/map.svg  The 39 district boundaries as separate <path> elements
README.md       This file
```

Nothing is hardcoded in `script.js`: every color, label, and district fact is
derived from `data.json` and the small config block at the top of `script.js`.

## How to update the data

Everything a journalist would need to touch lives in **`data.json`**, a flat array
with one object per district:

```json
{
  "district": "Kadıköy",
  "mayor": "Mesut Kösedağı",
  "party2024": "CHP",
  "currentParty": "CHP",
  "changed": false,
  "changeDescription": "No change",
  "judicialStatus": "none",
  "officeStatus": "active",
  "note": ""
}
```

Field reference:

| Field | Meaning |
|---|---|
| `district` | Must exactly match the `id` / `data-district` of a `<path>` in `assets/map.svg` (case- and character-sensitive, including Turkish letters). |
| `mayor` | Elected mayor's name, shown as a subtitle in the detail card. |
| `party2024` | Party that won the seat in the 2024 local election. Colors **Map 1**. |
| `currentParty` | Party currently controlling the municipality. Colors **Map 2**, and colors **Map 3** wherever `changed` is `true`. Besides real party abbreviations, two special values are supported out of the box: `"Kayyum"` (a state-appointed trustee runs the district — no elected party in charge) and `"Belirsiz"` (results pending / acting mayor not yet confirmed). |
| `changed` | `true`/`false`. Whether `currentParty` differs from `party2024`. Drives **Map 3**. |
| `changeDescription` | Optional free-text summary, not currently rendered (the card builds its own sentence from `party2024`/`currentParty`), kept for future use or tooltips. |
| `judicialStatus` | One of `"none"`, `"arrested"`, `"released"`, `"suspended"`. Only `"arrested"` draws the diagonal hatch on Maps 2 & 3. |
| `officeStatus` | One of `"active"`, `"suspended"`, `"resigned"`. Informational, not currently rendered. |
| `note` | Longer free-text context (kept out of the compact card by design — the brief calls for 4–5 short lines, no paragraphs). Useful if you later add a "read more" link. |

To update a district: edit its object in `data.json` and save — no code changes
needed. To add a brand-new party, see the palette section below.

**Testing locally:** the page loads `data.json` and `assets/map.svg` with `fetch()`,
which browsers block on `file://` URLs. Serve the folder over HTTP while you work:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## How to change the color palette

Open `script.js` and edit the `PARTY_COLORS` object near the top of the file:

```js
var PARTY_COLORS = {
  "AKP": "#F39C12",
  "CHP": "#D32F2F",
  "DEM": "#6A1B9A",
  "MHP": "#C62828",
  "İYİ Parti": "#29B6F6",
  "YRP": "#00695C",
  "YENİ Parti": "#7B1FA2",
  "Independent": "#616161",
  "Kayyum": "#37474F",
  "Belirsiz": "#9E9E9E",
  "__nodata__": "#D9D9D9"
};
```

- The **key** must match the exact string used for `party2024` / `currentParty`
  in `data.json`.
- The **value** is any valid CSS color.
- Adding a new party is a one-line change — the legend, map fills, and detail
  panel all pick it up automatically; nothing else in the code needs editing.
- `__nodata__` is the fallback used if a district's party string doesn't match
  any key (keeps the map from breaking on a typo).
- The "no change" gray on Map 3 is a separate constant, `NO_CHANGE_COLOR`,
  a few lines below `PARTY_COLORS`.
- The arrest hatch pattern (opacity, spacing, angle) is defined in
  `injectHatchPattern()` in `script.js`, as a standard SVG `<pattern>`.

## How to deploy on GitHub Pages

1. Push this folder to a GitHub repository (the five files can sit at the repo
   root, or inside a subfolder — just keep them together).
2. In the repository, go to **Settings → Pages**.
3. Under **Source**, choose the branch (e.g. `main`) and folder (`/root` or
   `/docs`, matching where you placed the files).
4. Save. GitHub will publish the site at
   `https://<username>.github.io/<repository>/` (or `.../<subfolder>/` if you
   used one) within a minute or two.
5. No build step is required — it's static HTML/CSS/JS/SVG/JSON, served as-is.

## How to embed with an iframe

Once deployed, embed the map in any article with a standard responsive iframe:

```html
<iframe
  src="https://<username>.github.io/<repository>/"
  title="Istanbul district political map"
  style="width: 100%; max-width: 980px; height: 640px; border: none;"
  loading="lazy">
</iframe>
```

Notes:

- The map's own layout is already responsive (it fills the iframe's width and
  keeps its aspect ratio), so you mainly need to give the iframe a sensible
  `height`. `640px` comfortably fits the map, legend, and detail panel at
  desktop widths; narrower iframes (mobile) stack the detail panel below the
  map and need roughly `900–1000px` if you want to avoid the iframe itself
  scrolling — or simply let the surrounding page scroll normally.
- If your CMS strips inline `style` attributes, move the sizing rules to your
  site's stylesheet instead and target the iframe by a class.
- The page has no external dependencies besides the Inter font from Google
  Fonts (loaded in the `<head>` of `index.html`). If your publication requires
  a fully offline/self-hosted page, download the Inter `.woff2` files and
  replace the `<link>` tags with a local `@font-face` rule in `style.css`.

## Accessibility

- Every district `<path>` has `tabindex="0"`, `role="button"`, and an
  `aria-label` (updated per view, e.g. flagging an arrested mayor).
- Districts open the detail card on `Enter`/`Space` as well as click/tap.
- The segmented control uses the standard ARIA `tablist`/`tab` pattern with
  arrow-key navigation.
- The detail card is focused programmatically when opened, closes on `Escape`
  or via its close button, and its content region is `aria-live="polite"` so
  screen readers announce updates.
- Color choices keep sufficient contrast against the white background and
  against the (optional) hatch overlay; the hatch itself is a secondary,
  non-color-dependent signal for the "mayor arrested" state.
- `prefers-reduced-motion` disables the fade transitions.

## Data source

Compiled from municipal and news records covering the March 2024 local
elections through August 2026. District boundaries are simplified from
public OpenStreetMap-derived GeoJSON for lightweight, editorial-style
rendering — they are stylized outlines, not survey-grade cadastral data.
