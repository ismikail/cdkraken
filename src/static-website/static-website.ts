import {Construct} from 'constructs';
import {SITE_PRESETS, type StaticWebsiteProps} from './interfaces';
import {SiteBucket} from './site-bucket';
import {SiteDistribution} from './site-distribution';

/**
 * A complete static website: private origin bucket, CloudFront distribution
 * (OAC + route handling), and the cache-aware upload of the build.
 *
 * The caller supplies a DNS-validated us-east-1 certificate and the domain
 * names; this construct owns everything downstream. No DNS records are created
 * — read {@link distributionDomainName} and point your provider at it.
 *
 * Framework support is expressed as routing strategy plus asset layout, not as
 * per-framework classes, because at the CDN layer that is the whole of the
 * difference. Pick a {@link SITE_PRESETS} entry or set `routing` and
 * `immutablePaths` yourself.
 *
 * @example SvelteKit (adapter-static) — the default
 * ```ts
 * new StaticWebsite(this, 'Site', {
 *   buildPath: path.join(__dirname, '../../web/build'),
 *   certificate,
 *   domainNames: ['example.com', 'www.example.com'],
 * });
 * ```
 *
 * @example A React SPA
 * ```ts
 * new StaticWebsite(this, 'Site', {
 *   buildPath: path.join(__dirname, '../../app/dist'),
 *   certificate,
 *   domainNames: ['app.example.com'],
 *   preset: SITE_PRESETS.VITE_SPA,
 * });
 * ```
 *
 * Static hosting only, as the name says. A framework running server-side
 * (SvelteKit `adapter-node`, Next.js SSR) needs a compute origin instead.
 */
export class StaticWebsite extends Construct {
  public readonly bucket: SiteBucket;
  public readonly distribution: SiteDistribution;

  constructor(scope: Construct, id: string, props: StaticWebsiteProps) {
    super(scope, id);

    const {buildPath, certificate, domainNames, comment, preset = SITE_PRESETS.SVELTEKIT_STATIC} = props;
    const routing = props.routing ?? preset.routing;
    const immutablePaths = props.immutablePaths ?? [...preset.immutablePaths];

    this.bucket = new SiteBucket(this, 'Bucket', {buildPath, immutablePaths});

    this.distribution = new SiteDistribution(this, 'Distribution', {
      originBucket: this.bucket,
      certificate,
      domainNames,
      routing,
      comment,
    });

    // Uploaded last so the deployment can also invalidate the distribution.
    this.bucket.deployStaticWebsite({distribution: this.distribution});
  }

  /** Convenience passthrough for stack outputs. */
  get distributionDomainName(): string {
    return this.distribution.distributionDomainName;
  }
}
