import { type CaptureAttempt, type CaptureWorld, judgeCapture } from '@pkg/domain/contracting';
import { ReadingValue } from '@pkg/schema/contracting';

/**
 * Everything the capture form decides, so the Save button and save() share one predicate: the form
 * parses the typed value and gates its own affordances; the capture rules judge the parsed reading.
 */
export function deriveCapture({
  value,
  world,
  capture,
  canCapture,
  machineKnown,
  cameraOpen,
}: {
  value: string;
  world: CaptureWorld;
  capture: Omit<CaptureAttempt, 'value'>;
  canCapture: boolean;
  machineKnown: boolean;
  cameraOpen: boolean;
}) {
  const parsed = value.trim() ? ReadingValue.safeParse(Number(value.replace(',', '.'))) : null;
  const verdict = parsed?.success ? judgeCapture(world, { ...capture, value: parsed.data }) : null;
  // What the phone believes is on site may be stale offline, and the server's constraint decides under
  // the lock; a busy refusal here warns without blocking the capture.
  const advisory = !!verdict && !verdict.ok && (verdict.rule === 'machine-busy' || verdict.rule === 'implement-busy');
  const canSave = (!!verdict?.ok || advisory) && canCapture && machineKnown && !cameraOpen;
  return { parsed, verdict, advisory, canSave };
}
