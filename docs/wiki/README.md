# Wiki sources

These are the source pages for the repo's **GitHub Wiki**
(https://github.com/DerTrolli/card-mod-studio/wiki). The wiki is a separate
git repository GitHub attaches to the repo — it can't be updated through the
normal repo push or the API.

## Publishing (automatic — the normal path)

**Any push to `main` that touches `docs/wiki/` triggers
`.github/workflows/wiki.yml`, which syncs these files to the live wiki.**
Merging a PR that edits the sources is all it takes — no manual step.

Two rules that follow from the sync being an overwrite:
- Edit wiki pages **here**, never in the wiki's web editor — web edits are
  clobbered by the next sync (pages absent from `docs/wiki/` are deleted).
- `README.md` (this file) is publish documentation, not a wiki page — the
  workflow excludes it.

The workflow can also be run manually (Actions → "Publish wiki" → Run
workflow) to force a re-sync.

## Manual publishing (fallback, e.g. if the workflow is broken)

1. If the wiki has never been initialized: open
   https://github.com/DerTrolli/card-mod-studio/wiki and click
   **"Create the first page"** → Save (any content — it gets overwritten).
   GitHub only creates the underlying wiki git repo after this step.
2. Clone the wiki repo *next to* your main repo clone, then copy the pages
   in from the main clone and push.

**Linux/macOS** (from the folder containing your main clone):

```bash
git clone https://github.com/DerTrolli/card-mod-studio.wiki.git
cp card-mod-studio/docs/wiki/*.md card-mod-studio.wiki/
rm card-mod-studio.wiki/README.md          # this file is not a wiki page
cd card-mod-studio.wiki
git add -A && git commit -m "Publish wiki" && git push
```

**Windows (cmd)** (same layout):

```cmd
git clone https://github.com/DerTrolli/card-mod-studio.wiki.git
copy /Y card-mod-studio\docs\wiki\*.md card-mod-studio.wiki\
del card-mod-studio.wiki\README.md
cd card-mod-studio.wiki
git add -A
git commit -m "Publish wiki"
git push
```

The main clone must contain `docs/wiki/` — i.e. be on a branch/commit where
these sources exist (`git pull` after they've been merged to main).

## Manual updates (same fallback)

Same copy/delete/commit/push against the existing wiki clone.

## Conventions

- File name = page name (dashes render as spaces): `Getting-Started.md` →
  "Getting Started". `Home.md` is the landing page; `_Sidebar.md` and
  `_Footer.md` are the navigation chrome.
- Internal links use bare page names: `[text](Getting-Started)`.
- Images are hot-linked from the main repo's `images/` on `main` via
  raw.githubusercontent.com — regenerating the README screenshots
  (`tools/sandbox/harness/readme_shots.mjs`) updates the wiki images too.
- Keep pages user-facing; developer docs live in `docs/` proper.
