import type { PartCategoryMergePreview } from '@pkg/schema/equipment';

export function formatPartCategoryMergeConfirmation({ movedPartCount, sources, target }: PartCategoryMergePreview) {
  const moved = movedPartCount === 1 ? '1 Part moves' : `${movedPartCount} Parts move`;
  const deleted = `${joinNames(sources.map((source) => source.name))} ${sources.length === 1 ? 'is' : 'are'} deleted`;

  return `${moved} to ${target.name}. ${deleted}. This cannot be undone.`;
}

/** The survivor's markup wins, so name every duplicate whose Parts will price differently afterwards. */
export function getPartCategoryMarkupWarnings({ sources, target }: PartCategoryMergePreview): string[] {
  return sources
    .filter((source) => source.partCount > 0 && source.markupPercent !== target.markupPercent)
    .map((source) => {
      const before =
        source.markupPercent === null
          ? `${source.name} has no markup`
          : `${source.name} is set to ${source.markupPercent}%`;
      const after =
        target.markupPercent === null
          ? `Its Parts will have no markup, as ${target.name} has none`
          : `Its Parts will take ${possessive(target.name)} ${target.markupPercent}%`;

      return `${before}. ${after}.`;
    });
}

function joinNames(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function possessive(name: string): string {
  return name.endsWith('s') ? `${name}'` : `${name}'s`;
}
