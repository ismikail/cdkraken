# Contributing to cdkraken

Thanks for taking the time. This is a small project — the process is light, but a
couple of things are enforced by tooling, so it helps to know them up front.

## Getting set up

```bash
git clone https://github.com/ismikail/cdkraken.git
cd cdkraken
npm install     # also installs the git hooks via husky
```

Useful scripts:

| Command | What it does |
| --- | --- |
| `npm test` | Run the test suite |
| `npm run test:ci` | Tests with coverage, as CI runs them |
| `npm run build` | Type-check and emit `lib/` |
| `npm run lint` | Biome check (lint + format) |
| `npm run lint:fix` | Fix what Biome can fix automatically |
| `npm run docs:generate` | Regenerate the API reference from JSDoc |

## Branching and pull requests

`main` is protected — it cannot be pushed to directly. All work goes through a
pull request:

```bash
git switch -c feat/spa-routing
# ... commit ...
git push -u origin feat/spa-routing
gh pr create
```

CI must be green before a PR can merge. That means Biome, commitlint, the test
suite, and the build.

## Commit messages

Commit messages are **not** cosmetic here — they choose the next version number.
This repo uses [semantic-release](https://semantic-release.gitbook.io/), which
reads the commits merged into `main` and decides what to publish. The format is
[Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <summary>
```

| Commit | Release |
| --- | --- |
| `fix: correct the SPA fallback status code` | patch — `1.0.0` → `1.0.1` |
| `feat: add HTML_EXTENSION routing` | minor — `1.0.0` → `1.1.0` |
| `feat!: rename AppWebsiteProps.buildPath` | major — `1.0.0` → `2.0.0` |
| `docs: clarify the caching trade-off` | none |

A `!` before the colon, or a `BREAKING CHANGE:` footer, triggers a major bump.
Explain the migration in the body when you do that — it lands in the changelog
verbatim.

Allowed types: `build`, `ci`, `chore`, `deps`, `docs`, `feat`, `fix`, `perf`,
`refactor`, `revert`, `style`, `test`.

A `commit-msg` hook rejects anything that does not parse, so you will find out
immediately rather than in CI. If a commit is already written, `git commit
--amend` to reword it.

## Releases

You never bump a version or publish by hand. Merging to `main` runs the release
workflow, which tests, builds, works out the version from the commits, updates
`CHANGELOG.md`, tags, cuts a GitHub release, and publishes to npm with
provenance. If no commit since the last release warrants one, nothing is
published — that is expected, not a failure.

## Writing constructs

A few conventions the existing code follows:

- **One folder per domain** under `src/`, each with an `index.ts` barrel and an
  `interface.ts` holding the props and enums. `src/index.ts` re-exports the
  barrels.
- **Props are `readonly`** and documented with JSDoc. The docs site is generated
  from those comments, so they are the public documentation.
- **Prefer configuration over per-framework classes.** `AppWebsite` takes a
  `SiteRouting` strategy rather than shipping `SvelteWebsite` and
  `ReactWebsite`, because the CDN-level difference between those frameworks is
  exactly one routing convention plus an asset directory. New framework support
  should usually be a new `SITE_PRESETS` entry, not a new construct.
- **Secure defaults, overridable.** Buckets block public access and enforce TLS;
  distributions are HTTPS-only. If a default cannot suit everyone, expose a prop
  rather than loosening it.
- **Comment the surprising thing, not the obvious one.** Explain why the SPA
  fallback maps 403 as well as 404; do not explain that a bucket is a bucket.

## Tests

Every construct needs tests, using the CDK
[assertions](https://docs.aws.amazon.com/cdk/v2/guide/testing.html) module to
synthesize a stack and assert on the resulting template. Cover the security
posture (private bucket, TLS policy) and the behaviour a prop is supposed to
change, not just that synthesis succeeds. Where logic is genuinely executable —
such as the CloudFront Function rewrite rules — test the behaviour rather than
matching against the template string.

## Reporting bugs

Open an issue with the CDK version, the construct involved, the props you
passed, and the synthesized output or error. A minimal stack that reproduces it
is the fastest route to a fix.
