import {Function as CloudFrontFunction, FunctionCode, type FunctionProps} from 'aws-cdk-lib/aws-cloudfront';
import type {Construct} from 'constructs';
import {SiteRouting} from './interface';

/**
 * Does the final path segment contain a dot?
 *
 * Testing only the last segment — rather than the whole URI — matters: a path
 * like `/v1.2/docs` has a dot in a *directory* segment but is still a route,
 * and testing the whole string would leave it unrewritten and 403 at the
 * origin.
 */
const LAST_SEGMENT_HAS_DOT = `
  var last = uri.substring(uri.lastIndexOf('/') + 1);
  var isFile = last.indexOf('.') !== -1;
`;

// CloudFront Functions run a constrained JS runtime, so these stay ES5-safe.
const ROUTING_CODE: Partial<Record<SiteRouting, string>> = {
  [SiteRouting.DIRECTORY_INDEX]: `
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.charAt(uri.length - 1) === '/') {
    request.uri = uri + 'index.html';
    return request;
  }
${LAST_SEGMENT_HAS_DOT}
  if (!isFile) {
    request.uri = uri + '/index.html';
  }
  return request;
}
`,
  [SiteRouting.HTML_EXTENSION]: `
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri === '/') {
    return request;
  }
  if (uri.charAt(uri.length - 1) === '/') {
    uri = uri.substring(0, uri.length - 1);
  }
${LAST_SEGMENT_HAS_DOT}
  request.uri = isFile ? uri : uri + '.html';
  return request;
}
`,
};

/** Is a viewer-request Function the right mechanism for this routing mode? */
export function needsRoutingFunction(routing: SiteRouting): boolean {
  return ROUTING_CODE[routing] !== undefined;
}

/**
 * CloudFront viewer-request Function that maps directory-style routes onto the
 * objects a static build actually emits.
 *
 * Only meaningful for {@link SiteRouting.DIRECTORY_INDEX} and
 * {@link SiteRouting.HTML_EXTENSION}. {@link SiteRouting.SPA} is handled with
 * distribution error responses instead (a viewer-request Function runs before
 * the origin, so it cannot react to a missing object), and
 * {@link SiteRouting.NONE} needs no rewriting at all — constructing this for
 * either throws.
 */
export class RoutingFunction extends CloudFrontFunction {
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
      ...props,
      code: FunctionCode.fromInline(code),
    });
  }
}
