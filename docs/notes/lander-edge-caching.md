# Lander Edge Caching and On-Demand Image Servers

Date: 2026-08-07

**Question:** Is there a service we can run on Railway that takes an image request with dimensions and
quality, fetches the source, optimizes it, caches the result, and returns it — and what would it cost
compared with what the Lander does today?

All platform claims below trace to first-party sources (docs.railway.com, imgproxy.net, docs.imagor.net)
plus live verification against `https://jedidiahequipment.co.za` on 2026-08-07. Cost figures are Railway's
published rates as of that date.

## Answer / recommendation

**Do not run an image-optimization service. Enable Railway's CDN on the Lander instead** — done on
2026-08-07. The Lander keeps resizing on demand through `/images/{products,ranges}/*` and the edge absorbs
the repeat traffic.

Ranked, cheapest first:

1. **Railway CDN on the Lander (chosen, $0).** Free on all plans, per-service opt-in, off by default. Cuts
   egress to near zero on cache hits and stops re-encoding images the edge already holds. No code change.
2. **Railway Volume for `LANDER_IMAGE_CACHE_DIR` (~$0.75/mo for 5 GB, not done).** The remaining fix if
   post-deploy re-encode ever becomes visible; a volume pins the service to one region and caps it at one
   replica, which is free today at `numReplicas: 1`. This was the July 2026 intent and is now the fallback
   rather than the plan.
3. **imgproxy or imagor as a separate service (~$8–16/mo, rejected).** Sound technology, wrong economics at
   current traffic. Revisit past roughly 200k page views/month, or if sharp's memory spikes start hurting
   the SSR container.

### CDN settings chosen

| Setting | Value | Why |
| --- | --- | --- |
| HTML Caching | Auto | `DOCUMENT_CACHE_CONTROL` is `no-cache`, so SSR HTML is never edge-cached. `force` would be wrong with the `{-$locale}` route tree. |
| Default TTL | 2 hours | Only applies to static assets arriving with no `Cache-Control`; ours mostly send explicit directives, which win. |
| Honor SWR | on | `static-assets.ts` deliberately pairs `max-age` with `stale-while-revalidate`. |
| Purge on Deploy | HTML only | **Must not be `all`.** Every long-lived response is content-addressed — Vite-hashed `/assets/`, `?v=`-versioned images — so purging everything would discard exactly the entries worth keeping. |

## Detailed findings

### 1. The service category exists, and most members do not cache

The category is on-the-fly image processing servers: a URL encodes the source plus the transform, the server
fetches, processes, and returns. The caching half is usually *not* included.

- **imgproxy** (Go + libvips) — "imgproxy does not have an internal cache"; the docs say the thing to
  remember is to put a cache in front of it. Several one-click Railway templates exist.
  ([FAQ](https://imgproxy.net/faq/), [GitHub](https://github.com/imgproxy/imgproxy),
  [Railway template](https://railway.com/deploy/imgproxy))
- **imagor** (Go + libvips) — thumbor-compatible URLs and, unlike imgproxy, real result storage to
  filesystem or S3 (`S3_RESULT_STORAGE_BUCKET`, `FILE_RESULT_STORAGE_BASE_DIR`). Benchmarks trade places
  with imgproxy by format. ([configuration](https://docs.imagor.net/configuration/),
  [benchmarks](https://docs.imagor.net/benchmarks/))
- **Thumbor** (Python) and **imaginary** (Go) round out the field; both are worse fits — heavier and
  cacheless respectively.

### 2. Railway's CDN supersedes the volume plan

Railway shipped a CDN: per-service opt-in, free on all plans, off by default.
([docs](https://docs.railway.com/networking/cdn), `railway cdn enable|disable|status|update|purge`)

- Static assets are cached by response **`Content-Type`, not file extension**, even with no `Cache-Control`.
  The settings panel states images, CSS, JS and fonts are cached regardless of the HTML Caching mode.
- Origin `s-maxage` then `max-age` win over the Default TTL.
- `no-store`, `private`, `Set-Cookie`, or `Vary: *` bypass the cache; so do requests carrying
  `Authorization`.
- Cache hits do not incur network egress. Max object size 512 MB.
- Enable it per service and deliberately. On 2026-03-30 a Railway change caused authenticated responses to
  be cached on ~0.05% of domains that had the CDN *disabled*, for 52 minutes — reason enough to leave `web`
  and `api` off. ([incident report](https://blog.railway.com/p/incident-report-march-30-2026-accidental-cdn-caching))

### 3. Cost arithmetic

Railway rates: CPU $20/vCPU-month, RAM $10/GB-month, egress **$0.05/GB**, volumes $0.15/GB-month; Pro
includes $20 of usage. ([pricing](https://docs.railway.com/reference/pricing))

An imgproxy averaging 0.1 vCPU and 0.15 GB costs `0.1 × $20 + 0.15 × $10 ≈ $3.50/mo`, call it $4–8 with
miss bursts — **doubled**, because staging and production are separate services.

Break-even against the egress it would save:

> $5/mo of egress = 100 GB/mo of images ≈ 1.7M image requests at ~60 KB ≈ **200k page views/month**.

At 10k page views/month × 8 images × 60 KB the Lander moves 4.8 GB, or **$0.24/mo** of egress. imgproxy
would multiply that line by roughly 40 to save a quarter. The CDN captures the same saving for nothing.

At current traffic the CDN's real value is **latency, not cost**: Railway serves South African visitors from
its `jnb1` edge, so cached assets skip the trip to the origin region entirely.

### 4. Live verification, and one trap

Verified on production after enabling:

| Response | `Cache-Control` | Edge |
| --- | --- | --- |
| Catalog image (`/images/products/…?v=…`) | `max-age=31536000, immutable` | MISS → HIT |
| `/assets/*.js` | *(none — see below)* | MISS → HIT, on the 2h default TTL |
| HTML document | *(none)* + `Set-Cookie: jedidiah_locale` | DYNAMIC, never cached |

**Trap:** `curl -I` sends HEAD, which Railway passes through as `x-cache: DYNAMIC`. That is indistinguishable
from caching being broken. Verify with a real GET:

```bash
curl -s -o /dev/null -D - https://jedidiahequipment.co.za/assets/<hashed>.js
```

A useful safety property fell out of the check: the SSR HTML sets `jedidiah_locale`, and `Set-Cookie` is a
hard cache bypass, so `{-$locale}` routing cannot be poisoned by edge-cached HTML even if HTML Caching were
later set to `force`.

### 5. If we ever do adopt an image server

Recorded so the design work is not redone. The blocker is not the server, it is that the public URL is keyed
on Product id while imgproxy needs a literal source:

- **Resolve at render time.** `imageUrl()`/`imageSrcSet()` in `products-data.ts` already build URLs
  server-side from the stored-file record; reading `storageKey` alongside `updatedAt` lets them emit a signed
  imgproxy URL directly. `?v=` disappears — the storage key *is* the version.
- **Scope the credentials.** `DOCUMENT_STORAGE_BUCKET` is the shared document store — quotes, invoices,
  brochures. imgproxy holding read access to all of it plus a signing key is a read oracle for anything in
  there that decodes as an image. Scope the credential to the presentation-image prefix and set
  `IMGPROXY_ALLOWED_SOURCES=s3://<bucket>/<prefix>/` — with the trailing slash; the docs flag a missing one
  as a bypass.
- **Never enable `IMGPROXY_AUTO_WEBP`.** It varies the response on `Accept`; imgproxy's docs note headers
  cannot be signed and tell you to make the CDN key on `Accept`. Railway does not document `Accept` in its
  cache key, so the failure mode is a social scraper being served a browser's WebP. Keep format in the URL,
  as `?format=` already does.
- **Keep the placeholder contract.** `IMGPROXY_FALLBACK_IMAGE_URL` with
  `IMGPROXY_FALLBACK_IMAGE_HTTP_CODE=200` and a short TTL reproduces what `image-response.ts` does today for
  a reference whose S3 object is gone.
- **MinIO locally** works via `IMGPROXY_S3_ENDPOINT` plus `IMGPROXY_S3_ENDPOINT_USE_PATH_STYLE=true`,
  mirroring the `forcePathStyle` the Lander storage adapter already sets.
