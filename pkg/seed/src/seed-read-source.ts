export type SeedReadSource = 'production' | 'staging';

export type SeedReadSourceConfig = {
  databaseUrl: string;
  name: SeedReadSource;
  storagePrefix: 'PRODUCTION_' | 'STAGING_';
};

const sourceConfigs = {
  production: {
    databaseUrlEnv: 'PRODUCTION_DATABASE_URL',
    storagePrefix: 'PRODUCTION_',
  },
  staging: {
    databaseUrlEnv: 'STAGING_DATABASE_URL',
    storagePrefix: 'STAGING_',
  },
} as const satisfies Record<
  SeedReadSource,
  { databaseUrlEnv: string; storagePrefix: SeedReadSourceConfig['storagePrefix'] }
>;

export function resolveSeedReadSource(
  sourceArgument: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): SeedReadSourceConfig {
  const source = sourceArgument ?? 'production';

  if (source !== 'production' && source !== 'staging') {
    throw new Error(`Unsupported seed read source "${source}". Expected staging or production.`);
  }

  const config = sourceConfigs[source];
  const databaseUrl = env[config.databaseUrlEnv];

  if (!databaseUrl) {
    throw new Error(`${config.databaseUrlEnv} is required to read the ${source} seed snapshot.`);
  }

  return {
    databaseUrl,
    name: source,
    storagePrefix: config.storagePrefix,
  };
}
