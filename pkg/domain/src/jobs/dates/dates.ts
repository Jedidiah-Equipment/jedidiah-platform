export type DateCascadeMode = 'create' | 'shift';
export type DateCascadeAnchorKind = 'start' | 'end';

export type StickyInput = {
  setManually?: boolean;
  value: Date | null;
};

export type CascadeDownAnchor = {
  kind: DateCascadeAnchorKind;
  previousValue?: Date | null;
  value: Date;
};

export type CascadeDownDuration<Key extends string = string> = {
  durationDays: number;
  key: Key;
};

export type CascadeDownLevelDates<Key extends string = string> = {
  dueEnd: Date | null;
  dueStart: Date | null;
  key: Key;
};

export type CascadeDownStickyMarkers<Key extends string = string> = {
  dueEndSetManually?: boolean;
  dueStartSetManually?: boolean;
  key: Key;
};

export type CascadeDownInput<Key extends string = string> = {
  anchor: CascadeDownAnchor;
  currentLevels: readonly CascadeDownLevelDates<Key>[];
  durations: readonly CascadeDownDuration<Key>[];
  mode?: DateCascadeMode;
  stickyMarkers?: readonly CascadeDownStickyMarkers<Key>[];
};

export type CascadeUpChild = {
  actualEnd: Date | null;
  actualStart: Date | null;
};

export type CascadeUpParent = {
  actualEnd: Date | null;
  actualStart: Date | null;
};

export type CascadeUpStickyMarker = {
  actualEndSetManually?: boolean;
  actualStartSetManually?: boolean;
};

export type CascadeUpInput = {
  children: readonly CascadeUpChild[];
  currentParent: CascadeUpParent;
  stickyMarker?: CascadeUpStickyMarker;
};

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function resolveSticky(input: StickyInput): boolean {
  return Boolean(input.value && (input.setManually ?? false));
}

// Due-date cascade inputs are UTC date-only values; shifts operate in whole UTC calendar days.
export function cascadeDown<Key extends string = string>(input: CascadeDownInput<Key>): CascadeDownLevelDates<Key>[] {
  if ((input.mode ?? 'shift') === 'create') {
    return cascadeDownCreate(input);
  }

  return cascadeDownShift(input);
}

export function cascadeUp(input: CascadeUpInput): CascadeUpParent {
  const derivedStart = minDate(input.children.map((child) => child.actualStart));
  const derivedEnd = maxDate(input.children.map((child) => child.actualEnd));
  const actualStartSticky = resolveSticky({
    value: input.currentParent.actualStart,
    setManually: input.stickyMarker?.actualStartSetManually ?? false,
  });
  const actualEndSticky = resolveSticky({
    value: input.currentParent.actualEnd,
    setManually: input.stickyMarker?.actualEndSetManually ?? false,
  });

  return {
    actualEnd: actualEndSticky ? cloneDate(input.currentParent.actualEnd) : derivedEnd,
    actualStart: actualStartSticky ? cloneDate(input.currentParent.actualStart) : derivedStart,
  };
}

function cascadeDownShift<Key extends string>(input: CascadeDownInput<Key>): CascadeDownLevelDates<Key>[] {
  const previousValue = input.anchor.previousValue;
  const deltaDays = previousValue ? getWholeDayDelta(previousValue, input.anchor.value) : 0;
  const stickyByKey = createStickyMap(input.stickyMarkers);

  return input.currentLevels.map((level) => {
    const sticky = stickyByKey.get(level.key);

    return {
      key: level.key,
      dueEnd: resolveSticky({
        value: level.dueEnd,
        setManually: sticky?.dueEndSetManually ?? false,
      })
        ? cloneDate(level.dueEnd)
        : addDays(level.dueEnd, deltaDays),
      dueStart: resolveSticky({
        value: level.dueStart,
        setManually: sticky?.dueStartSetManually ?? false,
      })
        ? cloneDate(level.dueStart)
        : addDays(level.dueStart, deltaDays),
    };
  });
}

function cascadeDownCreate<Key extends string>(input: CascadeDownInput<Key>): CascadeDownLevelDates<Key>[] {
  const generatedByKey = input.anchor.kind === 'start' ? buildForward(input) : buildBackward(input);
  const currentByKey = new Map(input.currentLevels.map((level) => [level.key, level]));
  const stickyByKey = createStickyMap(input.stickyMarkers);

  return input.durations.map(({ key }) => {
    const generated = generatedByKey.get(key);
    if (!generated) {
      throw new Error(`Missing generated date window for ${key}.`);
    }

    const current = currentByKey.get(key);
    const sticky = stickyByKey.get(key);
    const currentDueStart = current?.dueStart ?? null;
    const currentDueEnd = current?.dueEnd ?? null;

    return {
      key,
      dueEnd: resolveSticky({
        value: currentDueEnd,
        setManually: sticky?.dueEndSetManually ?? false,
      })
        ? cloneDate(currentDueEnd)
        : generated.dueEnd,
      dueStart: resolveSticky({
        value: currentDueStart,
        setManually: sticky?.dueStartSetManually ?? false,
      })
        ? cloneDate(currentDueStart)
        : generated.dueStart,
    };
  });
}

function buildForward<Key extends string>(
  input: CascadeDownInput<Key>,
): Map<Key, Omit<CascadeDownLevelDates<Key>, 'key'>> {
  const generatedByKey = new Map<Key, Omit<CascadeDownLevelDates<Key>, 'key'>>();
  let cursor = cloneDate(input.anchor.value);

  for (const duration of input.durations) {
    const dueStart = cloneDate(cursor);
    const dueEnd = addDays(cursor, duration.durationDays);
    generatedByKey.set(duration.key, { dueEnd, dueStart });
    cursor = dueEnd;
  }

  return generatedByKey;
}

function buildBackward<Key extends string>(
  input: CascadeDownInput<Key>,
): Map<Key, Omit<CascadeDownLevelDates<Key>, 'key'>> {
  const generatedReverseByKey = new Map<Key, Omit<CascadeDownLevelDates<Key>, 'key'>>();
  let cursor = cloneDate(input.anchor.value);

  for (const duration of [...input.durations].reverse()) {
    const dueEnd = cloneDate(cursor);
    const dueStart = addDays(cursor, -duration.durationDays);
    generatedReverseByKey.set(duration.key, { dueEnd, dueStart });
    cursor = dueStart;
  }

  return new Map(
    input.durations.map((duration) => {
      const generated = generatedReverseByKey.get(duration.key);
      if (!generated) {
        throw new Error(`Missing generated date window for ${duration.key}.`);
      }

      return [duration.key, generated] as const;
    }),
  );
}

function createStickyMap<Key extends string>(
  stickyMarkers: readonly CascadeDownStickyMarkers<Key>[] | undefined,
): Map<Key, CascadeDownStickyMarkers<Key>> {
  return new Map((stickyMarkers ?? []).map((marker) => [marker.key, marker]));
}

function addDays(date: Date, days: number): Date;
function addDays(date: Date | null, days: number): Date | null;
function addDays(date: Date | null, days: number): Date | null {
  if (!date) return null;

  const result = cloneDate(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function getWholeDayDelta(previousValue: Date, nextValue: Date): number {
  return Math.round((nextValue.getTime() - previousValue.getTime()) / MILLISECONDS_PER_DAY);
}

function cloneDate(date: Date): Date;
function cloneDate(date: Date | null): Date | null;
function cloneDate(date: Date | null): Date | null {
  return date ? new Date(date.getTime()) : null;
}

function minDate(dates: readonly (Date | null)[]): Date | null {
  const timestamps = dates.filter((date): date is Date => Boolean(date)).map((date) => date.getTime());
  if (timestamps.length === 0) return null;

  return new Date(Math.min(...timestamps));
}

function maxDate(dates: readonly (Date | null)[]): Date | null {
  const timestamps = dates.filter((date): date is Date => Boolean(date)).map((date) => date.getTime());
  if (timestamps.length === 0) return null;

  return new Date(Math.max(...timestamps));
}
