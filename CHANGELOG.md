# Changelog

Notable changes, newest first. The plugin follows semantic versioning: the
settings surface and the config it writes are the public contract.

## 0.2.0

Everything below landed after 0.1.0 was published, so 0.1.0 users see the
capability fill only — no renaming, no reordering, and the older matcher.

### Added

- **Name redirect.** Every model gets `【vendor】 name`, taking the vendor from
  the id prefix and falling back to `【other】` when there is none. Runs over all
  models at once, keeps the id untouched, and is idempotent.
- **Ordering.** Two modes, both vendor-first then by name: by id prefix, or by
  the `【vendor】` group. Written together with the config so the order is a
  choice, not an artifact of load order.
- **Editable capability values.** Context, output and image can be typed
  directly in the table, including for models the catalog never listed — those
  now get a row instead of sitting in a read-only list. A typed value is marked
  blue, overlays the catalog value, and is applied even with overwrite off.
- **Matching rules**, in the order they run:
  - version separators folded both ways (`.` / `-` / `_`), so
    `sensenova-6-8-flash-lite` reaches `sensenova-6.8-flash-lite`
  - variant markers stripped (27 suffix words, `:route` tags, build numbers)
  - a reseller's namespace peeled off (`sn-glm-5-3` → `glm-5-3`), accepted only
    when what remains matches exactly
  - a label's word gaps read as dashes (`Qwen3.8 Flash` → `qwen3.8-flash`)
  - display names, then aliases, as the last resorts

### Fixed

- **Renaming then reordering lost the new names.** The held descriptor kept the
  pre-write models, and anything that rebuilt the list from it put the old names
  back. A write now updates both, and writers read a synchronous mirror of the
  list so two clicks in a row cannot race.
- **Casing could hand a model to a reseller.** A verbatim id match returned only
  that casing's entries, so `scnet-token-plan` (which capitalises like the label)
  beat `alibaba` even though alibaba is first-party and had more facts.
- **A column header rendered as `colName`.** The dictionary lacked the key and
  the lookup fell back to the key itself. A test now fails when the UI asks for
  a key either dictionary lacks.
- Table fits the panel instead of scrolling sideways: fixed layout with
  proportional columns, wrapping ids and names.

### Tests

61 unit tests (`rename` 11, `match` 29, `sort` 6, `write-merge` 6, `locale` 3,
`fields` 6) plus 25 packaging checks, all offline.

## 0.1.0

First release: query models.dev for context window, output cap, image support
and reasoning efforts, and write the selected rows into a provider's model list.
