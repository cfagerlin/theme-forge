# v0.22 wrong-pairing regression suite

Load-bearing safety net for the v0.23 source-binding veto. Each case captures a
known-correct v0.22 role-to-selector mapping. The veto ranker must not flip any
of these to a wrong answer — if it does, either `role-bindings.json` is wrong
for that case, or the DOM-locus matcher has a bug.

## Case format

Each case lives in its own subdirectory:

```
<case-name>/
├── source.liquid         Section Liquid source (root file for the section)
├── snippets/             Optional. {% render 'foo' %} → snippets/foo.liquid
│   ├── foo.liquid
│   └── bar.liquid
├── rendered.html         Rendered DOM output for a sample product
└── expected.json         Ground truth: role → expected candidate id
```

`expected.json` schema:

```json
{
  "description": "One-line description of what this case exercises",
  "section_type": "product-information",
  "role_bindings_file": "../../../intake-anchors/role-bindings.json",
  "candidates": {
    "product_title": [
      { "id": "h1.title", "selector": "h1.product-title", "baseScore": 0.72 },
      { "id": "h2.related", "selector": "h2.related-title", "baseScore": 0.58 }
    ]
  },
  "expected_winner": {
    "product_title": "h1.title"
  },
  "expected_tier": {
    "product_title": "confirmed"
  }
}
```

- `candidates` lists all DOM candidates the harness should feed to the ranker,
  each with a stable `id` (arbitrary, just a handle), a CSS `selector` used for
  DOM-containment checks, and the `baseScore` the scorer would have produced
  (hand-curated to reflect what v0.22 would output on this DOM).
- `expected_winner` is the v0.22 known-correct answer. v0.23 with veto must
  agree.
- `expected_tier` is the veto tier we expect. A case where the correct winner
  sits in the `confirmed` tier proves the veto helped (or didn't hurt). A
  case with `inconclusive` tier proves the fallback path works.

## TODO: expand to 20 real captures

Current cases are Shopify-realistic hand-crafts seeded in this session. Per
plans/v0.23-source-binding.md scope, the suite must grow to **20 known-correct
v0.22 pairings captured from real Shopify stores** before v0.23 ships. Target
provisioning: run `intake-anchors` against Dawn-like, Online Store 2.0, a
heavily-customized theme, and an app-heavy theme; capture the v0.22 output +
the Liquid source + rendered HTML as new cases here.

The harness is fixture-driven: drop new directories in and the regression test
picks them up automatically. No harness changes needed per case.
