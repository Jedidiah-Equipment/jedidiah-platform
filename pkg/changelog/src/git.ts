import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Reads the released commit log for `from..to`, oldest first, as `<hash> <subject>` lines with any
 * body indented beneath. This is the material the model summarises; it may inspect individual
 * diffs itself via its own tools when a subject is vague.
 */
export async function readReleaseCommitLog(from: string, to: string, cwd: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'git',
    ['-C', cwd, 'log', '--reverse', '--no-merges', '--pretty=format:%h %s%n%w(0,4,4)%b', `${from}..${to}`],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  return stdout.trim();
}
