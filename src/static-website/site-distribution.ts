import {Duration} from 'aws-cdk-lib';
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  type ErrorResponse,
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
import {needsRoutingFunction} from './utils';

/**
 * Serve `/index.html` with a 200 for any path the origin could not produce.
 *
 * Both codes are mapped because an OAC-fronted private bucket answers a missing
 * key with 403, not 404 — S3 will not confirm the key is absent without
 * `s3:ListBucket`. The TTL is zero so a real deploy fixes a stale fallback
 * immediately.
 */
const SPA_FALLBACK: ErrorResponse[] = [403, 404].map((httpStatus) => ({
  httpStatus,
  responseHttpStatus: 200,
  responsePagePath: '/index.html',
  ttl: Duration.seconds(0),
}));

/**
 * CloudFront distribution for a static site on a private S3 origin.
 *
 * HTTPS-only, HTTP/2+3, TLS 1.2, served from the origin bucket through a SigV4
 * OAC. Route handling follows {@link SiteDistributionProps.routing} — either a
 * viewer-request Function or SPA error responses. See {@link SiteRouting}.
 *
 * The OAC and rewrite Function are parented to `scope` rather than to this
 * construct: both must exist before `super()` runs, and `this` is not available
 * until it returns. They are named from `id`, so they appear alongside the
 * distribution as `${id}Oac` and `${id}Routing`.
 */
export class SiteDistribution extends Distribution {
  constructor(scope: Construct, id: string, props: SiteDistributionProps) {
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
  }
}
