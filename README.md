# Runarcana for Foundry VTT

Module ID `runarcana`; system remains `dnd5e`. Target: Foundry **14.367+** and **dnd5e 6.0.6**. English base; optional Babele **2.9.1** for future French translations.

**Incomplete implementation checkpoint.** Source discovery, individual mechanics and runtime testing remain incomplete. Read [coverage and limits](docs/coverage.md) before play. There is no `verified` compatibility claim. No installed system or existing world was changed.

## Install

In Foundry's **Add-on Modules → Install Module**, paste this manifest URL:

```text
https://raw.githubusercontent.com/PrevotYann/runarcana-foundry/main/module.json
```

Version 0.1.1 fixes the unnamed home-page compendium folder that prevented worlds from starting with 0.1.0. Update from Foundry Setup before opening the affected world.

Public releases include collected Runarcana texts and native Items, Actors, Journals and RollTables. The maintainer has confirmed permission for their inclusion in this free module; see [credits and permission](docs/credits.md). Artwork remains linked to its source. Mechanical coverage and uncollected sources are still incomplete.

Source collection continues alongside character creation and origin customization. Other mechanical automation remains deferred while source import is incomplete.

For manual installation, close Foundry, extract the ZIP into `Data/modules/`, then activate Runarcana in a compatible dnd5e world. Enable the world setting and explicitly mark Runarcana actors in the workbench.

Use **Runarcana → Catalog** for lazy compendium browsing. **World import** previews creates/updates/conflicts; local edits and duplicates are skipped. Updating or translating a compendium does not automatically update world copies. Reimport voluntarily to refresh unedited copies. The importer saves a pre-update backup in `flags.runarcana.import.backup`; restore it manually through a document update/export if needed.

The active primary GM performs shared resource, rest, creation and import mutations. Native Activities use native ownership checks and staged consumption. Character creation supports all 10 origins and their 29 named lineages, tribes, clans and models. Choose fixed values, 27-point buy, rolls or GM-approved scores, then allocate the origin's +2/+1 and its required choices. The preview shows the resulting scores, size, movement, senses and proficiencies. Creation applies permanent origin traits and opens native class advancement, including Hit Points. **Character → Customize origin** replaces a workbench-managed origin without stacking its boosts; later score changes are preserved. See [creation and customization](docs/character-creation.md) for supported effects and remaining limits.

## Build and resume

Requires Node 24 (tested 24.13.1), Python 3.14 (tested 3.14.3), npm and the dependencies below. Neither Foundry nor dnd5e is needed to compile the packs.

```powershell
npm ci
python -m pip install -r scripts/requirements.txt
python scripts/collect.py --delay 12 --priority-core
python scripts/normalize.py
npm run build
npm run translations
npm test
npm run validate
python scripts/report.py
python scripts/package.py
```

The crawler stops on HTTP 429/503 and saves every response and checkpoint. Resume later; do not repeatedly restart against a rate limit. `--offline` inventories only cached links. To use an official mirror export:

```powershell
python scripts/collect.py --export C:\path\to\official-export
```

For a bestiary checkpoint, use `python scripts/collect.py --delay 12 --priority-core --priority-part 4 --fetch-limit 60`. This prioritizes creature sources; the limit counts new downloads rather than cached pages.

The export must contain `en/.../index.html`. Full pages and normalized local text are kept in `sources/cache/` and `data/local/` and excluded from Git. Once the cache exists, normalization, generation, translations, compilation, testing and packaging run without network. `sources/ids.json` is the durable ID registry; preserve it across updates. `STATE.json` records the recovery state. Structured overrides for unimplemented rules must be reviewed before marking their mechanical coverage complete.

A fresh clone builds from the committed `data/corpus.json.gz` snapshot: install dependencies, then run `npm run build`, `npm run translations`, `npm test`, `npm run validate`, `python scripts/report.py` and `python scripts/package.py`. No wiki network access is needed. After collecting more sources, normalization updates that snapshot.

`npm run build -- --references` is an optional reference-only diagnostic profile. Default releases include content. `python scripts/package.py --source` packages code, build tools and the authorized source snapshot. Inspect installable archives with `node scripts/validate-archive.mjs dist/runarcana-0.5.0.zip`.

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
