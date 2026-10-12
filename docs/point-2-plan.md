# Complete character creation and customization

The current requested objective is to finish point 2 entirely before moving to point 3. The public version remains 0.16.0 until a validated release is ready. `sources/character-backlog.json` tracks the outstanding groups; `complete` must remain false while implementation work remains.

Scope includes all ten origins and their 29 named variants; required stat, proficiency, language, craft, weapon and spell choices; published origin actions/counters/transformations/regeneration/conditional modifiers; Runeborn traits/disadvantages; source-backed Pasts and class creation choices; relevant heritage selection and permanent conversions; reviewable upgrades of existing characters.

Shared automation for general spells, class resources, combat, crafting, runes, Mechas, Echoes and rewards is point 3. Runtime verification in Foundry V14/Babele/two clients is point 1 and remains unavailable locally. Roleplay information and explicit GM decisions must be represented faithfully rather than given invented deterministic outcomes. Source omissions/contradictions require an explicit configurable ruling, not a false claim of published numbers.

In-progress code adds native power profiles and innate spell grants, coordinated transactional powers, Construct healing/repair and situational checks. Pending implementations must not be marked complete merely because text, a counter or a generic activity exists.

## Saved shutdown checkpoint — 2026-10-13

Work stopped at the user's request before PC shutdown. This checkpoint is unfinished development, not a new release. Public installer/version remains 0.16.0. All 112 local Node tests passed immediately before saving. Foundry V14 runtime verification remains outstanding.

Implemented in this checkpoint: source-hash-guarded origin power profiles; botanical innate grants and Vesani Arcane Shot; transactional Floral branches, Fox Fire orbs, Plumdaggers, Selfsacrifice, Devour Essence and temporary self-buffs; contextual origin checks; V14 effect start/duration fields and expiry followups; Construct healing/repair rules; Troll regeneration and blocked fire/acid wounds; origin weakness saves and temporary penalties. These additions still need the complete origin inventory and integration audit. Some registered powers remain descriptive utilities, not complete automation.

Next work: finish Troll treatment UI and pending damage replay/event tests; finish remaining botanical/Vastaya/Yordle/Minotaur/Construct powers; implement the Runeborn gallery's typed choices and progression; add published Past/class creation choices; complete heritage customization and existing-character upgrade auditing. Update `sources/character-backlog.json` only when each group's requirements are actually met. Continue point 2 until complete, then move to point 3 as previously authorized.

Class choice research was the last active task: inspect native Trait advancement examples in `sources/technical/dnd5e/packs/_source/classes24/monk/monk.yml` and native proficiency resolution in `sources/technical/dnd5e/module/documents/actor/trait.mjs`. The technical clone is ignored and may need restoring on another machine. Source classes distinguish bucklers/light/heavy shields, so avoid overgranting generic shield proficiency. Shaman's proficiency anchor is singular. Published aliases Intuition/Acting need a documented mapping to Insight/Performance rather than invented skills. Pasts include nested feature documents which must not be offered as separate backgrounds.

Known remaining checks: Emperor's Flower curly apostrophe matching; missing shadow in selectable simple damage types; prevent magical/true types from appearing in restricted resistance choices; validate communication/ancestral language categories; couple Aurochs roar healing to its paid use; remaining Runeborn weaknesses and spell selections; actual combat expiry for Fox Fire; lifecycle hooks and rollback behavior in Foundry V14. Do not claim point 2 or runtime compatibility complete from the passing local tests.
