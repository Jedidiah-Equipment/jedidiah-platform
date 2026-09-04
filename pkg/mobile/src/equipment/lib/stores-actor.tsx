import { isStoresActorExpired } from '@pkg/domain/equipment';
import type { QuickSwitchActor } from '@pkg/schema/equipment';
import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, View } from 'react-native';

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

  /**
   * Expiry is checked on a tick *and* on every return to the foreground, and the second is not
   * belt-and-braces: JavaScript timers do not run while a backgrounded app is suspended, so a
   * tablet locked at 16:55 and woken the next morning would come back with the interval never
   * having fired and yesterday's name still showing. The clock is the authority, not the tick —
   * `lastInteractionAt` is wall time, so the elapsed check is correct however long the gap was.
   *
   * Both only run while somebody is selected: a tablet with nobody at it has nothing to forget.
   */
  useEffect(() => {
    if (actor === null) return;

    const expireIfIdle = () => {
      if (isStoresActorExpired({ lastInteractionAt: lastInteractionAt.current, now: Date.now() })) {
        setActor(null);
      }
    };
    const interval = setInterval(expireIfIdle, IDLE_TICK_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') expireIfIdle();
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
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
