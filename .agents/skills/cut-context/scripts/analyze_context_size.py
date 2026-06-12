#!/usr/bin/env python3
"""Measure likely agent-context files in a repository."""

from __future__ import annotations

import argparse
from pathlib import Path


EXCLUDED_DIRS = {
    ".git",
    ".next",
    ".turbo",
    "build",
    "coverage",
    "dist",
    "node_modules",
}


def is_excluded(rel_path: Path) -> bool:
    return any(part in EXCLUDED_DIRS for part in rel_path.parts)


def line_count(text: str) -> int:
    if not text:
        return 0
    return text.count("\n") + (0 if text.endswith("\n") else 1)


def kind_for(rel_path: Path) -> str | None:
    parts = rel_path.parts

    if rel_path.name == "AGENTS.md":
        return "AGENTS.md"
    if rel_path.name == "CONTEXT.md":
        return "CONTEXT.md"
    if len(parts) >= 2 and parts[-2] == "adr" and rel_path.suffix == ".md":
        return "ADR"
    if len(parts) >= 2 and parts[0] == "docs" and parts[1] == "agents" and rel_path.suffix in {".md", ".yaml", ".yml"}:
        return "docs/agents"
    if len(parts) >= 3 and parts[0] == ".agents" and parts[1] == "skills" and rel_path.name == "SKILL.md":
        return "repo skill instructions"
    if len(parts) >= 4 and parts[0] == ".agents" and parts[1] == "skills" and parts[-2] == "agents":
        return "repo skill metadata"
    return None


def iter_files(root: Path) -> list[tuple[str, Path]]:
    files: list[tuple[str, Path]] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        rel_path = path.relative_to(root)
        if is_excluded(rel_path):
            continue
        kind = kind_for(rel_path)
        if kind is not None:
            files.append((kind, path))
    return sorted(files, key=lambda item: (item[0], str(item[1].relative_to(root))))


def print_row(values: list[str | int]) -> None:
    print("| " + " | ".join(str(value) for value in values) + " |")


def main() -> int:
    parser = argparse.ArgumentParser(description="Measure repo agent-context files.")
    parser.add_argument("repo", nargs="?", default=".", help="Repository root.")
    args = parser.parse_args()

    root = Path(args.repo).resolve()
    totals: dict[str, dict[str, int]] = {}
    rows = []

    for kind, path in iter_files(root):
        text = path.read_text(encoding="utf-8")
        stats = {
            "files": 1,
            "lines": line_count(text),
            "words": len(text.split()),
            "chars": len(text),
        }
        rows.append((kind, path.relative_to(root), stats))
        bucket = totals.setdefault(kind, {"files": 0, "lines": 0, "words": 0, "chars": 0})
        for key, value in stats.items():
            bucket[key] += value

    print("# Agent Context Size\n")
    print("| Kind | Path | Lines | Words | Chars | Est. tokens |")
    print("|---|---|---:|---:|---:|---:|")
    for kind, rel_path, stats in rows:
        print_row([kind, f"`{rel_path}`", stats["lines"], stats["words"], stats["chars"], round(stats["chars"] / 4)])

    print("\n## Totals\n")
    print("| Kind | Files | Lines | Words | Chars | Est. tokens |")
    print("|---|---:|---:|---:|---:|---:|")
    grand = {"files": 0, "lines": 0, "words": 0, "chars": 0}
    for kind in sorted(totals):
        stats = totals[kind]
        for key, value in stats.items():
            grand[key] += value
        print_row([kind, stats["files"], stats["lines"], stats["words"], stats["chars"], round(stats["chars"] / 4)])
    print_row(["TOTAL", grand["files"], grand["lines"], grand["words"], grand["chars"], round(grand["chars"] / 4)])

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
