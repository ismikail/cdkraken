import {CfnOutput} from 'aws-cdk-lib';
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  FunctionEventType,
  HttpVersion,
  PriceClass,
  S3OriginAccessControl,
  SecurityPolicyProtocol,
  Signing,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import {S3BucketOrigin} from 'aws-cdk-lib/aws-cloudfront-origins';
import type {Construct} from 'constructs';
import {type SiteDistributionProps, SiteRouting} from './interface';
import {RoutingFunctionJs} from './routing-function-js';
import {needsRoutingFunction, SPA_FALLBACK} from './utils';

/**
 * CloudFront distribution for a static site on a private S3 origin.
 *
 * HTTPS-only, HTTP/2+3, TLS 1.2, served from the origin bucket through a SigV4
 * OAC. Route handling follows {@link SiteDistributionProps.routing} — either a
 * viewer-request Function or SPA error responses. See {@link SiteRouting}.
 *
 * With no {@link SiteDistributionProps.certificate} the site is served on the
 * generated `*.cloudfront.net` domain under CloudFront's own certificate, which
 * is the usual shape for a preview or internal environment.
 *
 * The OAC and rewrite Function are parented to `scope` rather than to this
 * construct: both must exist before `super()` runs, and `this` is not available
 * until it returns. They are named from `id`, so they appear alongside the
 * distribution as `${id}Oac` and `${id}Routing`.
 */
export class SiteDistribution extends Distribution {
  /**
   * CloudFront rejects alternate domain names without an ACM certificate, but
   * CDK does not check for it — the stack synthesizes and then fails part-way
   * through a CloudFormation deploy. Fail at synth instead.
   */
  private static validate(props: SiteDistributionProps): void {
    if (props.domainNames?.length && !props.certificate) {
      throw new Error(
        `domainNames (${props.domainNames.join(', ')}) requires a certificate: CloudFront will not serve an ` +
          'alternate domain name without an ACM certificate covering it, and that certificate must be in ' +
          'us-east-1. Pass one, or omit domainNames to serve on the generated *.cloudfront.net domain.',
      );
    }
  }

  constructor(scope: Construct, id: string, props: SiteDistributionProps) {
    SiteDistribution.validate(props);

    const {originBucket, certificate, domainNames, comment, routing = SiteRouting.DIRECTORY_INDEX} = props;

    const oac = new S3OriginAccessControl(scope, `${id}Oac`, {
      signing: Signing.SIGV4_ALWAYS,
    });

    const origin = S3BucketOrigin.withOriginAccessControl(originBucket, {
      originAccessControl: oac,
    });

    const functionAssociations = needsRoutingFunction(routing)
      ? [
          {
            function: new RoutingFunctionJs(scope, `${id}Routing`, routing),
            eventType: FunctionEventType.VIEWER_REQUEST,
          },
        ]
      : undefined;

    super(scope, id, {
      comment,
      domainNames,
      certificate,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
        ...(functionAssociations ? {functionAssociations} : {}),
      },
      ...(routing === SiteRouting.SPA ? {errorResponses: SPA_FALLBACK} : {}),
      priceClass: PriceClass.PRICE_CLASS_100,
      httpVersion: HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
    });

    // Scoped to `this`, so the logical ID stays unique when a stack holds more
    // than one distribution. Without a certificate this domain is the only way
    // to reach the site; with one it is the value your DNS provider needs.
    new CfnOutput(this, 'DomainName', {
      value: this.distributionDomainName,
      description: 'CloudFront domain — point your DNS provider at this.',
    });
  }
}
