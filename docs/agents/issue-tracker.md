# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `Jedidiah-Equipment/jedidiah-platform`. Use `gh` from this
clone, which infers the repository from its remote. Outside the clone, pass
`--repo Jedidiah-Equipment/jedidiah-platform` for issue commands.

## Conventions

- **Publish a spec or ticket:** `gh issue create --title "..." --body-file <path>`.
- **Fetch a ticket:** `gh issue view <number> --comments`; use `--json body,comments,labels` when
  structured output is needed.
- **List:** `gh issue list --state open --json number,title,body,labels,comments`, with appropriate
  `--label` filters.
- **Comment:** `gh issue comment <number> --body-file <path>`.
- **Edit a body:** `gh issue edit <number> --body-file <path>`.
- **Apply/remove a role:** `gh issue edit <number> --add-label "..."` / `--remove-label "..."`, using
  the mapping in `docs/agents/triage-labels.md`.
- **Close:** `gh issue close <number>`; post any explanation as a comment first.

Write multiline bodies to a file and pass `--body-file`. Posting issues or comments follows the
invoked skill's authorization requirements and the user's instructions.

## Business labels

Every issue, including specs, tickets, and wayfinder maps, must have at least one business label:
`equipment` for Jedidiah Equipment or `contracting` for Jedidiah Contracting. Apply both in the rare
case that an issue affects both businesses. Shared infrastructure work uses the labels of the
businesses it affects.

Set the business labels when creating an issue; when updating or triaging an existing issue, add
any missing business labels. These labels are independent of category, triage state, and other
workflow labels. If the affected business is unclear, clarify it before assigning the label.

## Pull requests as a triage surface

**PRs as a request surface: no.** External PRs are excluded from triage discovery. An explicitly
named PR can still be triaged. GitHub shares issue and PR numbers: resolve an ambiguous number with
`gh pr view <number>`, falling back to `gh issue view <number>`.

## Wayfinding operations

For `/wayfinder`, the map is one issue labelled `wayfinder:map`. Its child tickets use
`wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`.

- **Children:** link tickets as GitHub sub-issues through `gh api`. If unavailable, use a task list
  in the map body and `Part of #<map>` at the top of each child's body.
- **Blocking:** use native issue dependencies. Add an edge with
  `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`. Obtain
  the database ID with `gh api repos/<owner>/<repo>/issues/<number> --jq .id`. If dependencies are
  unavailable, put `Blocked by: #<number>, ...` at the top of the child's body.
- **Frontier:** inspect the map's open children in map order; choose the first unassigned child
  with no open blockers. Native `issue_dependencies_summary.blocked_by` counts open blockers;
  for text links, fetch each blocker's state.
- **Claim:** `gh issue edit <number> --add-assignee @me`.
- **Resolve:** comment with the result, close the ticket, and append a summary and link to the
  map's Decisions-so-far section.
