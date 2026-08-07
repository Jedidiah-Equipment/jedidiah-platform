import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { beforeAll, describe, expect, test } from 'vitest';

import { cacheControlFor, createStaticAssetServer, isPrecompressed } from './static-assets.js';

describe('cacheControlFor', () => {
  test('pins content-hashed build output for a year', () => {
    expect(cacheControlFor('/assets/app-DaJKeok3.css')).toBe('public, max-age=31536000, immutable');
    expect(cacheControlFor('/assets/hero-silage-harvest-960-B1c2d3e4.webp')).toBe(
      'public, max-age=31536000, immutable',
    );
  });

  test('gives stable-named static files a day of freshness they can outlive', () => {
    expect(cacheControlFor('/robots.txt')).toBe('public, max-age=86400, stale-while-revalidate=604800');
    expect(cacheControlFor('/favicon.ico')).toBe('public, max-age=86400, stale-while-revalidate=604800');
  });

  test('never holds a document, which is what carries the new asset URLs', () => {
    expect(cacheControlFor('/index.html')).toBe('no-cache');
    // An extensionless path is a page route, not a file.
    expect(cacheControlFor('/products')).toBe('no-cache');
    expect(cacheControlFor('/')).toBe('no-cache');
  });

  test('reads the extension, not a dot elsewhere in the path', () => {
    expect(cacheControlFor('/some.dir/products')).toBe('no-cache');
  });
});

describe('createStaticAssetServer', () => {
  let serve: (request: Request) => Promise<Response | null>;

  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lander-static-'));
    await mkdir(join(dir, 'assets'));
    await writeFile(join(dir, 'assets', 'app-abc123.css'), 'body{color:red}');
    // Real WebP header bytes, so nothing downstream can mistake this for text.
    await writeFile(join(dir, 'assets', 'hero-abc123.webp'), Buffer.from('RIFF____WEBPVP8 ', 'ascii'));
    await writeFile(join(dir, 'robots.txt'), 'User-agent: *');

    serve = createStaticAssetServer(pathToFileURL(`${dir}/`));
  });

  const get = (path: string, headers: HeadersInit = { 'accept-encoding': 'gzip, br' }) =>
    serve(new Request(`https://example.test${path}`, { headers }));

  test('serves a hashed asset with the immutable window', async () => {
    const response = await get('/assets/app-abc123.css');

    expect(response?.status).toBe(200);
    expect(response?.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  test('returns null for a path the build does not contain, leaving it to the router', async () => {
    expect(await get('/products')).toBeNull();
    expect(await get('/assets/not-a-real-file.js')).toBeNull();
  });

  test('compresses text but leaves an already-compressed image alone', async () => {
    expect((await get('/assets/app-abc123.css'))?.headers.get('content-encoding')).toBe('br');
    expect((await get('/assets/hero-abc123.webp'))?.headers.get('content-encoding')).toBeNull();
  });

  test('serves the untouched bytes of a precompressed file, with its length and type', async () => {
    const response = await get('/assets/hero-abc123.webp');

    expect(await response?.text()).toBe('RIFF____WEBPVP8 ');
    expect(response?.headers.get('content-type')).toBe('image/webp');
    expect(response?.headers.get('content-length')).toBe('16');
  });

  test('refuses to walk out of the build directory', async () => {
    expect(await get('/assets/../../../../etc/passwd.png')).toBeNull();
    expect(await get('/assets/%2e%2e%2f%2e%2e%2fsecret.webp')).toBeNull();
  });

  test('gives an unhashed static file the shorter window', async () => {
    expect((await get('/robots.txt'))?.headers.get('cache-control')).toBe(
      'public, max-age=86400, stale-while-revalidate=604800',
    );
  });
});

describe('isPrecompressed', () => {
  test('recognises formats that carry their own compression', () => {
    for (const path of ['/a.webp', '/a.WEBP', '/a.png', '/a.jpg', '/a.woff2', '/a.pdf', '/a.avif']) {
      expect(isPrecompressed(path), path).toBe(true);
    }
  });

  test('leaves text formats to be compressed on the wire', () => {
    for (const path of ['/a.css', '/a.js', '/a.html', '/a.svg', '/a.json', '/a.txt', '/a.xml']) {
      expect(isPrecompressed(path), path).toBe(false);
    }
  });
});
