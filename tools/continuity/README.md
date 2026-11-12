# Continuity and fuzz checks

Checks that a new build does not change styles people already have. They run
the parser and generator directly (no browser, no Home Assistant) and take
about two minutes.

```
tools/continuity/run.sh
```

| Step | What it does | What to look for |
| --- | --- | --- |
| cards | Each released version's **own generator** (extracted from its git tag into `.work/<tag>/`) writes styles for 39 card configs and about 190 setting combinations (`RAND=700` for about 800). The working tree loads each one the way the editor does and saves it again. | `THREW` and `UNSTABLE` empty (the Mushroom chips/title block order is the known exception). `LOST`, `CHANGED`, `ADDED`: only the documented upgrades. `REMAINDER`: Studio-written CSS that no module took back. Compare the group list with the previous run (`.work/result.json`). |
| entities rows | The same for per-row styles. | all byte-identical |
| whole card configs | Card configs written by the save path of v0.10.2 and later (string and dictionary styles, pierced entries, the Studio's own Number size entry on gauge and thermostat), opened and saved untouched. `VERBOSE=1` prints each difference. | `threw` and `unstable` 0. Differences: the gauge Number size entries of beta.1 and beta.2 (range and formula changed in beta.3). |
| saved presets | State objects of old versions through `migrateStudioState` and the per-card filter. | no `THREW` |
| random settings | Random setting combinations the panel can produce, written and read back by the working tree. | every group empty: nothing left under Advanced CSS, no module switched off, second save identical |
| random hand-written styles | 30,000 seeded random hand-written styles, loaded and saved untouched. Compares what the browser would apply (the cascade winner per selector and property) before and after. | `THREW`, `SLOW`, `NEVER-SETTLES`, `UNSTABLE`, `LOST-REFERENCED` empty. `LOST` / `CHANGED` / `ADDED`: the intended take-overs of old shapes (icon colour variables, `background-color`, unreferenced `cms-*` keyframes). |

`extract.ts` reads declarations without using the Studio's parser, so the
comparison does not share its blind spots.

Options (environment variables): `VERS` (comma-separated tags), `RAND` (number
of random combinations per card in the corpus), `REGEN=1` (rebuild the
corpora), `N` and `SEED` (both fuzz scripts), `TOP` (rows printed per group),
`CONT_WORK` (work folder, default `tools/continuity/.work`, not committed).

When a new version is released, add its tag to the default list in `run.sh`
and in the three `check-*.ts` files.

A small fixed slice of both fuzz runs is part of the unit tests
(`test/handwritten-css-adoption.test.ts`).
