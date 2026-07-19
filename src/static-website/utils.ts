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

/**
 * Viewer-request handler source per routing mode.
 *
 * CloudFront Functions run a constrained JS runtime, so this code stays
 * ES5-safe — no `endsWith`, no arrow functions, no template literals.
 *
 * Modes absent from this map are not implemented with a Function at all. See
 * {@link needsRoutingFunction}.
 */
export const ROUTING_CODE: Partial<Record<SiteRouting, string>> = {
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

/**
 * Is a viewer-request Function the right mechanism for this routing mode?
 *
 * `false` for {@link SiteRouting.SPA}, which needs distribution error responses
 * because a viewer-request Function runs before the origin and so cannot react
 * to a missing object, and for {@link SiteRouting.NONE}, which needs no
 * rewriting at all.
 */
export function needsRoutingFunction(routing: SiteRouting): boolean {
  return ROUTING_CODE[routing] !== undefined;
}

/**
 * Normalise an immutable path into a `BucketDeployment` glob.
 *
 * Trailing slashes are stripped so `_app/immutable` and `_app/immutable/` both
 * yield `_app/immutable/*`.
 */
export function toDeploymentGlob(immutablePath: string): string {
  return `${immutablePath.replace(/\/+$/, '')}/*`;
}
