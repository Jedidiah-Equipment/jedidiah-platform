#!/bin/sh

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
REMOTE=${REMOTE:-origin}
SOURCE_BRANCH=${SOURCE_BRANCH:-main}
TARGET_BRANCH=${TARGET_BRANCH:-production}
DRY_RUN=0
YES=0

usage() {
  cat <<USAGE
Usage: pnpm release:production [--dry-run] [--yes]

Fast-forward the production branch to the current remote main branch.

Options:
  --dry-run  Check and print what would be released without pushing.
  --yes      Skip the interactive confirmation prompt.
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

if [ "$DRY_RUN" -eq 1 ]; then
  echo
  echo "Dry run only; no push performed."
  exit 0
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

git -C "$ROOT" push "$REMOTE" "$SOURCE_REF:refs/heads/$TARGET_BRANCH"
