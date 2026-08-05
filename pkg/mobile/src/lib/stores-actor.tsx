import { isStoresActorExpired } from '@pkg/domain';
import type { QuickSwitchActor } from '@pkg/schema';
import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

/**
 * Who is standing at the shared stores tablet (spec §11). Deliberately not a session — the tablet
 * signs in once and stays signed in; this only names who the next movement is attributed to.
 *
 * Nothing is persisted, so a tablet that slept or restarted has nobody at it. That is the honest
 * starting state for a device anyone can pick up, and with no PIN behind the name (spec §13) the
 * idle timeout is the only control there is.
 */
type StoresActorContextValue = {
  actor: QuickSwitchActor | null;
  clearActor: () => void;
  /** Call on any deliberate interaction to hold the actor; a no-op when nobody is selected. */
  keepAlive: () => void;
  selectActor: (actor: QuickSwitchActor) => void;
};

const StoresActorContext = createContext<StoresActorContextValue | null>(null);

/** How often the idle check runs. Finer than the timeout so expiry lands close to when it is due. */
const IDLE_TICK_MS = 15_000;

export const StoresActorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [actor, setActor] = useState<QuickSwitchActor | null>(null);
  const lastInteractionAt = useRef(Date.now());

  const selectActor = useCallback((next: QuickSwitchActor) => {
    lastInteractionAt.current = Date.now();
    setActor(next);
  }, []);

  const clearActor = useCallback(() => setActor(null), []);

  const keepAlive = useCallback(() => {
    lastInteractionAt.current = Date.now();
  }, []);

  // The timer only runs while somebody is selected: an unattended tablet with nobody at it has
  // nothing to forget, and a permanently ticking interval on a device that never sleeps is waste.
  useEffect(() => {
    if (actor === null) return;

    const interval = setInterval(() => {
      if (isStoresActorExpired({ lastInteractionAt: lastInteractionAt.current, now: Date.now() })) {
        setActor(null);
      }
    }, IDLE_TICK_MS);

    return () => clearInterval(interval);
  }, [actor]);

  const value = useMemo(
    () => ({ actor, clearActor, keepAlive, selectActor }),
    [actor, clearActor, keepAlive, selectActor],
  );

  return (
    <StoresActorContext.Provider value={value}>
      {/*
        Every press anywhere in the stack counts as interaction, which is what "reset on any
        interaction" has to mean in practice: somebody keying a quantity or picking through a Job
        list for three minutes is plainly still there, and dropping their name mid-form would
        disable the button under their hand. Doing it once here rather than wiring `keepAlive` into
        each field is also what stops the next screen from silently forgetting to.

        The capture handler observes the press and returns false, so this View never becomes the
        responder and the control underneath still gets its tap. A scan arrives as keystrokes rather
        than a press, so `useStoresScan` calls `keepAlive` itself.
      */}
      <View
        className="flex-1"
        onStartShouldSetResponderCapture={() => {
          keepAlive();
          return false;
        }}
      >
        {children}
      </View>
    </StoresActorContext.Provider>
  );
};

export function useStoresActor(): StoresActorContextValue {
  const value = useContext(StoresActorContext);
  if (!value) throw new Error('useStoresActor must be used inside a StoresActorProvider');

  return value;
}

/**
 * The actor id to send with a post, or `null` when nobody is selected.
 *
 * Screens gate their post buttons on this being non-null. That gate is UX: the server accepts a post
 * with no asserted actor and attributes it to the tablet's own session, so the reason to disable the
 * button is to stop movements landing under "Stores Tablet", not to stop them landing at all.
 */
export function useMovementActorUserId(): string | null {
  return useStoresActor().actor?.id ?? null;
}
