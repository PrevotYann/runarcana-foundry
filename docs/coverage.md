# Coverage and limits

Profile: **authorized-content**. This module is **incomplete**. It has no Foundry V14 runtime verification.

899 canonical page URLs discovered; 514 complete responses cached; 385 sources not collected. Missing pages are not claimed to be permanently unavailable: HTTP 429 throttling interrupted earlier passes. Collection is resumable from its saved checkpoint; unvisited entries require a resumed crawl or a local export.

11322 page/anchor/table/catalog coverage records. Entry discovery is not exhaustive until every source is available and reviewed.

| Part | Discovered pages | Collected pages | Missing pages |
| --- | ---: | ---: | ---: |
| Introduction, appendices, projects | 38 | 33 | 5 |
| Characters | 98 | 98 | 0 |
| Rules | 578 | 198 | 380 |
| Game Mastering | 21 | 21 | 0 |
| Monsters & Creatures | 164 | 164 | 0 |

| Pack | Generated native documents |
| --- | ---: |
| references | 33 |
| characters | 98 |
| features | 518 |
| subclasses | 38 |
| classes | 9 |
| resources | 308 |
| heritages | 333 |
| runes | 102 |
| tables | 70 |
| crafts | 421 |
| backgrounds | 44 |
| equipment | 369 |
| origins | 10 |
| gm | 21 |
| rewards | 177 |
| afflictions | 165 |
| rules | 198 |
| spells | 178 |
| companions | 1 |
| creature-rules | 164 |
| creature-features | 2973 |
| bestiary | 232 |
| rituals | 47 |
| techmaturgy | 127 |
| devices | 13 |
| start | 1 |

## Mechanical support

Implemented: namespaced resources and staged native Activity consumption; published mana costs; source-backed creation for 10 origins and 29 named lineages, tribes, clans and models; fixed/27-point/4d6 ability methods and validated +2/+1 allocation; replaceable origin effects for permanent size/movement/senses/proficiencies/defenses; botanical choices, construct armor prerequisites and Runeborn trait budgets/conversions; native natural weapon attacks with Troll level-6 progression; conditional Fluffy movement and explicit underwater vision; origin/region heritage pool separation and source level budgets; cumulative Minotaur HP; native class HitPoints advancements; native matched class grants and numeric scale advancements; native source attack bonuses, saving throws, initiative, skill checks, passive perception and numeric senses for structured NPCs; weapon attack/crit metadata; source RollTables; heritage budget preview and recorded GM overrides; explicit rest recovery; a native creation/progression workflow; source-based creature HP calculator; conservative import updates and backups; Babele converters and translation templates. Six source snapshots have reviewed base spell Activities (including the Snowman companion); these adapters fall back to manual casting if their source hash changes. Spell effects, triggers and augmentation remain partial.

Manual or incomplete: conditional origin actions and exhaustive trait-effect conversion; Runeborn GM rulings, disadvantage effects and advanced trait interactions; regional proficiency catalogs and heritage effect conversion; multiclass calculation and restrictions; automatic class resource initialization/recalculation; class-specific recovery exceptions; ritual casting procedures; most spell damage, effects and augmentation; familiars/summons/Feral Forms; condition expirations and weakness; DR exceptions; firearm misfires/reloads/ammunition; runes and conditional effects; comprehensive crafting catalogs; Mecha pilots/developments/fuel; Echo applications; reward charges/effects/evolution. Some extracted feature items provide text and native inventory support only and are explicitly partial.

The spell catalog exposes 558 distinct spell cards. Their metadata is inventoried separately from complete spell pages. A spell card or search summary does not count as a collected spell. At this checkpoint only cached full pages produce spell items.

All shared API mutations are restricted to the active primary GM, with per-document queues and operation IDs where applicable. Native activities stage consumption in the initiating workflow. This has unit-test coverage with mocks; a real two-client test is still required. No claim of distributed transaction guarantees is made.

World import ignores local edits and duplicate world copies. Reimport or language refresh is voluntary. Flags retain a pre-update backup. Runtime migration, schema validation and Babele import behavior require the target runtime tests below.

## Source inconsistencies

- Classes: nine linked and collected class pages; no tenth class has been invented.
- Creature roles: the text says four classifications but lists five.
- Creature HP: the size table uses floored averages, whereas the published Moose stat block has 46 HP for 8d10+2 (the table formula yields 42). Published Actors retain published HP; the calculator follows the explicit creation table.
- Armor DR: the example states 3 plus 1 becomes 6. It also rounds (20−5)/2 to 8, whereas normal downward rounding yields 7. DR is not automatically derived from these contradictory examples.
- Armor entries mix “Dexterity Modifier”, “Defense Modifier”, “Electric” and Portuguese currency abbreviations. Unresolved values are preserved in sourceColumns and flagged for manual review.
- Mecha HP: the table assigns Partial Medium shielding 4, while the example uses 5. Base templates use the table and retain the example in their full source text.
- Abominable Snowman is listed as level 8, but its higher-level paragraph names level 6. Its published level-8 companion and caster matching are converted; that augmentation instruction remains unresolved.
- Some creature variants omit their type or size. Those fields are flagged for review; missing types use an Unspecified type folder, Diminutive size uses native Tiny, and Colossal size uses native Gargantuan pending review.
- Voidling lists two different Promotion - Soldier (10 counters) features. Both published texts are retained as separate feature documents; their intended progression is not inferred.
- Chapter numbering, untranslated Portuguese fragments and under-construction passages are retained rather than silently corrected.

## Runtime verification to perform

1. Install the module in a clean Foundry 14.367+ / dnd5e 6.0.6 world. First test English with Babele disabled. Check console, all 26 packs, folder trees, journal links and document sheets.
2. Enable the world setting; explicitly mark test actors. Create PCs of at least two origins and classes, inspect every published progression level and a multiclass case. Unmarked D&D actors must keep their native behavior.
3. Configure mana and another resource. Use and cancel native activities, overspend, augment a reviewed spell, inspect chat, and verify only one debit. Exercise short/long/full rests with game-time advance and class exceptions.
4. Check defenses by component, DR bypasses, odd-value rounding, absorption source/cantrip restrictions, and the damage ladder. Review all partial rules before relying on automation.
5. Import, edit locally and reimport Items/Actors/journals/tables; duplicates and local edits must be skipped. Repeat after a Babele language change and verify backup recovery.
6. Install Babele 2.9.1 and its lib-wrapper dependency. Use a small runarcana-fr validation module, test spell/class/NPC embedded ability/multipage journal/table full texts and English fallback.
7. Repeat resource, crafting and import operations with two connected clients. Measure catalog navigation against the final complete corpus. This checkpoint is not the full-corpus performance test.

## Missing sources

The exact URL list, attempted status, timestamps and available hashes are in `sources/catalog.json`; every page and discovered entry has a row in `sources/coverage.json`. `sources/missing.json` is the machine-readable recovery queue. Resume collection with the throttled crawler or import an official local export. No search excerpt is substituted for a missing rules page.

A complete module requires finishing both collection and mechanical conversion. The current ZIP is a reviewable implementation checkpoint; it does not satisfy total coverage.
