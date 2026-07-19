import type {ICertificate} from 'aws-cdk-lib/aws-certificatemanager';
import type {IDistribution} from 'aws-cdk-lib/aws-cloudfront';
import type {BucketProps, IBucket} from 'aws-cdk-lib/aws-s3';

/**
 * How a static build maps request paths onto objects in the origin bucket.
 *
 * This is the single dimension along which static-site frameworks actually
 * differ at the CDN layer. Pick it from how your build emits HTML, not from
 * which framework produced it — several frameworks can emit either shape.
 */
export enum SiteRouting {
  /**
   * `/about` and `/about/` both resolve to `/about/index.html`.
   *
   * Emitted by SvelteKit `adapter-static` (`trailingSlash: 'always'`), Astro
   * (default `build.format: 'directory'`), Hugo, Docusaurus and VitePress.
   * Implemented with a CloudFront viewer-request Function.
   */
  DIRECTORY_INDEX = 'DIRECTORY_INDEX',

  /**
   * `/about` resolves to `/about.html`.
   *
   * Emitted by Next.js `output: 'export'` with `trailingSlash: false` and by
   * Astro `build.format: 'file'`. Implemented with a viewer-request Function.
   */
  HTML_EXTENSION = 'HTML_EXTENSION',

  /**
   * Every path that is not a real object resolves to `/index.html` with a 200,
   * letting the client-side router take over.
   *
   * This is what React, Vue and any other client-routed SPA needs. It is
   * implemented with CloudFront {@link https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/GeneratingCustomErrorResponses.html custom error responses}
   * rather than a Function, because a private OAC-fronted bucket answers
   * missing keys with **403** (`ListBucket` is not granted, so S3 cannot
   * disclose that the key is absent) — a viewer-request Function runs before
   * the origin and so never sees that failure.
   *
   * Trade-off: a genuinely missing asset such as `/assets/typo.js` also returns
   * `index.html` with a 200 instead of a 404. That is inherent to SPA fallback
   * hosting, not specific to this construct.
   */
  SPA = 'SPA',

  /** Serve objects exactly as requested. No Function, no error responses. */
  NONE = 'NONE',
}

/**
 * Routing plus content-hashed asset locations for a given framework's default
 * static build. Consumed by {@link StaticWebsite} via `preset`.
 */
export interface SitePreset {
  /** Path-to-object convention the build emits. */
  readonly routing: SiteRouting;
  /**
   * Directories whose filenames embed a content hash, so their contents can be
   * served with a one-year immutable `Cache-Control`. Everything outside these
   * paths (notably HTML) is uploaded `no-cache` instead, so a deploy is visible
   * immediately rather than after a TTL expires.
   */
  readonly immutablePaths: string[];
}

/**
 * Ready-made {@link SitePreset}s for common frameworks' default static output.
 *
 * These are a convenience over the framework's *defaults* — if you have changed
 * `trailingSlash`, `build.format` or your asset directory, pass `routing` and
 * `immutablePaths` explicitly instead.
 */
export const SITE_PRESETS = {
  /** SvelteKit `adapter-static` with `trailingSlash: 'always'`. */
  SVELTEKIT_STATIC: {
    routing: SiteRouting.DIRECTORY_INDEX,
    immutablePaths: ['_app/immutable'],
  },
  /** Astro with the default `build.format: 'directory'`. */
  ASTRO_STATIC: {
    routing: SiteRouting.DIRECTORY_INDEX,
    immutablePaths: ['_astro'],
  },
  /** Next.js `output: 'export'` with `trailingSlash: false`. */
  NEXT_EXPORT: {
    routing: SiteRouting.HTML_EXTENSION,
    immutablePaths: ['_next/static'],
  },
  /** Docusaurus `build`. */
  DOCUSAURUS: {
    routing: SiteRouting.DIRECTORY_INDEX,
    immutablePaths: ['assets'],
  },
  /** Any Vite-built client-routed SPA (React, Vue, Solid, Svelte SPA mode). */
  VITE_SPA: {
    routing: SiteRouting.SPA,
    immutablePaths: ['assets'],
  },
  /** Create React App `build`. */
  REACT_SPA: {
    routing: SiteRouting.SPA,
    immutablePaths: ['static'],
  },
} as const satisfies Record<string, SitePreset>;

/** Properties for {@link StaticWebsite}. */
export interface StaticWebsiteProps {
  /** Path to the static build directory to serve (e.g. `web/build`). */
  readonly buildPath: string;
  /**
   * ACM certificate for the site domains.
   *
   * **Must live in us-east-1** — a CloudFront requirement. If your site stack
   * is in another region, define the certificate in a us-east-1 stack and pass
   * it across with `crossRegionReferences: true`.
   */
  readonly certificate: ICertificate;
  /** Domains served, e.g. `['example.com', 'www.example.com']`. */
  readonly domainNames: string[];
  /**
   * Framework preset supplying {@link routing} and {@link immutablePaths}.
   * Either explicit value overrides the preset. Defaults to
   * {@link SITE_PRESETS.SVELTEKIT_STATIC}.
   */
  readonly preset?: SitePreset;
  /** Overrides `preset.routing`. */
  readonly routing?: SiteRouting;
  /** Overrides `preset.immutablePaths`. Pass `[]` to disable the split upload. */
  readonly immutablePaths?: string[];
  /** Optional CloudFront console comment. */
  readonly comment?: string;
}

/** Properties for {@link SiteDistribution}. */
export interface SiteDistributionProps {
  /** Origin bucket holding the static build (served via OAC). */
  readonly originBucket: IBucket;
  /** ACM certificate (must live in us-east-1 for CloudFront). */
  readonly certificate: ICertificate;
  /** Domains served by the distribution. */
  readonly domainNames: string[];
  /** Path-to-object convention. Defaults to {@link SiteRouting.DIRECTORY_INDEX}. */
  readonly routing?: SiteRouting;
  /** Optional console comment. */
  readonly comment?: string;
}

/** Properties for {@link SiteBucket}. */
export interface SiteBucketProps extends BucketProps {
  /** Path to the static build uploaded by `deployStaticWebsite()`. */
  readonly buildPath: string;
  /** Content-hashed directories to upload with an immutable `Cache-Control`. */
  readonly immutablePaths?: string[];
}

/** Options for {@link SiteBucket.deployStaticWebsite}. */
export interface DeployStaticWebsiteOptions {
  /** Distribution to invalidate (`/*`) once the upload completes. */
  readonly distribution?: IDistribution;
}
