#!/bin/sh

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
REMOTE=${REMOTE:-origin}
SOURCE_BRANCH=${SOURCE_BRANCH:-main}
TARGET_BRANCH=${TARGET_BRANCH:-production}
CHANGELOG_DIR="$ROOT/changelogs"
DRY_RUN=0
YES=0
SKIP_CHANGELOG=0

usage() {
  cat <<USAGE
Usage: pnpm release:production [--dry-run] [--yes] [--skip-changelog]

Generate the release Changelog, commit it to $SOURCE_BRANCH, then fast-forward the
$TARGET_BRANCH branch to it.

Options:
  --dry-run          Check and preview what would be released without pushing.
  --yes              Skip the interactive confirmation prompt.
  --skip-changelog   Release without generating a Changelog (pure fast-forward of
                     $SOURCE_BRANCH to $TARGET_BRANCH; does not touch your working tree).
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --)
      ;;
    --dry-run)
      DRY_RUN=1
      ;;
    --yes|-y)
      YES=1
      ;;
    --skip-changelog)
      SKIP_CHANGELOG=1
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

SOURCE_REF="refs/remotes/$REMOTE/$SOURCE_BRANCH"
TARGET_REF="refs/remotes/$REMOTE/$TARGET_BRANCH"

git -C "$ROOT" fetch --prune "$REMOTE" \
  "+refs/heads/$SOURCE_BRANCH:$SOURCE_REF" \
  "+refs/heads/$TARGET_BRANCH:$TARGET_REF"

SOURCE_SHA=$(git -C "$ROOT" rev-parse "$SOURCE_REF")
TARGET_SHA=$(git -C "$ROOT" rev-parse "$TARGET_REF")

if [ "$SOURCE_SHA" = "$TARGET_SHA" ]; then
  echo "$TARGET_BRANCH is already at $SOURCE_BRANCH ($SOURCE_SHA)."
  exit 0
fi

if ! git -C "$ROOT" merge-base --is-ancestor "$TARGET_SHA" "$SOURCE_SHA"; then
  echo "Refusing to release: $TARGET_BRANCH contains commits that are not on $SOURCE_BRANCH." >&2
  echo >&2
  git -C "$ROOT" log --oneline "$SOURCE_REF..$TARGET_REF" >&2
  echo >&2
  echo "Realign $TARGET_BRANCH to a commit reachable from $SOURCE_BRANCH before releasing." >&2
  exit 1
fi

echo "Release target:"
echo "  $SOURCE_BRANCH    $SOURCE_SHA"
echo "  $TARGET_BRANCH -> $SOURCE_SHA"
echo
echo "Commits to release:"
git -C "$ROOT" log --oneline --reverse "$TARGET_REF..$SOURCE_REF"

# Runs the release-time Changelog tooling from the workspace.
changelog_cli() {
  ( cd "$ROOT" && pnpm --filter @pkg/changelog exec tsx src/cli.ts "$@" )
}

if [ "$DRY_RUN" -eq 1 ]; then
  if [ "$SKIP_CHANGELOG" -eq 0 ]; then
    echo
    echo "Changelog preview ($TARGET_BRANCH..$SOURCE_BRANCH):"
    # Generation failure aborts the check (set -e), matching the real release, which blocks here too.
    changelog_cli generate --from "$TARGET_REF" --to "$SOURCE_REF" --dir "$CHANGELOG_DIR" --repo "$ROOT" --dry-run
  fi
  echo
  echo "Dry run only; no push performed."
  exit 0
fi

# --- Changelog: generated and committed to $SOURCE_BRANCH before the fast-forward ---
COMMITTED_CHANGELOG=0
SWITCHED=0
ORIGINAL_REF=""

restore_checkout() {
  status=$?
  # Only clean up when we actually switched to the source branch. If the checkout never happened
  # (e.g. $SOURCE_BRANCH is checked out in another worktree), the user is still on their original
  # branch and it must not be touched.
  if [ "$SWITCHED" -eq 1 ]; then
    if [ "$COMMITTED_CHANGELOG" -eq 0 ]; then
      # Discard the generated-but-uncommitted changelog, scoped to changelogs/ — never a branch reset.
      git -C "$ROOT" checkout --quiet -- "$CHANGELOG_DIR" >/dev/null 2>&1 || true
      git -C "$ROOT" clean -fdq -- "$CHANGELOG_DIR" >/dev/null 2>&1 || true
    fi
    git -C "$ROOT" checkout --quiet "$ORIGINAL_REF" >/dev/null 2>&1 || true
  fi
  return "$status"
}

if [ "$SKIP_CHANGELOG" -eq 0 ]; then
  if [ -n "$(git -C "$ROOT" status --porcelain)" ]; then
    echo "Refusing to release: working tree is not clean." >&2
    echo "Commit or stash your changes, or pass --skip-changelog to release without a changelog." >&2
    exit 1
  fi

  ORIGINAL_REF=$(git -C "$ROOT" symbolic-ref --quiet --short HEAD || git -C "$ROOT" rev-parse HEAD)
  trap restore_checkout EXIT

  git -C "$ROOT" checkout --quiet "$SOURCE_BRANCH"
  SWITCHED=1
  if ! git -C "$ROOT" merge --ff-only "$SOURCE_REF" >/dev/null 2>&1; then
    echo "Refusing to release: local $SOURCE_BRANCH cannot fast-forward to $REMOTE/$SOURCE_BRANCH." >&2
    echo "Reconcile your local $SOURCE_BRANCH first." >&2
    exit 1
  fi

  echo
  echo "Generating changelog for $TARGET_BRANCH..$SOURCE_BRANCH ..."
  changelog_cli generate --from "$TARGET_REF" --to "$SOURCE_REF" --dir "$CHANGELOG_DIR" --repo "$ROOT"
  echo "Review (and edit if needed) the changelog above before confirming the release."
fi

if [ "$YES" -ne 1 ]; then
  if [ ! -t 0 ]; then
    echo "Refusing to release without confirmation in a non-interactive shell. Pass --yes to continue." >&2
    exit 1
  fi

  printf "Type '%s' to push %s to %s: " "$TARGET_BRANCH" "$SOURCE_BRANCH" "$TARGET_BRANCH"
  read -r CONFIRMATION

  if [ "$CONFIRMATION" != "$TARGET_BRANCH" ]; then
    echo "Release cancelled."
    exit 1
  fi
fi

if [ "$SKIP_CHANGELOG" -eq 0 ]; then
  # Re-validate (the file may have been edited during review), prune the display window, and commit.
  changelog_cli validate --dir "$CHANGELOG_DIR"
  changelog_cli prune --dir "$CHANGELOG_DIR"

  git -C "$ROOT" add -- "$CHANGELOG_DIR"
  if git -C "$ROOT" diff --cached --quiet; then
    echo "No changelog changes to commit."
  else
    git -C "$ROOT" commit --quiet -m "chore(changelog): release $(date -u +%Y-%m-%d)"
    git -C "$ROOT" push --quiet "$REMOTE" "$SOURCE_BRANCH"
    COMMITTED_CHANGELOG=1
    SOURCE_SHA=$(git -C "$ROOT" rev-parse "$SOURCE_BRANCH")
  fi
fi

git -C "$ROOT" push "$REMOTE" "$SOURCE_SHA:refs/heads/$TARGET_BRANCH"
