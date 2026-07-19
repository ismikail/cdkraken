import {Duration, RemovalPolicy} from 'aws-cdk-lib';
import {BlockPublicAccess, Bucket, BucketEncryption} from 'aws-cdk-lib/aws-s3';
import {BucketDeployment, CacheControl, Source} from 'aws-cdk-lib/aws-s3-deployment';
import type {Construct} from 'constructs';
import type {DeployStaticWebsiteOptions, SiteBucketProps} from './interface';
import {toDeploymentGlob} from './utils';

/** One year, the maximum meaningful `max-age` for content-hashed assets. */
const IMMUTABLE_CACHE = [CacheControl.maxAge(Duration.days(365)), CacheControl.immutable(), CacheControl.setPublic()];

/** HTML must revalidate, otherwise a deploy stays invisible until the TTL lapses. */
const MUTABLE_CACHE = [CacheControl.noCache(), CacheControl.setPublic()];

/**
 * Private, encrypted S3 bucket for a static site build.
 *
 * Blocks all public access — content is reachable only through CloudFront via
 * OAC. Defaults to `removalPolicy: DESTROY` + `autoDeleteObjects` so teardown
 * stays a single command; pass `props` to override (e.g. `RETAIN` for prod).
 *
 * Call {@link deployStaticWebsite} once the distribution exists to upload the
 * build and invalidate the cache.
 */
export class SiteBucket extends Bucket {
  private readonly buildPath: string;
  private readonly immutablePaths: string[];

  constructor(scope: Construct, id: string, props: SiteBucketProps) {
    const {buildPath, immutablePaths = [], ...bucketProps} = props;

    super(scope, id, {
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      ...bucketProps,
    });

    this.buildPath = buildPath;
    this.immutablePaths = immutablePaths;
  }

  /**
   * Upload the static build to this bucket.
   *
   * When `immutablePaths` is non-empty the upload is split into two
   * deployments so each half gets the `Cache-Control` it warrants: hashed
   * assets are cached for a year and never revalidated, while HTML and
   * everything else is `no-cache`, so a deploy takes effect on the next
   * request rather than after a TTL expires.
   *
   * Both deployments run with `prune: false`. They must — each one sees only
   * its own half of the build, so a pruning deployment would delete the other
   * half's objects on every deploy. The cost is that superseded hashed assets
   * accumulate in the bucket; that is usually welcome, since it keeps old
   * bundles fetchable for sessions loaded just before a deploy. Add an S3
   * lifecycle rule if you want them reaped.
   *
   * @returns every deployment created, in upload order.
   */
  deployStaticWebsite(options: DeployStaticWebsiteOptions = {}): BucketDeployment[] {
    const {distribution} = options;
    const invalidation = distribution ? {distribution, distributionPaths: ['/*']} : {};

    if (this.immutablePaths.length === 0) {
      return [
        new BucketDeployment(this, 'Deploy', {
          sources: [Source.asset(this.buildPath)],
          destinationBucket: this,
          ...invalidation,
        }),
      ];
    }

    const globs = this.immutablePaths.map(toDeploymentGlob);

    // Hashed assets first, so a freshly-uploaded index.html never references a
    // bundle that has not landed yet.
    const immutable = new BucketDeployment(this, 'DeployImmutable', {
      sources: [Source.asset(this.buildPath)],
      destinationBucket: this,
      exclude: ['*'],
      include: globs,
      cacheControl: IMMUTABLE_CACHE,
      prune: false,
    });

    const mutable = new BucketDeployment(this, 'Deploy', {
      sources: [Source.asset(this.buildPath)],
      destinationBucket: this,
      exclude: globs,
      cacheControl: MUTABLE_CACHE,
      prune: false,
      ...invalidation,
    });

    mutable.node.addDependency(immutable);

    return [immutable, mutable];
  }
}
