# Repo-local skills

Keep skills and their supporting files in `skills/<name>/`. Codex discovers this directory directly;
Claude Code uses the committed `.claude/skills -> ../.agents/skills` symlink. A fresh checkout includes
the skills without a global installation.

`../skills-lock.json` links every skill to its upstream GitHub source. `use-slot` is the exception: it is
private to this repo, has no lock entry, and is edited here directly.

Inspect the project installation with:

```sh
npx skills list --agent codex claude-code
```

Add an upstream skill with:

```sh
npx skills add owner/repo --skill skill-name --agent codex claude-code --yes
```

Update every linked skill with:

```sh
npx skills update -p -y
```

Change a linked skill upstream, not here: an update replaces its local files. Review the diff after
every update or import.
Keep supporting resources and license notices alongside imported skills; Matt Pocock's MIT notice is
in `LICENSE-MATT-POCOCK.txt`.
