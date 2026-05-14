// Sequential Reviewer — implement-then-review loop
//
// This template drives a two-phase workflow per issue:
//   Phase 1 (Implement): A sonnet agent picks an open issue, works on it
//                        on a dedicated branch, commits the changes, and signals
//                        completion.
//   Phase 2 (Review):    A second sonnet agent reviews the branch diff and either
//                        approves it or makes corrections directly on the branch.
//
// Both phases share a single sandbox created via createSandbox(), so the
// implementer and reviewer work on the same explicit branch.
//
// The outer loop repeats up to MAX_ITERATIONS times, processing one issue per
// iteration. This is a middle-complexity option between the simple-loop (no review
// gate) and the parallel-planner (concurrent execution with a planning phase).
//
// Usage:
//   npx tsx .sandcastle/main.mts
// Or add to package.json:
//   "scripts": { "sandcastle": "npx tsx .sandcastle/main.mts" }

import * as sandcastle from '@ai-hero/sandcastle';
import { docker } from '@ai-hero/sandcastle/sandboxes/docker';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Maximum number of implement→review cycles to run before stopping.
// Each cycle works on one issue. Raise this to process more issues per run.
const MAX_ITERATIONS = 10;

// Hooks run inside the sandbox before the agent starts each iteration.
// Codex needs an explicit login inside the container; the API key env var
// alone is not used by `codex exec`.
// npm install ensures the sandbox always has fresh dependencies.
const hooks = {
  sandbox: {
    onSandboxReady: [
      {
        command:
          'if printenv OPENAI_KEY >/dev/null; then printenv OPENAI_KEY | codex login --with-api-key; elif printenv OPENAI_API_KEY >/dev/null; then printenv OPENAI_API_KEY | codex login --with-api-key; else echo "Missing OPENAI_KEY or OPENAI_API_KEY for Codex"; exit 1; fi',
      },
      { command: 'npm install' },
    ],
  },
};

// Copy node_modules from the host into the worktree before each sandbox
// starts. Avoids a full npm install from scratch; the hook above handles
// platform-specific binaries and any packages added since the last copy.
const copyToWorktree = ['node_modules'];

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  // Generate a unique branch name for this iteration.
  const branch = `sandcastle/sequential-reviewer/${Date.now()}`;

  // Create a single sandbox that both the implementer and reviewer share.
  // This gives both agents a real, named branch that persists across phases.
  const sandbox = await sandcastle.createSandbox({
    branch,
    sandbox: docker({
      containerGid: 0,
      env: {
        COMPOSE_PROJECT_NAME: 'jedidiah-platform',
        DATABASE_URL: 'postgres://postgres:postgres@host.docker.internal:5432/jedidiah',
        TEST_DATABASE_URL: 'postgres://postgres:postgres@host.docker.internal:5432/jedidiah_template',
      },
      mounts: [
        {
          hostPath: '/var/run/docker.sock',
          sandboxPath: '/var/run/docker.sock',
        },
      ],
    }),
    hooks,
    copyToWorktree,
  });

  try {
    // -----------------------------------------------------------------------
    // Phase 1: Implement
    //
    // A sonnet agent picks the next open issue, writes the
    // implementation (using RGR: Red → Green → Repeat → Refactor), and
    // commits the result.
    //
    // The agent signals completion via <promise>COMPLETE</promise> when done.
    // -----------------------------------------------------------------------
    const implement = await sandbox.run({
      name: 'implementer',
      maxIterations: 100,
      agent: sandcastle.codex('gpt-5.4-mini'),
      promptFile: './.sandcastle/implement-prompt.md',
    });

    if (!implement.commits.length) {
      console.log('Implementation agent made no commits. Skipping review.');
      continue;
    }

    console.log(`\nImplementation complete on branch: ${branch}`);
    console.log(`Commits: ${implement.commits.length}`);

    // -----------------------------------------------------------------------
    // Phase 2: Review
    //
    // A second sonnet agent reviews the diff of the branch produced by
    // Phase 1. It uses the {{BRANCH}} prompt argument to inspect the right
    // branch, and either approves or makes corrections directly on the branch.
    // -----------------------------------------------------------------------
    await sandbox.run({
      name: 'reviewer',
      maxIterations: 1,
      agent: sandcastle.codex('gpt-5.4-mini'),
      promptFile: './.sandcastle/review-prompt.md',
      promptArgs: {
        BRANCH: branch,
      },
    });

    console.log('\nReview complete.');
  } finally {
    await sandbox.close();
  }
}

console.log('\nAll done.');
