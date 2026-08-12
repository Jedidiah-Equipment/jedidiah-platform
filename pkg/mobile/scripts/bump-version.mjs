import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const VERSION_PATTERN = /^(\s*version:\s*')(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(',\s*)$/gm;
const SUPPORTED_BUMPS = new Set(['patch', 'minor', 'major']);
const APP_CONFIG_PATH = new URL('../app.config.ts', import.meta.url);

export function bumpVersion(version, bump) {
  if (!SUPPORTED_BUMPS.has(bump)) {
    throw new Error(`Expected a version bump of patch, minor, or major; received ${bump ?? 'nothing'}.`);
  }

  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (!match) {
    throw new Error(`Expected an x.y.z app version; received ${version}.`);
  }

  const [, majorText, minorText, patchText] = match;
  const major = Number(majorText);
  const minor = Number(minorText);
  const patch = Number(patchText);

  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

export function updateAppConfigVersion(source, bump) {
  const matches = [...source.matchAll(VERSION_PATTERN)];
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one top-level x.y.z version in app.config.ts; found ${matches.length}.`);
  }

  const currentVersion = `${matches[0][2]}.${matches[0][3]}.${matches[0][4]}`;
  const nextVersion = bumpVersion(currentVersion, bump);
  const updatedSource = source.replace(VERSION_PATTERN, `$1${nextVersion}$5`);

  return { currentVersion, nextVersion, updatedSource };
}

function main() {
  const bump = process.argv[2];
  const source = readFileSync(APP_CONFIG_PATH, 'utf8');
  const { currentVersion, nextVersion, updatedSource } = updateAppConfigVersion(source, bump);

  writeFileSync(APP_CONFIG_PATH, updatedSource);
  console.log(`Bumped mobile app version: ${currentVersion} -> ${nextVersion}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
