import type React from 'react';
import { cn } from '@/lib/utils.js';
import { textChange } from './text-change.js';

/** The tidied text the person was shown, with what they removed struck and what they added marked. */
function TextChange({ shown, saved }: { shown: string; saved: string }) {
  let offset = 0;
  return (
    <p className="whitespace-pre-wrap">
      {textChange(shown, saved).map((segment) => {
        const key = `${segment.kind}-${offset}`;
        offset += segment.text.length;
        return (
          <span
            key={key}
            className={cn(
              segment.kind !== 'same' && 'rounded-sm px-0.5',
              segment.kind === 'removed' && 'bg-red-500/15 text-red-700 line-through dark:text-red-300',
              segment.kind === 'added' && 'bg-green-500/15 text-green-700 dark:text-green-300',
            )}
          >
            {segment.text}
          </span>
        );
      })}
    </p>
  );
}

function LabelledText({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="whitespace-pre-wrap text-sm">{children}</div>
    </div>
  );
}

/** One Transcription's text as it travelled: what was heard, what the person was shown, and what they kept. */
export function TranscriptionTexts({
  rawText,
  shownText,
  savedText,
}: {
  rawText: string;
  shownText: string;
  savedText: string | null;
}) {
  return (
    <div className="grid min-w-96 max-w-3xl gap-2">
      <LabelledText label="Heard">{rawText}</LabelledText>
      <LabelledText label="Shown">{shownText}</LabelledText>
      <LabelledText label="Kept">
        {savedText === null ? '—' : <TextChange shown={shownText} saved={savedText} />}
      </LabelledText>
    </div>
  );
}
