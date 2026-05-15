# Stage Completion Is a One-Way Latch

Stage completion is represented by `job_stage.completed_at`. Once set, it is not cleared by normal workflow. A completed Stage may still have its Stage Status changed afterward, but those status edits do not reopen the Stage or block downstream work.

## Decision

- Completing a Stage sets both `completed_at` and `status = 'complete'`.
- Selecting the `complete` Stage Status uses the same completion semantics as the explicit complete transition.
- Selecting `complete` for a Stage whose `completed_at` is already set never rewrites the timestamp. If the current status is not `complete`, only `status` changes back to `complete`; if the current status is already `complete`, the request is a true no-op with no extra audit event.
- Selecting a non-complete Stage Status after completion updates only `status`; it never clears `completed_at`.
- Stage mutation guards still apply to no-op completion requests. The Job must be active and the User must be allowed to edit the Stage.

## Considered Options

- **Treat Stage Status as purely cosmetic.** Rejected: it allowed `status = 'complete'` without `completed_at`, making the UI say a Stage was complete while the Pipeline remained blocked.
- **Clear `completed_at` when status moves away from `complete`.** Rejected: `completed_at` is historical workflow state. Clearing it would have downstream effects on sequencing, reporting, and audit meaning.
- **Hide `complete` from the status selector.** Rejected: users may need to move a completed Stage's status away from `complete` for late edits, then select `complete` again without rewriting completion history.

## Consequences

- Code must treat `completed_at` as the source of truth for Pipeline reachability.
- `status = 'complete'` is a user-facing status label that is synchronized with completion when first selected, but it is not the source of truth for downstream gating.
- Tests should cover both entry points: explicit complete transition and selecting the `complete` status.
