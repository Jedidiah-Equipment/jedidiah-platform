# Repo-local skills

Only `use-slot` lives here: it is private to this repo and edited here directly. Codex discovers
`.agents/skills/` directly; Claude Code uses the committed `.claude/skills -> ../.agents/skills` symlink.

Every shared engineering skill (Matt Pocock's workflows, the owner's personal skills from
[deanvanniekerk/skills](https://github.com/deanvanniekerk/skills), `babysit`, the thermonuclear review,
`gh-address-comments`) is installed globally with the Skills CLI in `~/.agents/skills/`, linked into
`~/.claude/skills/`. Inspect and update them with:

```sh
npx skills list -g
npx skills update -g
```
