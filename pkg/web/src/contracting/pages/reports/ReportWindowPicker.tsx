import {
  changeReportWindowKind,
  formatReportWindowParam,
  reportWindowLabel,
  resolveReportWindow,
  shiftReportWindow,
} from '@pkg/domain/contracting';
import type { DateOnlyIso } from '@pkg/schema';
import { type ReportWindowInput, type ReportWindowKind, reportWindowKinds } from '@pkg/schema/contracting';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { EnumSelect } from '@/components/common/EnumSelect.js';
import { Button } from '@/components/ui/button.js';

const kindLabels: Record<ReportWindowKind, string> = { month: 'Month', quarter: 'Quarter', year: 'Year' };

/** A calendar month, quarter or year, stepped one period at a time; never past the period holding today. */
export function ReportWindowPicker({
  window,
  today,
  onChange,
}: {
  window: ReportWindowInput;
  today: DateOnlyIso;
  onChange: (param: string) => void;
}) {
  const next = shiftReportWindow(window, 1);
  const nextIsFuture = resolveReportWindow(next, today).days === 0;
  const go = (input: ReportWindowInput) => onChange(formatReportWindowParam(input));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <EnumSelect
        aria-label="Report period"
        labels={kindLabels}
        options={reportWindowKinds}
        value={window.kind}
        onChange={(kind) => go(changeReportWindowKind(window, kind))}
      />
      <Button
        aria-label="Previous period"
        size="icon"
        variant="outline"
        onClick={() => go(shiftReportWindow(window, -1))}
      >
        <IconChevronLeft />
      </Button>
      <span className="min-w-32 text-center text-sm font-medium tabular-nums">{reportWindowLabel(window)}</span>
      <Button aria-label="Next period" size="icon" variant="outline" disabled={nextIsFuture} onClick={() => go(next)}>
        <IconChevronRight />
      </Button>
    </div>
  );
}
