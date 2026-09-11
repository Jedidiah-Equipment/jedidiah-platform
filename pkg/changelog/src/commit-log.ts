import { formatTouchHint, touchedBusinesses } from './path-hints.js';

/** ASCII record and unit separators, safe against anything a commit message can contain. */
export const RECORD_SEPARATOR = String.fromCharCode(0x1e);
export const UNIT_SEPARATOR = String.fromCharCode(0x1f);

/** The git pretty format that pairs with {@link parseNameOnlyLog} when combined with `--name-only`. */
export const GIT_PRETTY_FORMAT = '%x1e%h%x1f%s%x1f%b%x1f';

export interface ReleaseCommit {
  hash: string;
  subject: string;
  body: string;
  /** Paths the commit touched, as git reports them (repo-relative). */
  paths: string[];
}

/**
 * Parses `git log --pretty=format:<GIT_PRETTY_FORMAT> --name-only` output. With a custom format git
 * prints each commit's fields and then its touched paths one per line; the format terminates the body
 * with a unit separator so a multi-paragraph or empty body never bleeds into the paths. Pure.
 */
export function parseNameOnlyLog(stdout: string): ReleaseCommit[] {
  return stdout
    .split(RECORD_SEPARATOR)
    .filter((record) => record.length > 0)
    .map((record) => {
      const [hash = '', subject = '', body = '', pathBlock = ''] = record.split(UNIT_SEPARATOR);
      const paths = pathBlock
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      return { hash, subject, body: body.trim(), paths };
    });
}

/**
 * Renders the commit log the model reads: `<hash> <subject> [touches: …]` per commit, oldest first,
 * with any body indented beneath. The hint is derived from the touched paths so the model's business
 * classification rests on the wall, with the commit scope as tie-breaker only. Pure.
 */
export function formatReleaseCommitLog(commits: readonly ReleaseCommit[]): string {
  return commits
    .map((commit) => {
      const head = `${commit.hash} ${commit.subject} ${formatTouchHint(touchedBusinesses(commit.paths))}`;
      if (commit.body.length === 0) return head;
      const body = commit.body
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n');
      return `${head}\n${body}`;
    })
    .join('\n');
}
