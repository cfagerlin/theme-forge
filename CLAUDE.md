## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
- Refine section, fix variances, close FAILs → invoke theme-forge refine-section
- Refine page, refine all sections → invoke theme-forge refine-page
- Find variances, extract styles, compare styles → invoke theme-forge find-variances
- Regression test section, verify section, check assertions, run section checks → invoke theme-forge verify-section
- Regression test page, verify page, check page assertions → invoke theme-forge verify-page
- Selector changed, rebaseline, fix stale assertions → invoke theme-forge verify-section with --rebaseline
- Define cases, archetype matrix, setup cases file → invoke theme-forge intake-cases
- Define anchors, anchor map, setup roles, fix positional false positives → invoke theme-forge intake-anchors
- Restart dev server, server down, server clobbered, start server → invoke theme-forge env restart (or start/stop/status)

**IMPORTANT: verify vs refine distinction.**
- `verify-*` is READ-ONLY. It reports regressions. It never edits code.
- `refine-*` mutates code. It closes variances with an experiment loop.
- If the user says "fix this regression": invoke `verify-section` first to confirm the FAIL, then invoke `refine-section` using the `next:` command from the verify output.
- Never auto-bridge verify → refine. The user decides whether to refine.
