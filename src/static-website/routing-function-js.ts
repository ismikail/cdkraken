import {
  Function as CloudFrontFunction,
  FunctionCode,
  type FunctionProps,
  FunctionRuntime,
} from 'aws-cdk-lib/aws-cloudfront';
import type {Construct} from 'constructs';
import type {SiteRouting} from './interface';
import {ROUTING_CODE} from './utils';

/**
 * Runtime this Function is pinned to.
 *
 * Pinned deliberately. Left unset, CDK resolves the runtime from the
 * `@aws-cdk/aws-cloudfront:defaultRuntimeVersionV2_0` feature flag in the
 * *consuming* app's `cdk.json` — so the same construct would deploy on
 * `cloudfront-js-1.0` in one repo and `cloudfront-js-2.0` in another. A library
 * cannot leave that to ambient configuration. Override via `props.runtime`.
 */
export const DEFAULT_ROUTING_FUNCTION_RUNTIME = FunctionRuntime.JS_2_0;

/**
 * CloudFront viewer-request Function (JS runtime) that maps directory-style
 * routes onto the objects a static build actually emits.
 *
 * Only meaningful for {@link SiteRouting.DIRECTORY_INDEX} and
 * {@link SiteRouting.HTML_EXTENSION}. {@link SiteRouting.SPA} is handled with
 * distribution error responses instead (a viewer-request Function runs before
 * the origin, so it cannot react to a missing object), and
 * {@link SiteRouting.NONE} needs no rewriting at all — constructing this for
 * either throws.
 *
 * The `Js` suffix names the runtime family. CloudFront Functions are JS-only
 * today, but the handler code is also the thing a Lambda@Edge equivalent would
 * replace, so the distinction is worth carrying in the name.
 */
export class RoutingFunctionJs extends CloudFrontFunction {
  constructor(scope: Construct, id: string, routing: SiteRouting, props?: Partial<Omit<FunctionProps, 'code'>>) {
    const code = ROUTING_CODE[routing];
    if (!code) {
      throw new Error(
        `SiteRouting.${routing} is not implemented with a CloudFront Function. ` +
          'Use SiteRouting.DIRECTORY_INDEX or SiteRouting.HTML_EXTENSION, or check needsRoutingFunction() first.',
      );
    }

    super(scope, id, {
      comment: `cdkraken: ${routing} route rewriting`,
      runtime: DEFAULT_ROUTING_FUNCTION_RUNTIME,
      ...props,
      code: FunctionCode.fromInline(code),
    });
  }
}
