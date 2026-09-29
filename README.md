# IHOT 1414 Resources

The official website and resource hub for **FIRST Robotics Competition Team 1414, IHOT Robotics** (Atlanta International School).

**Live site:** https://ihot-team1414.github.io/IHOT1414-Resources/

- **Home page:** an interactive 3D model of our robot, team highlights and a tour of the six subteams.
- **Resource pages:** one per subteam (Programming, CAD, Fabrication, Electrical, Operations, Scouting). Guides, links, videos and files are grouped into collapsible sections, with live search.
- **Editing:** leads sign in and edit pages right on the site. Every save becomes a commit in this repo.

There's no build step, backend, database or paid service. It's plain HTML, CSS and JavaScript that anyone on the team can maintain.

---

## Quick start

### Run it locally

You need any static web server. Opening `index.html` as a file won't work, because browsers block module scripts and `fetch` from `file://`.

```bash
git clone https://github.com/ihot-team1414/IHOT1414-Resources.git
cd IHOT1414-Resources
python3 -m http.server 8000
# open http://localhost:8000
```

### Deploy (GitHub Pages)

Deployment is automatic. `.github/workflows/pages.yml` publishes the site on every push to `main`, including saves made from the website. One-time setup:

1. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Push to `main`. The **Actions** tab shows the deploy, which takes about a minute.

The workflow checks that every JSON file is valid before publishing. A broken file never takes the site down; the last good version stays live.

### Set up editing

Follow **[ADMIN.md → First-time setup](ADMIN.md#3-first-time-setup-do-this-once)**: create a fine-grained GitHub token, open `#/admin` on the live site and create the first admin account. ADMIN.md also covers adding editors, rotating the token and the security limits.

---

## Editing content

| What | Where | How |
|---|---|---|
| Subteam resources | `content/<subteam>/sections.json` | **On the site:** sign in, open the subteam page, edit, press **Save changes**. Or edit the JSON on GitHub. |
| Uploaded images, PDFs, videos | `content/<subteam>/files/` | Added automatically when you upload on the site |
| Home-page text (hero, stats, subteam blurbs, about, sponsors, join, footer) | `content/site.json` | Edit on GitHub. `_VERIFY` at the top lists facts to double-check. |
| Editors (encrypted) | `content/editors.json` | Managed from **Editor tools** (`#/admin`). Don't hand-edit except to remove someone. |
| Repo owner/name/branch, upload limits | `config.json` | Edit on GitHub |
| Colors, fonts, spacing | `css/tokens.css` | Every color is a CSS variable built from the logo blue `#3E75B7` |
| Subteam icons and illustrations | `js/icons.js` | Inline SVG, drawn with the palette classes |

Content blocks available in a section: **rich text** (headings, bold, italic, size, lists, brand colors, links), **links** (Google Docs, Sheets and Slides get their own icons), **YouTube** (privacy-enhanced and click-to-load), **Google Drive embeds** (video, Docs, Sheets, Slides, folders), **images** (auto-converted to WebP), **PDFs** and **short videos**. See ADMIN.md for size limits. Use YouTube or Drive for large videos.

---

## How it's built

```
index.html              App shell: nav, <main id="app">, footer, meta/OG tags
404.html                Sends /IHOT1414-Resources/team/cad to #/team/cad
config.json             Repo owner/name/branch + upload limits
content/
  site.json             All home-page copy (one file)
  editors.json          Encrypted editor vault (see ADMIN.md)
  <subteam>/sections.json + files/
css/
  tokens.css            Palette, type scale, spacing, motion (edit here first)
  base.css layout.css   Reset, buttons, forms, dialogs; nav + footer
  home.css resources.css
  editor.css            Loaded only for editors / login
js/
  main.js router.js     Boot + hash router (#/team/<slug>/<section>)
  store.js              Loads JSON (short cache-busting so edits show fast)
  nav.js footer.js reveal.js icons.js ui.js
  hero3d.js             Three.js robot viewer (lazy-loaded)
  blocks.js sanitize.js Content blocks + DOMPurify sanitizing
  pages/home.js team.js account.js
  auth/vault.js         WebCrypto: PBKDF2 → AES-GCM → RSA-OAEP token vault
  auth/session.js editors.js
  github.js             GitHub API client (one commit per save, SHA conflict checks)
  editor/               Edit mode, block forms, Quill loader, upload prep
assets/                 Logo files (unchanged originals), robot GLBs + poster, OG image
vendor/                 Third-party libraries, committed (no CDN)
tools/                  Maintainer tools (robot pipeline, poster/OG renderers)
.github/workflows/pages.yml
```

**Tech choices**

- **Vanilla ES modules, no build step.** Edit a file, refresh, done.
- **Hash routing** (`#/team/cad`). GitHub Pages only serves real files, so hash routes make refreshes and shared links work everywhere. All paths are relative, so the site works under `username.github.io/repo-name/`.
- **Vendored libraries** in `vendor/`: Three.js r186 (tree-shaken bundle, see `tools/three-bundle-entry.js`), SortableJS 1.15.7, DOMPurify 3.4.16, Quill 2.0.3, and Inter + Space Grotesk variable fonts (OFL). Each folder keeps its license.
- **3D robot:** I compared Three.js and `<model-viewer>`. Three.js won because the hero needs scroll-linked motion, custom lighting in the brand colors, and a drag that rotates horizontally without trapping vertical scroll on phones (OrbitControls captures touch scrolling, so there's a small custom controller instead). The model is lazy-loaded **on the visitor's first interaction**. Until then a poster image rendered from the same model and camera is shown, so the swap is invisible and first paint stays fast. Phones get a lighter model.
- **Accessibility:** skip link, landmarks, keyboard-operable menu (arrows/Esc), accordions with `aria-expanded` and `inert`, visible focus rings, alt text required for images, `prefers-reduced-motion` respected (no auto-rotate, parallax or reveal animations). Tested with axe-core: 0 violations on every page and editor dialog.
- **Performance** (Lighthouse, local test server with gzip like Pages): home 95 mobile / 99 desktop, resource pages 98 / 99. Accessibility, Best Practices and SEO score 100 on every page.

### Updating the robot model (new season)

1. Export the robot assembly from CAD as a **binary STL in millimetres** (it can be huge; 500 MB+ is fine).
2. `python3 tools/cad/stl_to_glb.py "Main Assembly.stl" robot_full.glb --list` shows the biggest parts. Pick part ids to highlight in IHOT blue, then run again with `--accent id1,id2`.
3. Compress with gltfpack (commands at the top of the script) into `assets/robot/robot-hi.glb` (~3 MB) and `robot-lo.glb` (~0.7 MB).
4. Serve the site locally, open `tools/robot-preview.html?transparent=1` at a 1600×1280 window and screenshot it as `assets/robot/robot-poster.webp` (plus an 800×640 `robot-poster-sm.webp`).
5. Optionally regenerate `assets/img/og-image.png` with `tools/brand-assets.html?mode=og` at 1200×630.

### Testing the editor

`tools/tests/e2e_editor.py` drives a real browser through the whole editing loop against a fake GitHub API (no token needed). It covers setup, login, every block type, upload limits, drag reordering, saving, conflicts, history, token rotation, password changes, XSS sanitizing and read-only visitors. Run it after changing anything in `js/editor`, `js/auth` or `js/github.js` (instructions are at the top of the file).

### Updating a vendored library

Download the new version from npm and replace the file in `vendor/`. For Three.js, rebuild the bundle:
`npx esbuild tools/three-bundle-entry.js --bundle --format=esm --minify --outfile=vendor/three/three.bundle.min.js`
(run where `three` is installed with `npm i three esbuild`).

---

## Content to verify

The home page and starter resources were drafted from public sources (The Blue Alliance, Statbotics, FIRST). Please confirm or edit:

- **Stats:** rookie year 2004, 20+ seasons, top 5 in the Peachtree District in 2024, qualified for the 2024 FIRST Championship (Houston).
- **Sponsors:** names taken from The Blue Alliance's team listing. Confirm the current list and add logos/links.
- **Subteam tags and blurbs:** tools like *Java & WPILib*, *Onshape* and *CNC* were assumed.
- **About paragraph 2** and **Join steps:** general descriptions of how the team works.
- **Team email:** intentionally blank in `content/site.json → team.email`. Add it to show it on the site.
- **Starter resources:** links were checked when the site was built. The team-process sections (Git workflow, design review checklist, pit checklist, pick list, and so on) are sensible defaults for leads to adjust.

---

## Credits

Built for IHOT Robotics, FRC Team 1414. The IHOT logo files in `assets/logo/` are the team's originals and are used unmodified. FIRST® and FIRST® Robotics Competition are registered trademarks of FIRST.
