# cdkraken

[![npm](https://img.shields.io/npm/v/cdkraken.svg)](https://www.npmjs.com/package/cdkraken)
[![license](https://img.shields.io/npm/l/cdkraken.svg)](LICENSE)

Release the CDKraken — reusable AWS CDK construct wrappers that tame your infrastructure.

A growing collection of opinionated L3 constructs for AWS CDK. Each wraps a
pattern you would otherwise rebuild in every project, with secure defaults
already applied and the awkward details — cache headers, origin access, runtime
pinning — handled rather than left to you.

```bash
npm install cdkraken
```

Peer dependencies: `aws-cdk-lib` ^2.257.0, `constructs` ^10.5.0. No runtime
dependencies of its own.

## Constructs

| Domain | Constructs | Docs |
| --- | --- | --- |
| Static websites | `StaticWebsite`, `SiteBucket`, `SiteDistribution`, `RoutingFunctionJs` | [README](src/static-website/README.md) |

```ts
import {StaticWebsite} from 'cdkraken';

new StaticWebsite(this, 'Site', {
  buildPath: path.join(__dirname, '../../web/build'),
  certificate,
  domainNames: ['example.com'],
});
```

The library is organised by domain — one folder per area, each exporting a
headline construct plus the building blocks it composes, and each documented in
its own README. More domains are in progress.

## Design principles

These hold across every construct here.

- **Secure by default, overridable.** Buckets block public access and enforce
  TLS; distributions are HTTPS-only. Where a default cannot suit everyone, there
  is a prop — the default does not get loosened.
- **Configuration over proliferation.** One construct with a strategy prop beats
  five near-identical classes.
- **Nothing inherited from ambient config.** Several CDK defaults resolve
  through feature flags in the consuming app's `cdk.json`, which means the same
  construct can deploy differently in different repos. Those values are pinned
  explicitly.
- **Composable, not monolithic.** Every building block is exported. If the
  headline construct does not fit, assemble the pieces yourself.
- **Fail at synth, not at deploy.** Invalid combinations are rejected while you
  are still at the keyboard, rather than part-way through a CloudFormation
  rollback.

## API reference

Generated from the source JSDoc:

```bash
npm run docs:generate
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). `main` is protected; work lands via pull
request, and commit messages drive the release version.

## License

MIT
