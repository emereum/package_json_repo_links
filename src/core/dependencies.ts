import { parseTree } from 'jsonc-parser';

export const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

export type DependencySection = (typeof DEPENDENCY_SECTIONS)[number];

export interface DependencyEntry {
  /** Package name, e.g. "react" or "@types/node". */
  name: string;
  /** Declared version range from package.json, e.g. "^18.2.0". */
  declaredRange: string;
  section: DependencySection;
  /** Offset of the first character of the name (inside the quotes). */
  nameStart: number;
  /** Offset just past the last character of the name. */
  nameEnd: number;
}

/**
 * Finds every dependency name in a package.json document, across all four
 * dependency sections, with the exact text offsets of each name.
 */
export function findDependencies(packageJsonText: string): DependencyEntry[] {
  const root = parseTree(packageJsonText);
  if (!root || root.type !== 'object' || !root.children) {
    return [];
  }

  const entries: DependencyEntry[] = [];
  for (const property of root.children) {
    const [keyNode, valueNode] = property.children ?? [];
    if (!keyNode || !valueNode || valueNode.type !== 'object') {
      continue;
    }
    const section = keyNode.value as string;
    if (!(DEPENDENCY_SECTIONS as readonly string[]).includes(section)) {
      continue;
    }
    for (const depProperty of valueNode.children ?? []) {
      const [depKey, depValue] = depProperty.children ?? [];
      if (!depKey || typeof depKey.value !== 'string') {
        continue;
      }
      entries.push({
        name: depKey.value,
        declaredRange: typeof depValue?.value === 'string' ? depValue.value : '',
        section: section as DependencySection,
        // Key node offset/length include the surrounding quotes.
        nameStart: depKey.offset + 1,
        nameEnd: depKey.offset + depKey.length - 1,
      });
    }
  }
  return entries;
}

export function entryAtOffset(entries: DependencyEntry[], offset: number): DependencyEntry | undefined {
  return entries.find((e) => offset >= e.nameStart && offset <= e.nameEnd);
}
