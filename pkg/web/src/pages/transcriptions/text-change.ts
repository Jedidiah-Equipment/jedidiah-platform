export type TextChangeSegment = { kind: 'same' | 'removed' | 'added'; text: string };

/** The word-level change from one text to another, as runs of kept, removed and added text. */
export function textChange(before: string, after: string): TextChangeSegment[] {
  const from = before.split(/(\s+)/).filter(Boolean);
  const to = after.split(/(\s+)/).filter(Boolean);
  // Longest common subsequence of tokens, filled from the end so the walk below reads forwards.
  const width = to.length + 1;
  const common = new Uint16Array((from.length + 1) * width);
  for (let i = from.length - 1; i >= 0; i--)
    for (let j = to.length - 1; j >= 0; j--)
      common[i * width + j] =
        from[i] === to[j]
          ? (common[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(common[(i + 1) * width + j] ?? 0, common[i * width + j + 1] ?? 0);

  const segments: TextChangeSegment[] = [];
  const push = (kind: TextChangeSegment['kind'], text: string) => {
    const last = segments.at(-1);
    if (last?.kind === kind) last.text += text;
    else segments.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < from.length || j < to.length) {
    if (i < from.length && j < to.length && from[i] === to[j]) {
      push('same', from[i++] ?? '');
      j++;
    } else if (
      i < from.length &&
      (j === to.length || (common[(i + 1) * width + j] ?? 0) >= (common[i * width + j + 1] ?? 0))
    ) {
      // On a tie the removal goes first, so a replacement reads as removed-then-added.
      push('removed', from[i++] ?? '');
    } else {
      push('added', to[j++] ?? '');
    }
  }
  return segments;
}
