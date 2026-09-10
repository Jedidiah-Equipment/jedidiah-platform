/**
 * The fleet icon set, by key. The path data lives in `@pkg/domain/contracting`, which depends on
 * this package and cannot be imported back, so the keys are declared here and a domain test holds
 * the two lists to the same set. Adding a glyph is a code change: append the key here, add its file
 * there. Order is the picker order: generics first, then machines, then implements, alphabetical.
 */
export const categoryIconKeys = [
  'generic-machine',
  'generic-implement',
  'bakkie',
  'bulldozer',
  'excavator',
  'front-end-loader',
  'generator',
  'grader',
  'lowbed',
  'pump',
  'roller',
  'tipper',
  'tlb',
  'tractor',
  'water-tanker',
  'disc',
  'gravel-trailer',
  'planter',
  'plough',
  'ripper',
  'slasher',
  'tip-trailer',
] as const;

/** The category colour palette: the eight shared status badge tokens, as keys. */
export const categoryColours = ['blue', 'gray', 'green', 'orange', 'purple', 'red', 'teal', 'yellow'] as const;

export const categoryKinds = ['machine', 'implement'] as const;
