# Issue Tracker

Issues and PRDs live in GitHub Issues for `Jedidiah-Equipment/jedidiah-platform`.

- Create: `gh issue create --title "..." --body-file <file>`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open --json number,title,body,labels,comments`
- Comment: `gh issue comment <number> --body-file <file>`
- Edit labels: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- Close: `gh issue close <number> --comment "..."`

Use a temporary body file for multi-line issue text.
