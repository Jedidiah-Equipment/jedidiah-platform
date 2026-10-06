import { bucket, defineRailway, github, postgres, preserve, project, service, volume } from 'railway/iac';

// Resource names match Railway's existing resources. Renaming one declares a new resource.
// Keep every existing variable, including legacy ones, as preserve(): omitting one deletes it.
const preserveAll = (...names: string[]) => Object.fromEntries(names.map((name) => [name, preserve()]));
const workspaceRoot = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'turbo.json', 'tsconfig.base.json'];
const pkg = (...names: string[]) => names.map((name) => `pkg/${name}/**`);
const apiPackages = pkg('ai', 'api', 'changelog', 'core', 'db', 'domain', 'pdf', 'schema');
const documentStorage = [
  'DOCUMENT_STORAGE_ACCESS_KEY_ID',
  'DOCUMENT_STORAGE_BUCKET',
  'DOCUMENT_STORAGE_ENDPOINT',
  'DOCUMENT_STORAGE_FORCE_PATH_STYLE',
  'DOCUMENT_STORAGE_REGION',
  'DOCUMENT_STORAGE_SECRET_ACCESS_KEY',
];

export default defineRailway((ctx) => {
  const production = ctx.isEnvironment('production');
  if (!production && !ctx.isEnvironment('staging')) {
    throw new Error('Select the staging or production Railway environment.');
  }

  const source = github('Jedidiah-Equipment/jedidiah-platform', {
    branch: production ? 'production' : 'main',
    checkSuites: false,
  });
  const appDeploy = {
    healthcheckPath: '/health',
    healthcheckTimeout: 30,
    restartPolicyType: 'ON_FAILURE' as const,
    restartPolicyMaxRetries: 10,
    sleepApplication: !production,
  };

  const Postgres = postgres('Postgres', { region: 'iad' });
  Postgres.networking = { privateNetworkEndpoint: 'postgres', tcpProxies: { '5432': {} } };
  const postgresVolume = volume('postgres-volume-Rbe7', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'iad',
    sizeMB: production ? 5000 : 500,
  });
  const documents = bucket('systematic-basketcase', { region: 'iad' });

  const api = service('api', {
    source,
    replicas: { iad: 1 },
    domains: [production ? 'api.jedidiahequipment.co.za' : 'staging-api.jedidiahequipment.co.za'],
    build: {
      builder: 'RAILPACK',
      buildCommand: 'pnpm --filter @pkg/api... build',
      watchPatterns: [...workspaceRoot, ...apiPackages, 'changelogs/**'],
    },
    deploy: {
      ...appDeploy,
      startCommand: 'pnpm --filter @pkg/api start',
      preDeployCommand: ['pnpm db:migrate'],
      ...(!production ? { limitOverride: { containers: { cpu: 2, memoryBytes: 8000000000 } } } : {}),
    },
    env: preserveAll(
      'API_BASE_URL',
      'API_IMAGE_CACHE_DIR',
      'APP_BASE_URL',
      'APP_ENV',
      'AUTH_SECRET',
      'AUTH_TRUSTED_ORIGINS',
      'DATABASE_URL',
      ...documentStorage,
      'EMAIL_FROM',
      'EMAIL_PROVIDER',
      'LOG_DOMAINS_DISABLED',
      'LOG_LEVEL',
      'NODE_ENV',
      'OPENAI_API_KEY',
      'OPENAI_MODEL',
      'OPENAI_REASONING_EFFORT',
      'OPENAI_TRANSCRIPTION_MODEL',
      'OPENAI_TRANSLATION_MODEL',
      'PORT',
      'POSTHOG_ENABLED',
      'POSTHOG_HOST',
      'POSTHOG_PROJECT_TOKEN',
      'RESEND_API_KEY',
    ),
  });

  const web = service('web', {
    source,
    replicas: { iad: 1 },
    domains: [production ? 'app.jedidiahequipment.co.za' : 'staging-app.jedidiahequipment.co.za'],
    build: {
      builder: 'RAILPACK',
      buildCommand: 'pnpm --filter @pkg/web... build',
      watchPatterns: [...workspaceRoot, ...apiPackages, ...pkg('web')],
    },
    deploy: { ...appDeploy, startCommand: 'pnpm --filter @pkg/web start' },
    env: preserveAll(
      'API_BASE_URL',
      'APP_BASE_URL',
      'APP_ENV',
      'AUTH_BASE_URL',
      'DATABASE_URL',
      'DOCS_BASE_URL',
      ...documentStorage,
      'NODE_ENV',
      'PORT',
      'POSTHOG_API_KEY',
      'POSTHOG_ASSET_HOST',
      'POSTHOG_ENABLED',
      'POSTHOG_INGEST_HOST',
      'POSTHOG_PROJECT_ID',
      'POSTHOG_PROJECT_TOKEN',
      'POSTHOG_SOURCEMAPS_ENABLED',
      'POSTHOG_SOURCEMAPS_HOST',
      'POSTHOG_UI_HOST',
      'RESEND_API_KEY',
    ),
  });

  const lander = service('lander', {
    source,
    replicas: { iad: 1 },
    domains: production ? ['jedidiahequipment.co.za', 'www.jedidiahequipment.co.za'] : [],
    networking: { privateNetworkEndpoint: 'celebrated-prosperity' },
    build: {
      builder: 'RAILPACK',
      buildCommand: 'pnpm --filter @pkg/lander... build',
      watchPatterns: [...workspaceRoot, ...pkg('core', 'db', 'domain', 'lander', 'pdf', 'schema')],
    },
    deploy: { ...appDeploy, startCommand: 'pnpm --filter @pkg/lander start' },
    env: preserveAll(
      'API_BASE_URL',
      'APP_BASE_URL',
      'APP_ENV',
      'CONTACT_EMAIL_FROM',
      'CONTACT_EMAIL_TO',
      'DATABASE_URL',
      ...documentStorage,
      'LANDER_IMAGE_CACHE_DIR',
      'NODE_ENV',
      'PORT',
      'RESEND_API_KEY',
      'VITE_META_PIXEL_ID',
      'VITE_POSTHOG_KEY',
      'VITE_SITE_URL',
    ),
  });

  // Documentation is deployed only in production.
  const docs = production
    ? service('docs', {
        source,
        replicas: { iad: 1 },
        domains: ['docs.jedidiahequipment.co.za'],
        build: {
          builder: 'RAILPACK',
          buildCommand: 'pnpm --filter @pkg/docs... build',
          watchPatterns: [...workspaceRoot, ...pkg('docs', 'domain', 'schema')],
        },
        deploy: {
          ...appDeploy,
          startCommand: 'pnpm --filter @pkg/docs start',
          healthcheckPath: '/',
          sleepApplication: true,
        },
      })
    : undefined;

  return project('Jedidiah Equipment', {
    resources: [api, web, lander, ...(docs ? [docs] : []), Postgres, postgresVolume, documents],
  });
});
