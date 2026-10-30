import { getPlantDateNow } from '@pkg/domain';
import { CAPTURE_VALUE_INVALID, captureRefusals, readAtFromPicker, readAtInputValue } from '@pkg/domain/contracting';
import type React from 'react';
import { useId, useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DateTimeInput } from '@/components/form/fields/DateTimePickerField.js';
import { Button } from '@/components/ui/button.js';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field.js';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group.js';
import { ReadingCaptureCard } from './ReadingCaptureFields.js';
import type { ReadingCapture } from './use-reading-capture.js';

const warningCard = 'space-y-3 rounded-lg border border-warning/45 bg-warning/10 p-3';

/**
 * A capture as four steps, each shown once the one before it is answered: when the meter was read, the hours with the
 * date the ledger puts them at, that date to vouch for, and the dialog's own details. The server still judges Save.
 */
export function CaptureWizard({ capture, children }: { capture: ReadingCapture; children: React.ReactNode }) {
  const { verdict } = capture;
  return (
    <div className="grid min-w-0 gap-4">
      <ErrorMessage
        error={capture.latestQuery.error}
        fallbackMessage="Unable to load the Machine's previous reading."
      />
      <WhenButtons capture={capture} />
      {verdict.step !== 'when' ? <HoursStep capture={capture} /> : null}
      {verdict.date ? <DateStep capture={capture} /> : null}
      {verdict.step === 'details' ? <div className="min-w-0 space-y-4 border-t pt-4">{children}</div> : null}
      {capture.error ? (
        <p className="text-destructive" role="alert">
          {capture.error}
        </p>
      ) : null}
    </div>
  );
}

function WhenButtons({ capture }: { capture: ReadingCapture }) {
  const heading = useId();
  const { when } = capture.steps;
  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium" id={heading}>
        When was the meter read?
      </span>
      <fieldset aria-labelledby={heading} className="grid grid-cols-2 gap-2">
        {(['today', 'earlier'] as const).map((choice) => (
          <Button
            aria-pressed={when === choice}
            key={choice}
            onClick={() => capture.dispatch({ type: 'when', when: choice })}
            size="lg"
            type="button"
            variant={when === choice ? 'default' : 'outline'}
          >
            {choice === 'today' ? 'Today' : 'Earlier'}
          </Button>
        ))}
      </fieldset>
    </div>
  );
}

function HoursStep({ capture }: { capture: ReadingCapture }) {
  const id = useId();
  const { latest, latestQuery, estimateQuery, verdict } = capture;
  const invalid = capture.value.trim() !== '' && verdict.parsed === null;
  return (
    <div className="space-y-2">
      <ReadingCaptureCard
        previousValue={latest === undefined ? undefined : (latest?.value ?? null)}
        loading={latestQuery.isPending}
      >
        <Field data-invalid={invalid}>
          <FieldLabel className="text-xs" htmlFor={id}>
            Hours on the meter
          </FieldLabel>
          <InputGroup>
            <InputGroupInput
              aria-invalid={invalid}
              className="text-lg font-semibold md:text-lg"
              id={id}
              inputMode="decimal"
              name="value"
              onChange={(event) => capture.editValue(event.target.value)}
              placeholder="e.g. 1234.5"
              type="text"
              value={capture.value}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>hours</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          {invalid ? <FieldError>{CAPTURE_VALUE_INVALID}</FieldError> : null}
        </Field>
      </ReadingCaptureCard>
      {estimateQuery.working ? (
        <FieldDescription>Working out the date…</FieldDescription>
      ) : !verdict.estimateLine ? null : estimateQuery.estimate?.kind === 'impossible' ? (
        <p className="text-sm text-destructive" role="alert">
          {verdict.estimateLine}
        </p>
      ) : (
        <FieldDescription>{verdict.estimateLine}</FieldDescription>
      )}
      <ErrorMessage error={estimateQuery.error} fallbackMessage="Unable to work out when the meter was read." />
    </div>
  );
}

function DateStep({ capture }: { capture: ReadingCapture }) {
  const { verdict } = capture;
  const date = verdict.date;
  // What the picker shows while it names no whole time, so a half-typed time stays on screen.
  const [typed, setTyped] = useState('');
  if (!date) return null;
  return (
    <div className="space-y-3">
      {date.locked ? (
        <p className="text-sm font-medium">{date.line}</p>
      ) : date.open ? (
        <DateTimeInput
          label="Read At"
          maxValue={getPlantDateNow()}
          name="readAt"
          onChange={(value) => {
            const at = readAtFromPicker(value, date.readAt);
            setTyped(at ? '' : value);
            capture.dispatch(at ? { type: 'date-picked', readAt: at } : { type: 'date-unconfirmed' });
          }}
          value={typed || readAtInputValue(date.readAt ?? new Date())}
        />
      ) : (
        <Button
          className="w-full justify-start"
          onClick={() => capture.dispatch({ type: 'date-opened' })}
          type="button"
          variant="outline"
        >
          {date.line}
        </Button>
      )}
      {date.futureReadAt ? (
        <p className="text-sm text-destructive" role="alert">
          {captureRefusals['future-read-at'].message}
        </p>
      ) : null}
      {date.warningLines.length ? (
        <div className={warningCard}>
          {date.warningLines.map((line) => (
            <p className="text-sm" key={line}>
              {line}
            </p>
          ))}
        </div>
      ) : null}
      {verdict.step === 'date' ? (
        <Button
          className="w-full"
          disabled={!date.confirmable || typed !== ''}
          onClick={() => capture.dispatch({ type: 'date-confirmed', verdict })}
          type="button"
        >
          Date looks good
        </Button>
      ) : null}
    </div>
  );
}
