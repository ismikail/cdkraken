# cdkraken

Release the CDKraken — reusable AWS CDK construct wrappers that tame your infrastructure.

```bash
npm install cdkraken
```

Requires `aws-cdk-lib` ^2.257.0 and `constructs` ^10.5.0 as peer dependencies.

## `StaticWebsite`

A complete static website on AWS: a private, encrypted S3 origin, a CloudFront
distribution in front of it via OAC, framework-appropriate route handling, and a
cache-aware upload of your build.

```ts
import {StaticWebsite} from 'cdkraken';

new StaticWebsite(this, 'Site', {
  buildPath: path.join(__dirname, '../../web/build'),
  certificate, // ACM certificate, must be in us-east-1
  domainNames: ['example.com', 'www.example.com'],
});
```

That is the SvelteKit `adapter-static` default. No DNS records are created —
read `site.distributionDomainName` and point your provider at it.

### Framework support

There is no `SvelteWebsite` or `ReactWebsite`, because at the CDN layer the
difference between static frameworks is exactly two things: how request paths
map onto emitted files, and where the content-hashed assets live. Both are
configuration.

```ts
import {StaticWebsite, SITE_PRESETS} from 'cdkraken';

new StaticWebsite(this, 'Site', {
  buildPath: path.join(__dirname, '../../app/dist'),
  certificate,
  domainNames: ['app.example.com'],
  preset: SITE_PRESETS.VITE_SPA, // React, Vue, Solid…
});
```

| Preset | Routing | Immutable assets |
| --- | --- | --- |
| `SVELTEKIT_STATIC` *(default)* | directory index | `_app/immutable` |
| `ASTRO_STATIC` | directory index | `_astro` |
| `DOCUSAURUS` | directory index | `assets` |
| `NEXT_EXPORT` | `.html` extension | `_next/static` |
| `VITE_SPA` | SPA fallback | `assets` |
| `REACT_SPA` | SPA fallback | `static` |

Presets describe each framework's *default* build. If you have changed
`trailingSlash`, `build.format`, or your asset directory, set `routing` and
`immutablePaths` directly instead — they override the preset.

### Routing modes

| `SiteRouting` | `/about` resolves to | Mechanism |
| --- | --- | --- |
| `DIRECTORY_INDEX` | `/about/index.html` | viewer-request Function |
| `HTML_EXTENSION` | `/about.html` | viewer-request Function |
| `SPA` | `/index.html`, status 200 | CloudFront error responses |
| `NONE` | `/about` | — |

`SPA` deliberately does not use a Function. A viewer-request Function runs
*before* the origin, so it cannot react to a missing object — and a private
OAC-fronted bucket answers a missing key with **403**, not 404, because
`s3:ListBucket` is not granted. The fallback therefore maps both 403 and 404 to
`/index.html` with a 200. The trade-off is inherent to SPA hosting: a genuinely
missing `/assets/typo.js` also returns `index.html` rather than a 404.

The rewrite Function is pinned to the `cloudfront-js-2.0` runtime. Left unset,
CDK picks the runtime from the `@aws-cdk/aws-cloudfront:defaultRuntimeVersionV2_0`
feature flag in the *consuming* app's `cdk.json` — meaning the same construct
would deploy on 1.0 in one repo and 2.0 in another. A library should not inherit
that. Pass `runtime` to `RoutingFunctionJs` if you need 1.0. The handler code
itself stays ES5-safe, so it runs correctly on either.

### Caching

When `immutablePaths` is non-empty the build is uploaded in two passes:
content-hashed assets get `max-age=31536000, immutable`, and everything else —
notably HTML — gets `no-cache`. Without that split, a deploy stays invisible
until the edge TTL lapses.

Both passes run with `prune: false`, and must: each sees only its half of the
build, so a pruning pass would delete the other half on every deploy.
Superseded hashed assets therefore accumulate, which also keeps old bundles
fetchable for sessions loaded moments before a deploy. Add an S3 lifecycle rule
if you want them reaped.

### Scope

Static hosting only. A framework running server-side — SvelteKit
`adapter-node`, Next.js with SSR — needs a compute origin and is not covered.

## Constructs

| Construct | Purpose |
| --- | --- |
| `StaticWebsite` | The whole site: bucket + distribution + deployment |
| `SiteBucket` | Private encrypted origin bucket with cache-aware upload |
| `SiteDistribution` | CloudFront distribution with OAC and route handling |
| `RoutingFunctionJs` | The viewer-request rewrite Function on its own |

The pieces are exported individually, so you can assemble them yourself when
`StaticWebsite` does not fit.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). `main` is protected; work lands via pull
request, and commit messages drive the release version.

## License

MIT
