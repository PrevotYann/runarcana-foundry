| Runarcana rule | dnd5e 6.0.6 behavior | Extension / storage | Validation |
| --- | --- | --- | --- |
| Mana: 0,2,3,5,6,7,9,12,16,21 points | Spell slots | Public activity consumption type; flags.runarcana.resources; suppress spellSlot | Cost table, cancellation and insufficient resources tests |
| Unlimited class resources | Item uses and attributes | Namespaced resources with explicit recovery rules | Bounds, spend, recovery tests |
| Short / long / full rests | Short and long rests, standard HP recovery | Separate opt-in rest API; native rest blocked on marked actors | Two long rests before full, timestamps, HP gate |
| Simple / magical damage variants | Standard damage traits | Separate types and directional trait inheritance | No cold/glacial equivalence; absorption restrictions |
| Damage scale beyond d12 | No native scale ladder | Pure formula transformer | 6d12 becomes 6d12 + 1d4 |
| Heritage budget and prerequisites | No heritage point budget | Validated character preview, GM reason stored | Overbudget denied; override audited |
| Class levels / subclass choices | Native Advancements | Extract exact matched grants; ambiguous choices remain manual | Grant UUID checks and full table retained |
| Multiclass resources / recovery | Standard slot progression | Source tables retained; automatic combination not yet implemented | Partial coverage, no invented combined progression |
| Rune conditions / techmaturgy | Activities / effects possible | Independent items; prerequisite/resource recipe API | Conditional effects require individual review |
| Creature role, HP, damage | D&D CR model | Runarcana creation calculator and NPC preview | Elite CR7 huge = 30d12 + 3×Con |
| Echoes | Full class items | Independent simplified features; no full class assigned | Application mechanics remain manual |

Source URLs and snapshots are recorded in sources/catalog.json. These decisions describe implementation scope, not a claim of complete rules support. DR exceptions, weakness effects, crafting formula catalogs, all conditional rune/equipment effects and class-specific recovery need individual review before complete mechanical coverage can be declared.
