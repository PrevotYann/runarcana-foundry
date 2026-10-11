# Runarcana for Foundry VTT

Module ID `runarcana`; system remains `dnd5e`. Target: Foundry **14.367+** and **dnd5e 6.0.6**. English base; optional Babele **2.9.1** for future French translations.

**Incomplete implementation checkpoint.** Source discovery, individual mechanics and runtime testing remain incomplete. Read [coverage and limits](docs/coverage.md) before play. There is no `verified` compatibility claim. No installed system or existing world was changed.

## Install

In Foundry's **Add-on Modules → Install Module**, paste this manifest URL:

```text
https://raw.githubusercontent.com/PrevotYann/runarcana-foundry/main/module.json
```

The public release includes original code and source references. Complete wiki texts and personal content packs are excluded because redistribution rights have not been established. This release is incomplete and has static validation only.

Close Foundry. Extract the ZIP so its `runarcana` folder sits under your Foundry user-data `Data/modules/`. Restart Foundry, activate the module in a clean compatible dnd5e world, then open **Settings → Configure Settings → Runarcana**. Enable Runarcana rules for this world and reload. Mark each actor voluntarily in the workbench; activation imports nothing into the world.

`runarcana-0.1.0.zip` includes original code and source references. The separate `-local-personal-use.zip` profile includes only the full wiki pages actually cached at its snapshot and partial native conversions. **Do not redistribute that personal build**: redistribution permission for the full texts and artwork has not been established. Images are referenced through source links; none are bundled.

Use **Runarcana → Catalog** for lazy compendium browsing. **World import** previews creates/updates/conflicts; local edits and duplicates are skipped. Updating or translating a compendium does not automatically update world copies. Reimport voluntarily to refresh unedited copies. The importer saves a pre-update backup in `flags.runarcana.import.backup`; restore it manually through a document update/export if needed.

The active primary GM performs shared resource, rest, creation and import mutations. Native Activities use native ownership checks and staged consumption. Character creation opens native origin/class advancement dialogs after preview; unresolved choices still need source review.

## Build and resume

Requires Node 24 (tested 24.13.1), Python 3.14 (tested 3.14.3), npm and the dependencies below. Neither Foundry nor dnd5e is needed to compile the packs.

```powershell
npm ci
python -m pip install -r scripts/requirements.txt
python scripts/collect.py --delay 12 --priority-core
python scripts/normalize.py
npm run build -- --local
npm run translations
npm test
npm run validate
python scripts/report.py
python scripts/package.py --local
```

The crawler stops on HTTP 429/503 and saves every response and checkpoint. Resume later; do not repeatedly restart against a rate limit. `--offline` inventories only cached links. To use an official mirror export:

```powershell
python scripts/collect.py --export C:\path\to\official-export
```

The export must contain `en/.../index.html`. Full pages and normalized local text are kept in `sources/cache/` and `data/local/` and excluded from Git. Once the cache exists, normalization, generation, translations, compilation, testing and packaging run without network. `sources/ids.json` is the durable ID registry; preserve it across updates. `STATE.json` records the recovery state. Structured overrides for unimplemented rules must be reviewed before marking their mechanical coverage complete.

For a public code/reference build from a fresh clone, run `npm ci`, install the Python dependencies, then `npm run build`, `npm run translations`, `npm test`, `npm run validate`, `python scripts/report.py` and `python scripts/package.py`. The reference build uses the committed source catalog and needs no wiki cache or network after dependencies are installed. The manifest points to the public repository and the versioned GitHub release asset.

`python scripts/package.py --source` produces the separate code/build-tools archive, excluding cached texts and compiled binaries. Verify installable archives after extraction with `node scripts/validate-archive.mjs dist/runarcana-0.1.0.zip dist/runarcana-0.1.0-local-personal-use.zip`.

## API

```js
const ra = game.modules.get("runarcana").api;
ra.open(actor);
await ra.setResource(actor, "mana", {label: "Mana", value: 4, max: 4, recovery: "full"});
await ra.spendResource(actor, "mana", 2, {operationId: crypto.randomUUID()});
await ra.rest(actor, "long", {operationId: crypto.randomUUID()});
const preview = ra.creatureStatistics({cr: 7, role: "elite", size: "huge", constitution: 16});
```

`rest` records completed rests; the GM verifies duration, sleep, food/water and class exceptions. `spendHitDie` enforces the one-short-rest-die limit. Multiclass full-rest recovery requires a reviewed `hitDiceAllocation` map. `applyChoices` validates accumulated budgets and stores GM override reasons. `craft` accepts a reviewed, source-cited recipe with prerequisites, resource costs and an output UUID; catalogs, materials and crafting-time adjudication remain manual. There is no automatic application of an unreviewed Echo or rune.

See [Babele contract](docs/babele.md), [rule adapter scope](docs/rule-differences.md) and [credits and licenses](docs/credits.md). Runtime verification steps are in the coverage report.
