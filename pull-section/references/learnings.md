# Learnings System

theme-forge accumulates knowledge from every correction. When you fix a variance and the fix works (or when the user corrects your approach), that pattern gets captured as a learning. Future sections check learnings before writing any code, so the same mistake doesn't happen twice.

## How It Works

### 1. Storage

Learnings live in `.theme-forge/learnings.json` in the project root:

```json
{
  "version": "0.2.0",
  "learnings": [
    {
      "id": "l_001",
      "trigger": {
        "condition": "target_theme_sets_property_via_inline_style",
        "property": "font-family",
        "description": "Target theme injects font-family as an inline style via CSS custom properties in theme-styles-variables.liquid"
      },
      "action": {
        "description": "Use !important when overriding font-family on elements that inherit from the target theme's global typography",
        "example": "font-family: 'Spectral', serif !important;",
        "anti_pattern": "font-family: 'Spectral', serif; /* will be overridden by inline style */"
      },
      "source": {
        "section": "custom-dynamic-collections",
        "correction_type": "retry_after_fail",
        "description": "CSS override didn't apply because Horizon inline style had higher specificity"
      },
      "scope": "target_theme",
      "confidence": "high",
      "created_at": "2026-04-07T20:00:00Z"
    }
  ]
}
```

### 2. When Learnings Are Captured

A learning is created when:

- **Retry after failure** (automatic): pull-section Step 8 fails verification → the fix that eventually works gets captured along with what was tried first. The trigger is "what caused the failure" and the action is "what worked."

- **User correction** (prompted): The user says "that's wrong, you should have done X" or "you need !important here" or "use the explicit color, not opacity." Capture the user's correction as a learning.

- **Pattern recognition** (automatic): The same fix is applied on 2+ sections. If pull-section adds `letter-spacing: -0.02em` to headings in 3 different sections, create a learning: "Base theme headings use -0.02em letter-spacing; apply proactively."

- **Accepted variance** (from review/reconcile): When a variance is accepted as "close enough," capture WHY so future sections with the same pattern can pre-accept it.

### 3. When Learnings Are Applied

At the START of pull-section (Step 1, after loading context), before any code is written:

1. Load `.theme-forge/learnings.json`
2. For each learning, evaluate whether its trigger matches the current section:
   - Does this section use the same property/pattern?
   - Is the scope relevant? (`target_theme` = applies everywhere, `section_type` = applies to similar sections only)
3. If a learning matches, apply it proactively:
   - Include `!important` where a prior learning says it's needed
   - Use the correct CSS pattern from the start
   - Pre-accept known variances
   - Flag the learning in the section report so the user knows it was applied

### 4. Learning Scopes

| Scope | Meaning | Example |
|-------|---------|---------|
| `target_theme` | Applies to ALL sections in this target theme | "Horizon inline styles require !important for font overrides" |
| `base_theme` | Applies to all sections from this base theme | "Base theme headings use Spectral 200 with -0.02em spacing" |
| `section_type` | Applies to sections of a similar type | "Slideshow sections need custom overlay gradients" |
| `project` | Project-specific (e.g., brand conventions) | "Client uses #333 for heading color, not pure black" |
| `universal` | Applies across all projects | "Never use opacity to simulate lighter text colors" |

### 5. Confidence Levels

| Level | Meaning | Behavior |
|-------|---------|----------|
| `high` | Confirmed by user or verified 3+ times | Apply automatically, no confirmation needed |
| `medium` | Worked once, not yet verified across sections | Apply automatically but flag in report |
| `low` | Inferred from pattern, not explicitly confirmed | Suggest but don't apply; ask user |

Confidence increases when:
- The same learning applies successfully on additional sections
- The user confirms a suggested learning

Confidence decreases when:
- A learning is applied but the section still fails verification (the learning might be too broad)
- The user rejects a suggested learning

### 6. Capturing a Learning (for the AI agent)

When you identify a pattern worth capturing, write it to `.theme-forge/learnings.json` with this structure:

```json
{
  "id": "l_NNN",
  "trigger": {
    "condition": "<when does this apply>",
    "property": "<CSS property or Liquid pattern, if applicable>",
    "description": "<human-readable description of the trigger>"
  },
  "action": {
    "description": "<what to do when the trigger matches>",
    "example": "<code example of the correct approach>",
    "anti_pattern": "<code example of what NOT to do, if applicable>"
  },
  "source": {
    "section": "<which section this was learned from>",
    "correction_type": "<retry_after_fail | user_correction | pattern_recognition | accepted_variance>",
    "description": "<what happened>"
  },
  "scope": "<target_theme | base_theme | section_type | project | universal>",
  "confidence": "<high | medium | low>",
  "created_at": "<ISO timestamp>",
  "applied_count": 0,
  "success_count": 0
}
```

### 7. !important Guardrails

!important is a learning, not a default. The system handles it as follows:

- **Never apply !important blindly.** Each `!important` usage must trace back to a specific learning with a specific trigger condition (e.g., "target theme sets font-family via inline style").
- **The learning must document WHY it's needed** — which inline style or CSS variable injection it's overriding.
- **Preferred alternatives are tried first:**
  1. Can the property be set via JSON settings instead of CSS? → No !important needed
  2. Can specificity be increased with a more specific selector? → Try that first
  3. Is the override targeting an inline style or CSS custom property set in `<style>` attribute? → !important is justified, capture as learning
- **Each !important in generated CSS should have a comment** referencing the learning: `/* learning l_001: overrides Horizon inline font-family */`
- **Review can audit !important usage** — if a section has >5 !important rules, flag it for review to check whether a structural approach would be cleaner

### 8. Seeding Learnings

On `onboard` or first `pull-section` run, seed `.theme-forge/learnings.json` with universal learnings that apply to any Shopify theme migration:

```json
[
  {
    "id": "l_seed_001",
    "trigger": { "condition": "lighter_text_appearance", "description": "Text appears lighter/greyed on the live site" },
    "action": { "description": "Check whether the live site uses opacity, an explicit lighter color value, or color:inherit. Never approximate with opacity — use the exact mechanism.", "anti_pattern": "opacity: 0.6; /* approximating lighter text */" },
    "scope": "universal",
    "confidence": "high"
  },
  {
    "id": "l_seed_002",
    "trigger": { "condition": "exported_settings_value_mismatch", "description": "Exported settings_data.json value doesn't match what's rendered on the live site" },
    "action": { "description": "Always verify key visual values by inspecting the live storefront. When export and live disagree, the live site wins." },
    "scope": "universal",
    "confidence": "high"
  },
  {
    "id": "l_seed_003",
    "trigger": { "condition": "content_copy_difference", "description": "Heading or body text differs between themes" },
    "action": { "description": "NEVER change content copy without explicit user instruction. Match character-for-character including capitalization, hyphens, punctuation. The live site is the source of truth." },
    "scope": "universal",
    "confidence": "high"
  }
]
```

### 9. Cross-Project Portability

Learnings with `scope: "universal"` are portable across projects. When starting a new migration, you can import universal learnings from a previous project:

```
/theme-forge onboard --import-learnings ../other-project/.theme-forge/learnings.json
```

This copies only `universal` scope learnings, filtering out project-specific ones. Over time, the universal learnings become a shared knowledge base of Shopify theme migration best practices.
