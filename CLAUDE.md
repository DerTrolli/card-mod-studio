# Card-Mod Studio — project instructions

These apply automatically to every session in this repo — no need to ask
for them by name.

## Versioning & release rules

This project is pre-1.0: still actively adding features, not yet confident
it's complete. SemVer applies within that constraint.

**Bump size:**
- **Patch** (`x.x.PATCH`) — bug fixes, small correctness fixes, minor UX
  tweaks, doc-only changes with no behavior change.
- **Minor** (`x.MINOR.x`) — new features, new settings/modules, meaningfully
  expanded capability — even if the change itself is a small diff.
- **Major** (`MAJOR.x.x`) — **never bump this without an explicit go-ahead**,
  regardless of how large a change feels. Stay in `0.x.x` until told
  otherwise (see `docs/ROADMAP.md`'s "Path to v1.0" for the actual plan).

When a change is genuinely ambiguous between patch/minor, say which one was
picked and why, so it's easy to correct.

**Pre-release suffixes** (`-beta.1`, `-beta.2`, …): once a version is being
shipped as a GitHub pre-release rather than a full release, keep using that
suffix and bump only the beta number for further iteration on the *same*
version — don't jump to the next patch/minor just because another fix
landed. Drop the suffix only when told the version is final.

**Before adding to or bumping the current version, check whether it's
already been released:**
1. Look at the current top entry in `CHANGELOG.md` / `package.json`'s
   version.
2. Check whether a GitHub Release actually exists for that exact version
   tag (`vX.Y.Z` or `vX.Y.Z-beta.N`) in this repo — use the GitHub tools
   available (list/get releases) rather than assuming. A plain git tag with
   no published Release doesn't count as released; a *pre-release* Release
   still counts as released for this purpose (it's public and installable).
3. **Not released yet** → fold the new change into that same pending
   version: add to the existing `CHANGELOG.md` section (don't create a new
   heading), don't bump `package.json`, don't add a new reference link.
4. **Already released** → this is a new version: bump per the rules above
   (or the next beta number, if mid-beta), add a new `CHANGELOG.md` section
   above the old one, bump `package.json`, add its reference link.
5. If genuinely unsure whether something's been released (API check
   inconclusive), ask rather than guess — bumping unnecessarily and folding
   into an already-public release are both wrong in opposite directions.

**Never retroactively edit an already-released version's changelog entry**
to describe a *later* fix — that entry is a public historical record once
released. A fix found after release always gets a new version, however
small.

## End-of-request checklist

For any request that changes product behavior (not pure research/discussion),
before considering it done:
- [ ] Does `package.json`'s version need touching, per the rules above?
- [ ] Is `CHANGELOG.md` updated — new section or amended existing one,
      whichever the released-check above calls for?
- [ ] Do `README.md` (cache-bust URL, implementation-status table) and
      `docs/ROADMAP.md` ("Current version" header, "Recently shipped"
      section) need matching updates?
- [ ] Run typecheck + full test suite + build before calling it done.
- [ ] Prefer verifying live behavior (the `tools/sandbox` Docker/Playwright
      rig) over assuming — see `docs/DEVELOPMENT.md` for known gotchas with
      that rig (dialog transform/top-layer, `ha-entity-picker` context
      requiring a real `<home-assistant>` ancestor).

This checklist is a default, not a suggestion to ask permission for each
item — just do it, and say what was done/skipped and why in the summary.
