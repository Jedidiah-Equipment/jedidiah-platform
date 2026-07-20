import type { AutosaveControllerState } from '@pkg/domain';
import { describe, expect, it } from 'vitest';
import { AutosaveStatus } from './AutosaveStatus.js';

function buildState(overrides: Partial<AutosaveControllerState>): AutosaveControllerState {
  return {
    errorMessage: null,
    hasUnsavedChanges: false,
    shouldBlockNavigation: false,
    status: 'idle',
    ...overrides,
  };
}

describe('AutosaveStatus', () => {
  it('does not render an error alert for successful autosave states', () => {
    expect(AutosaveStatus({ state: buildState({ status: 'idle' }) })).toBeNull();
    expect(AutosaveStatus({ state: buildState({ status: 'saving' }) })).toBeNull();
    expect(AutosaveStatus({ state: buildState({ status: 'saved' }) })).toBeNull();
  });

  it('renders invalid and failed autosave states', () => {
    expect(AutosaveStatus({ state: buildState({ status: 'invalid' }) })).not.toBeNull();
    expect(AutosaveStatus({ onRetry: () => undefined, state: buildState({ status: 'error' }) })).not.toBeNull();
  });
});
