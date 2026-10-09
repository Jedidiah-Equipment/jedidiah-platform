import { describeFileContentTypes, formatBytes, formatNumber } from '@pkg/domain';
import { BREAKDOWN_PHOTO_POLICY, breakdownUrgencyLabels } from '@pkg/domain/contracting';
import { UUID } from '@pkg/schema';
import {
  BREAKDOWN_MAX_PHOTOS,
  type BreakdownReportInput,
  type BreakdownUrgency,
  breakdownReportMultipartFields,
  breakdownUrgencies,
} from '@pkg/schema/contracting';
import { IconX } from '@tabler/icons-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button.js';
import { Field, FieldLabel } from '@/components/ui/field.js';
import { BreakdownUrgencyIcon } from '@/contracting/components/BreakdownSubjectLabel.js';
import { PhotoPicker } from '@/contracting/components/PhotoPicker.js';
import { breakdownReportUrl } from '@/contracting/lib/contracting-http-paths.js';
import { postMultipartJson } from '@/contracting/lib/post-multipart.js';
import { cn } from '@/lib/utils.js';

/** What each urgency means in the reporter's words, and the tint its banner and choice card wear. */
export const urgencyPresentation: Record<BreakdownUrgency, { className: string; detail: string }> = {
  'code-red': { className: 'border-red-500 bg-red-500/10', detail: 'Machine down: it cannot work.' },
  'code-green': {
    className: 'border-emerald-500 bg-emerald-500/10',
    detail: 'Still working: it can carry on for now.',
  },
};

/** The urgency banner: the Workshop's flag on a tinted card, so the reporter cannot miss which code they are in. */
export function UrgencyBanner({ urgency }: { urgency: BreakdownUrgency }) {
  const presentation = urgencyPresentation[urgency];
  return (
    <div className={cn('flex items-center gap-3 rounded-lg border p-3', presentation.className)} role="status">
      <BreakdownUrgencyIcon size={20} urgency={urgency} />
      <div className="min-w-0">
        <strong className="block text-sm font-semibold">{breakdownUrgencyLabels[urgency]}</strong>
        <span className="block text-xs text-muted-foreground">{presentation.detail}</span>
      </div>
    </div>
  );
}

/** One option of a radio group drawn as a card, side by side with its siblings. */
export function ChoiceCard({
  name,
  selected,
  onSelect,
  kicker,
  title,
  detail,
  icon,
  selectedClassName = 'border-primary bg-primary/10 ring-1 ring-primary',
}: {
  name: string;
  selected: boolean;
  onSelect: () => void;
  kicker?: string;
  title: string;
  detail?: string | null;
  icon?: React.ReactNode;
  selectedClassName?: string;
}) {
  return (
    <label
      className={cn(
        'flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
        selected ? selectedClassName : 'border-border hover:bg-muted/50',
      )}
    >
      <input checked={selected} className="sr-only" name={name} onChange={onSelect} type="radio" />
      {icon}
      <span className="min-w-0">
        {kicker ? <span className="block text-xs text-muted-foreground">{kicker}</span> : null}
        <strong className="block truncate text-sm font-semibold">{title}</strong>
        {detail ? <span className="block truncate text-xs text-muted-foreground">{detail}</span> : null}
      </span>
    </label>
  );
}

/** Code Red and Code Green as two cards, each in its own colour once picked. */
export function UrgencyChoice({
  name,
  value,
  onChange,
}: {
  name: string;
  /** The picked urgency, or `''` before one is picked. */
  value: string;
  onChange: (urgency: BreakdownUrgency) => void;
}) {
  return (
    <fieldset aria-label="How bad is it" className="grid grid-cols-2 gap-3">
      {breakdownUrgencies.map((urgency) => (
        <ChoiceCard
          detail={urgencyPresentation[urgency].detail}
          icon={<BreakdownUrgencyIcon size={20} urgency={urgency} />}
          key={urgency}
          name={name}
          onSelect={() => onChange(urgency)}
          selected={value === urgency}
          selectedClassName={urgencyPresentation[urgency].className}
          title={breakdownUrgencyLabels[urgency]}
        />
      ))}
    </fieldset>
  );
}

export type ReportPhoto = { id: string; file: File };

/** A picked photo before upload, previewed from the browser's own copy of the file. */
function PickedPhoto({ photo, index, onRemove }: { photo: File; index: number; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo]);
  return (
    <li className="relative size-20 overflow-hidden rounded-lg bg-muted">
      {url ? <img alt={photo.name} className="size-full object-cover" src={url} /> : null}
      <Button
        aria-label={`Remove photo ${formatNumber(index + 1)}`}
        className="absolute right-1 top-1 rounded-full bg-black/60 text-white hover:bg-black/75 hover:text-white"
        onClick={onRemove}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <IconX aria-hidden="true" />
      </Button>
    </li>
  );
}

/** Up to the Breakdown photo limit, picked one at a time under the photo policy and previewed before sending. */
export function ReportPhotosField({
  photos,
  onChange,
}: {
  photos: readonly ReportPhoto[];
  onChange: (photos: ReportPhoto[]) => void;
}) {
  const [error, setError] = useState('');
  return (
    <Field>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <FieldLabel>Photos</FieldLabel>
        <span className="text-xs text-muted-foreground">
          {formatNumber(photos.length)} of {formatNumber(BREAKDOWN_MAX_PHOTOS)} ·{' '}
          {describeFileContentTypes(BREAKDOWN_PHOTO_POLICY.allowedContentTypes)} · up to{' '}
          {formatBytes(BREAKDOWN_PHOTO_POLICY.maxBytes)}
        </span>
      </div>
      {photos.length ? (
        <ul className="flex flex-wrap gap-2">
          {photos.map((photo, index) => (
            <PickedPhoto
              index={index}
              key={photo.id}
              onRemove={() => onChange(photos.filter((entry) => entry.id !== photo.id))}
              photo={photo.file}
            />
          ))}
        </ul>
      ) : null}
      {photos.length < BREAKDOWN_MAX_PHOTOS ? (
        <PhotoPicker
          error={error}
          hideHeader
          label="Photo"
          onChange={(photo) => {
            if (photo) onChange([...photos, { id: crypto.randomUUID(), file: photo }].slice(0, BREAKDOWN_MAX_PHOTOS));
          }}
          onError={setError}
          photo={null}
          policy={BREAKDOWN_PHOTO_POLICY}
        />
      ) : null}
    </Field>
  );
}

const ReportedBreakdown = z.object({ id: UUID });

/** Reports one Breakdown with its photos through the multipart route, answering the stored Breakdown's id. */
export async function sendBreakdownReport(
  fields: Parameters<typeof breakdownReportMultipartFields>[0] & Pick<BreakdownReportInput, 'subject'>,
  photos: readonly ReportPhoto[],
) {
  const body = new FormData();
  for (const [name, value] of breakdownReportMultipartFields(fields)) body.append(name, value);
  for (const photo of photos) body.append('photo', photo.file, photo.file.name);
  return ReportedBreakdown.parse(
    await postMultipartJson(breakdownReportUrl(), body, 'Unable to report the Breakdown.'),
  );
}
