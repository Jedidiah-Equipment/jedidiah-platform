// Context windows are not exposed by the API; keep this in sync with the models
// we configure via OPENAI_MODEL.
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-5.5': 400_000,
};

export function getModelContextWindow(model: string): number | null {
  return MODEL_CONTEXT_WINDOWS[model] ?? null;
}
