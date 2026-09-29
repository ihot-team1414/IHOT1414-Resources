# ADMIN.md — Running the IHOT 1414 site

This guide is for team admins: the people who manage editors, the GitHub token and the site structure. Regular editors only need the **Editing content** section.

- Live site: https://ihot-team1414.github.io/IHOT1414-Resources/
- Editor tools: https://ihot-team1414.github.io/IHOT1414-Resources/#/admin
- Repo: https://github.com/ihot-team1414/IHOT1414-Resources

---

## 1. How editing works (the short version)

The site is plain static files on GitHub Pages. There is no server and no database. Editors still save changes straight from the website, and here is how:

1. The team has **one fine-grained GitHub token**. It can only read and write the *contents* of this one repository.
2. That token is **encrypted in the browser** and stored in `content/editors.json`, once per editor. Each copy can only be opened with that editor's password.
3. When an editor signs in, their password unlocks the token **in their browser only**. Saving then calls the GitHub API with that token and makes a normal git commit.
4. GitHub Actions redeploys the site after every commit, which takes about a minute.

Every save is a commit. That gives you full version history, and any change can be undone.

### What exactly is in `content/editors.json`

For each editor:

| Field | What it is |
|---|---|
| `username`, `role` | `admin` or `editor` |
| `kdf` | PBKDF2-SHA256 settings: 600,000 iterations and a random 16-byte salt |
| `privateKey` | The editor's RSA private key, encrypted with **AES-GCM** under a key derived from their password with PBKDF2 |
| `publicKey` | The matching RSA public key (not secret) |
| `token` | The team GitHub token, encrypted to the editor's public key (RSA-OAEP-256) |

The file contains **no passwords, no password hashes and no plaintext token**. A wrong password fails AES-GCM authentication, and that is how sign-in is checked.

Why the extra public/private key layer? It lets an admin **rotate the token or add editors without knowing anyone's password**. The admin encrypts the new token to each editor's public key.

---

## 2. Security: what this does and does not protect ⚠️

Please read this before adding editors. The protection is reasonable for a student resource site, but it is **not** as strong as a real login server.

**What it does protect:**

- Nobody can read the token just by browsing the public repo or the site. They would need an editor's password.
- Passwords are never stored anywhere.
- All editor-written HTML is cleaned with DOMPurify, both when it is saved and when it is shown. Scripts, event handlers, `javascript:` links, iframes and unexpected styles are stripped. SVG uploads are blocked.
- The token can only touch **this one repo**, and only its contents. It cannot delete the repo, change settings or reach other repos.
- Everything is in git history. Any bad change can be reverted.

**What it does not protect:**

- **Weak passwords can be cracked offline.** `editors.json` is public, so anyone can download it and guess passwords on their own computer. PBKDF2 at 600k iterations makes each guess slow, but a short or common password will still fall. **Require long passphrases** (the site enforces at least 12 characters; 4+ random words is better).
- **Any editor can see the token.** After signing in, it sits in that browser tab's `sessionStorage` until the tab closes. A malicious browser extension, a compromised laptop or a curious editor with DevTools could copy it. Only give edit access to people you trust.
- **Roles are enforced by the website only.** "Admin" versus "editor" controls what the site shows. Someone who copies the token can use the GitHub API directly and change any file in this repo, including `editors.json` and the site code.
- **Removing an editor is not enough on its own.** They may still have the token. After removing someone, **rotate the token** (section 5) and revoke the old one on GitHub.
- There is no lockout after failed logins. The site adds a small delay, but offline guessing ignores that anyway.
- Tokens expire (GitHub caps fine-grained tokens at 1 year unless your org allows longer). Rotate before expiry. The site warns editors at sign-in when fewer than 14 days are left.

If the team ever needs stronger security, the upgrade is a tiny server (for example a Cloudflare Worker or a GitHub App) that holds the token and checks logins, so the token never reaches browsers.

---

## 3. First-time setup (do this once)

### 3a. Turn on GitHub Pages

1. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Push to `main` (or run **Actions → Deploy to GitHub Pages → Run workflow**).
3. The site appears at `https://ihot-team1414.github.io/IHOT1414-Resources/` within a couple of minutes.

### 3b. Allow fine-grained tokens in the organization

An **organization owner** of `ihot-team1414` must allow them:

- **Organization settings → Personal access tokens → Settings → Fine-grained tokens**: allow access via fine-grained personal access tokens.
- If "Require administrator approval" is on, an owner must approve each new token under **Personal access tokens → Pending requests**. The token won't work until it is approved.

### 3c. Create the token

1. Go to **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token** (direct link: https://github.com/settings/personal-access-tokens/new).
2. **Token name:** `IHOT site editor`
3. **Resource owner:** `ihot-team1414`
4. **Expiration:** up to 1 year. Put a reminder in the team calendar to rotate it.
5. **Repository access:** *Only select repositories* → `IHOT1414-Resources`
6. **Permissions → Repository permissions → Contents: Read and write.** Leave everything else at *No access* (GitHub adds *Metadata: Read* automatically).
7. Generate it and copy it (it starts with `github_pat_`).

> The token belongs to the GitHub account that made it, and commits made with it appear under that account. Consider having a mentor or a shared team account create it.

### 3d. Create the first admin

1. Open `…/#/admin` on the live site. Because `editors.json` is empty, it shows **First-time setup**.
2. Pick a username and a strong passphrase, paste the token, and press **Create admin account**.
3. The site checks the token, encrypts it and commits `content/editors.json`. You're signed in.

---

## 4. Managing editors (admins)

Everything here is on **Editor tools** (`#/admin`) and is saved as a commit.

### Add an editor

1. **Editors → Add an editor**: username (lowercase), role, and a temporary password.
2. Share the temporary password privately (in person or by direct message, not in a group chat).
3. They sign in at `#/login` and change it right away under **Change your password**.

New editors can sign in right away. The site checks GitHub directly if Pages hasn't redeployed yet.

### Reset someone's password

**Editors → Reset password** next to their name. This creates fresh keys for them with a new temporary password and the current token.

### Remove an editor

1. **Editors → trash icon** next to their name, then confirm.
2. **Rotate the token right away** (section 5) and revoke the old token on GitHub. They may still have a copy of it.

### Change your own password

**Change your password** on the Editor tools page. You need your current password.

### Doing it by hand (if the site is broken)

`content/editors.json` is ordinary JSON. You can delete an editor's object from the `editors` array in the GitHub web editor. You **cannot** hand-write a new entry, because the keys are generated by the site. To start over completely, set `"editors": []` and run first-time setup again.

---

## 5. Rotating the GitHub token (admins)

Rotate the token **before it expires**, **after removing an editor**, or **any time you think it leaked**.

1. Create a new token with the same settings (section 3c).
2. **Editor tools → GitHub token → Rotate the token**: paste it and press **Rotate token**.
   The site checks the new token, re-encrypts it for **every** editor using their public keys (no passwords needed) and commits `editors.json` *using the new token*.
3. On GitHub, **delete the old token** (Settings → Developer settings → Fine-grained tokens).
4. Editors who are already signed in keep using the old token until they sign out and back in. Once you delete it, their saves fail with a clear message telling them to sign in again.

If the old token already expired, you can still rotate it. Sign in (the site warns that saving is off), then paste the new token in the rotate form. It only needs the new token to work.

---

## 6. Editing content (all editors)

1. Sign in at `#/login`.
2. Open any subteam page from the menu. Edit mode turns on automatically (look for the dashed editor bar).
3. You can:
   - **Add section**: creates a new collapsible section.
   - **Drag** the ⋮⋮ handle to reorder sections (press and hold on phones), or use the ↑ ↓ buttons.
   - **Rename** ✎ or **delete** 🗑 a section. Renaming keeps its link.
   - **Add content** inside a section: rich text, links (Google Docs, Sheets and Slides are detected), YouTube, Google Drive embeds, images, PDFs and small videos.
   - **Edit**, **move** and **delete** individual items.
4. Nothing is published until you press **Save changes** in the bar at the bottom (or Ctrl/⌘+S). **Discard** throws away unsaved changes.
5. The change is live in about a minute.

### Files and size limits

Everything uploaded is stored **in this repo**. GitHub Pages cannot serve Git LFS files, and GitHub rejects files over 100 MB. The limits live in `config.json → uploads`:

| Type | Limit | What the site does |
|---|---|---|
| Images | 15 MB in | Resized to at most 2000 px and converted to WebP in the browser (usually 100–400 KB). SVG is blocked. |
| PDFs | 25 MB | Stored as-is |
| Videos | 50 MB (warning above 15 MB) | MP4/WebM only. The site suggests YouTube/Drive for anything big. |

**For long videos, use YouTube (unlisted is fine) or Google Drive** and add them with the YouTube or Drive block. The repo stays small and videos stream properly.

Removing an uploaded image, PDF or video from the page also deletes the file from the repo in the same save.

For Google Drive embeds, the file's sharing must allow the viewer (for example "Anyone with the link" or your school domain). Otherwise they see a sign-in box.

### Conflicts

If two people edit the same page, the second person to save sees **"Someone else saved this page"** with two choices:

- **Load their version**: your changes are first downloaded as a JSON backup, then replaced with theirs.
- **Overwrite with mine**: yours replace theirs. Their version is still in History.

### Undo / version history

**History** (in the editor bar) lists every saved version of the page. Pick **Load this version**, check it, then press **Save changes** to restore it. You can also revert any commit on GitHub.

---

## 7. Adding a new subteam (admins)

**On the site:** Editor tools → **Add a subteam**: name, page address (for example `media` → `#/team/media`), tagline and summary. One commit adds it to `content/site.json` and creates `content/media/sections.json`. It appears in the menu, on the home page and in the footer after the redeploy.

**By hand:**

1. In `content/site.json`, add an object to `subteams` (the order there is the order on the site):
   ```json
   { "slug": "media", "name": "Media", "tagline": "Telling the team's story",
     "summary": "Two or three sentences…", "tags": ["Photo", "Video"] }
   ```
2. Create `content/media/sections.json`:
   ```json
   { "version": 1, "subteam": "media", "updated": "", "sections": [] }
   ```
3. Optional: give it a custom icon and illustration in `js/icons.js` (`subteamIcon.media` and `illustration.media`). Otherwise it uses a generic one.

To **remove** a subteam, delete its object from `subteams` and its `content/<slug>/` folder.

## 8. Adding or editing a section by hand

Each subteam page is `content/<slug>/sections.json`:

```json
{
  "version": 1,
  "subteam": "cad",
  "updated": "2026-09-29",
  "sections": [
    {
      "id": "onshape-basics",
      "title": "Onshape basics",
      "blocks": [
        { "id": "b1", "type": "text", "html": "<p>Start with the <strong>fundamentals</strong> course.</p>" },
        { "id": "b2", "type": "link", "url": "https://learn.onshape.com/", "title": "Onshape Learning Center", "description": "Free courses" },
        { "id": "b3", "type": "youtube", "url": "https://www.youtube.com/watch?v=VIDEO_ID", "title": "Video title" },
        { "id": "b4", "type": "drive", "url": "https://drive.google.com/file/d/FILE_ID/view", "title": "Match footage" },
        { "id": "b5", "type": "image", "src": "content/cad/files/photo.webp", "alt": "Describe it", "caption": "" },
        { "id": "b6", "type": "pdf", "src": "content/cad/files/drawing.pdf", "title": "Drawing" },
        { "id": "b7", "type": "video", "src": "content/cad/files/clip.mp4", "title": "Short clip" }
      ]
    }
  ]
}
```

- `id` values must be unique within the page. Section ids are used in links (`#/team/cad/onshape-basics`), so keep them stable.
- The order of `sections` is the order on the page.
- If a hand edit breaks the JSON, the deploy workflow refuses to publish and shows the bad file in the Actions log. The live site keeps the last good version.

## 9. Home-page text

All home-page copy (hero, stats, subteam blurbs, about, sponsors, join, footer) is in **`content/site.json`**. Edit it on GitHub and commit. The `_VERIFY` list at the top shows which facts were drafted and still need checking.

## 10. Moving or renaming the repo

Update `config.json → github` (`owner`, `repo`, `branch`) and the URLs in `index.html` (`og:url`, `og:image`). The editor reads the repo from `config.json`.

## 11. Troubleshooting

| Problem | Fix |
|---|---|
| "GitHub rejected the team token" | The token expired or was revoked. An admin signs in and rotates it (section 5). |
| "The team token isn't allowed to do that" | The token is missing **Contents: Read and write**, is limited to the wrong repo, or is still waiting for org approval (section 3b). |
| Saved, but the site still shows the old version | Wait a minute or two for the Actions deploy, then hard-refresh. Check the **Actions** tab for a failed run. |
| New editor can't sign in | Check the username (lowercase) and that the "Add editor" commit exists. |
| Forgot password | An admin uses **Reset password**. If the *only* admin forgot, edit `editors.json` on GitHub, set `"editors": []` and run first-time setup again. |
| Deploy failed: "Invalid JSON" | Open the file named in the Actions log and fix the syntax (a missing comma or quote is the usual cause). |
