# Babele translation contract

English works without Babele. The observed official manifest is Babele 2.9.1, minimum Foundry 13, upstream verified 14; this integration has **not** been runtime-tested. Babele requires lib-wrapper. The original module itself does not require it.

The core registers `runarcanaNested` and `runarcanaSystem` converters during the actual **`babele.init`** hook. This is Babele 2.9.1's bootstrap registration point, before its runtime session is initialized. No old singleton-init assumption is used.

`npm run translations` creates empty per-pack files under `translations/templates/` and an English reference under `translations/english/`. English references contain source texts covered by the recorded module permission. Empty templates do not pretend to be a French catalog. Copy templates into a separate module `runarcana-fr`, requiring `runarcana`, `babele` and Babele's `lib-wrapper` dependency. The future module registers its own source in `babele.init`:

```js
Hooks.on("babele.init", babele => {
  babele.register({module: "runarcana-fr", dir: "translations", lang: "fr"});
});
```

Place translated pack files in `runarcana-fr/translations/fr/runarcana.<pack>.json`. Retain the generated `mapping`. `entries` are keyed by the original 16-character document `_id`; nested pages/items/activities/advancements/effects/results are keyed by their own `_id`. For example:

```json
{
  "entries": {
    "originalItemId001": {
      "name": "Nom traduit",
      "system": {
        "description": {"value": "<p>Description complète traduite.</p>"},
        "activities": {
          "originalActiv001": {
            "name": "Lancer",
            "description": {"value": "<p>Description de l'activité.</p>"}
          }
        }
      }
    }
  }
}
```

The example IDs above illustrate structure and are not production IDs. Real stable IDs are generated in sources/ids.json. Tests use a tiny original synthetic dataset to verify French spell/class/NPC embedded ability/multipage journal/table translations and full English fallback. They do not claim Babele runtime success.

Converters whitelist textual fields: names, descriptions, biography, journal titles/bodies, activity descriptions, effect labels, advancement titles/hints and table result descriptions. They never merge mechanical types, IDs, damage formulas, ranges or configuration from translation payloads. Translators must preserve UUID targets, URLs and other mechanical references inside rich text; changing only the displayed link label is allowed.

Folders and pack labels require separate, explicit localization: pack files may supply Babele's `label`; compendium Folder names and existing world Folder names are not assumed to translate. Current generated folders remain in English. Future localization must key them by stable `flags.runarcana.folderKey` or pack Folder `_id`, preview changes, and skip local edits.

Babele translates compendium copies in memory. Existing world copies do not automatically update. Run the voluntary import preview again after changing language. Unedited copies update; local edits and duplicate copies remain conflicts. This workflow and folder localization need V14/Babele runtime validation before complete localization coverage is declared.
