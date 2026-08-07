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

  // This branch covers anything dropped into `public/`, which keeps its filename across deploys. The
  // Lander's own robots.txt and favicon are not examples: robots.txt is a server route and the favicon is
  // a hashed import, so neither reaches here.
  test('gives stable-named static files a day of freshness they can outlive', () => {
    expect(cacheControlFor('/apple-touch-icon.png')).toBe('public, max-age=86400, stale-while-revalidate=604800');
    expect(cacheControlFor('/brochures/catalogue.pdf')).toBe('public, max-age=86400, stale-while-revalidate=604800');
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

  // A video element asks for byte ranges before it will play anything, so answering one with the whole file
  // and a 200 is what silently breaks playback rather than merely wasting bandwidth.
  describe('range requests', () => {
    const range = (value: string) => get('/assets/hero-abc123.webp', { range: value });

    test('advertises range support on a full response', async () => {
      expect((await get('/assets/hero-abc123.webp'))?.headers.get('accept-ranges')).toBe('bytes');
    });

    test('answers a bounded range with 206 and just those bytes', async () => {
      const response = await range('bytes=4-7');

      expect(response?.status).toBe(206);
      expect(response?.headers.get('content-range')).toBe('bytes 4-7/16');
      expect(response?.headers.get('content-length')).toBe('4');
      expect(await response?.text()).toBe('____');
    });

    test('runs an open-ended range to the end of the file', async () => {
      const response = await range('bytes=12-');

      expect(response?.status).toBe(206);
      expect(response?.headers.get('content-range')).toBe('bytes 12-15/16');
      expect(await response?.text()).toBe('VP8 ');
    });

    test('reads a suffix range from the end', async () => {
      const response = await range('bytes=-4');

      expect(response?.status).toBe(206);
      expect(response?.headers.get('content-range')).toBe('bytes 12-15/16');
      expect(await response?.text()).toBe('VP8 ');
    });

    test('clamps an end past the last byte instead of failing', async () => {
      expect((await range('bytes=8-999'))?.headers.get('content-range')).toBe('bytes 8-15/16');
    });

    test('rejects a start past the last byte with 416 and the real length', async () => {
      const response = await range('bytes=99-200');

      expect(response?.status).toBe(416);
      expect(response?.headers.get('content-range')).toBe('bytes */16');
    });

    test('falls back to the whole file for a form it does not parse', async () => {
      for (const value of ['bytes=0-1,4-5', 'items=0-1', 'bytes=-', 'nonsense']) {
        const response = await range(value);

        expect(response?.status, value).toBe(200);
        expect(response?.headers.get('content-range'), value).toBeNull();
      }
    });
  });

  describe('conditional requests', () => {
    test('answers a matching If-None-Match with an empty 304', async () => {
      const etag = (await get('/assets/hero-abc123.webp'))?.headers.get('etag');

      expect(etag).toMatch(/^W\/"[\da-f]+-[\da-f]+"$/);

      const revalidated = await get('/assets/hero-abc123.webp', { 'if-none-match': etag ?? '' });

      expect(revalidated?.status).toBe(304);
      expect(await revalidated?.text()).toBe('');
      // The window has to survive revalidation, or the client stops trusting the entry it just kept.
      expect(revalidated?.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    });

    test('serves the bytes again when the validator does not match', async () => {
      const response = await get('/assets/hero-abc123.webp', { 'if-none-match': 'W/"deadbeef-1"' });

      expect(response?.status).toBe(200);
      expect(await response?.text()).toBe('RIFF____WEBPVP8 ');
    });

    test('honours If-Modified-Since only when no ETag is offered', async () => {
      const response = await get('/assets/hero-abc123.webp', { 'if-modified-since': new Date().toUTCString() });

      expect(response?.status).toBe(304);
    });

    test('sends a HEAD the full length without a body', async () => {
      const response = await serve(new Request('https://example.test/assets/hero-abc123.webp', { method: 'HEAD' }));

      expect(response?.status).toBe(200);
      expect(response?.headers.get('content-length')).toBe('16');
      expect(await response?.text()).toBe('');
    });
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
