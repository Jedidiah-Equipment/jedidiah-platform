# Repo-local skills

Keep skills and their supporting files in `skills/<name>/`. Codex discovers this directory directly;
Claude Code uses the committed `.claude/skills -> ../.agents/skills` symlink. A fresh checkout includes
the skills without a global installation.

`../skills-lock.json` records snapshots of the personal global collection, including customised versions
of upstream skills. Their source points back into this repo, so they can be maintained here without
depending on a user's home directory.

Inspect the project installation with:

```sh
npx skills list --agent codex claude-code
```

Add an upstream skill with:

```sh
npx skills add owner/repo --skill skill-name --agent codex claude-code --yes
```

Edit local snapshots directly. Review the diff after imports: installing an existing skill name
replaces its local files.
Keep supporting resources and license notices alongside imported skills; Matt Pocock's MIT notice is
in `LICENSE-MATT-POCOCK.txt`.
