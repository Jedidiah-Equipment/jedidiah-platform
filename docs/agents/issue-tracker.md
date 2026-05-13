# Issue Tracker: GitHub

Issues and PRDs for this repo live as GitHub Issues in `Jedidiah-Equipment/jedidiah-platform`.
Use the `gh` CLI for issue operations from inside this clone; it can infer the repository from
`git remote -v`.

## Conventions

- Create an issue: `gh issue create --title "..." --body "..."`
- Read an issue: `gh issue view <number> --comments`
- List issues: `gh issue list --state open --json number,title,body,labels,comments`
- Comment on an issue: `gh issue comment <number> --body "..."`
- Apply a label: `gh issue edit <number> --add-label "..."`
- Remove a label: `gh issue edit <number> --remove-label "..."`
- Close an issue: `gh issue close <number> --comment "..."`

Use a heredoc or a body file for multi-line issue bodies.

## Skill Routing

When a skill says "publish to the issue tracker", create a GitHub issue.

When a skill says "fetch the relevant ticket", run `gh issue view <number> --comments`.
