import {App, Stack} from 'aws-cdk-lib';
import {Template} from 'aws-cdk-lib/assertions';
import {needsRoutingFunction, RoutingFunction, SiteRouting} from '../src';

/**
 * Extract the inline handler and run it, so the rewrite rules are tested as
 * behaviour rather than as a string match against the template.
 */
function rewriter(routing: SiteRouting): (uri: string) => string {
  const stack = new Stack(new App(), 'TestStack');
  new RoutingFunction(stack, 'Fn', routing);

  const resource = Object.values(Template.fromStack(stack).findResources('AWS::CloudFront::Function'))[0];
  const code: string = resource.Properties.FunctionCode;

  // biome-ignore lint/security/noGlobalEval: evaluating our own generated handler under test
  const handler = eval(`(function () { ${code}; return handler; })()`);
  return (uri: string) => handler({request: {uri}}).uri;
}

describe('needsRoutingFunction', () => {
  it.each([
    [SiteRouting.DIRECTORY_INDEX, true],
    [SiteRouting.HTML_EXTENSION, true],
    [SiteRouting.SPA, false],
    [SiteRouting.NONE, false],
  ])('%s -> %s', (routing, expected) => {
    expect(needsRoutingFunction(routing)).toBe(expected);
  });

  it.each([SiteRouting.SPA, SiteRouting.NONE])('throws when constructed for %s', (routing) => {
    const stack = new Stack(new App(), 'TestStack');
    expect(() => new RoutingFunction(stack, 'Fn', routing)).toThrow(/not implemented with a CloudFront Function/);
  });
});

describe('DIRECTORY_INDEX', () => {
  const rewrite = rewriter(SiteRouting.DIRECTORY_INDEX);

  it.each([
    ['/', '/index.html'],
    ['/about', '/about/index.html'],
    ['/about/', '/about/index.html'],
    ['/blog/post-one', '/blog/post-one/index.html'],
  ])('%s -> %s', (input, expected) => {
    expect(rewrite(input)).toBe(expected);
  });

  it.each([
    '/favicon.ico',
    '/_app/immutable/chunks/index.a1b2c3.js',
    '/robots.txt',
  ])('leaves the real file %s alone', (uri) => {
    expect(rewrite(uri)).toBe(uri);
  });

  it('rewrites a route whose parent directory contains a dot', () => {
    // Testing the whole URI for a dot would misread this as a file and 403.
    expect(rewrite('/v1.2/docs')).toBe('/v1.2/docs/index.html');
  });
});

describe('HTML_EXTENSION', () => {
  const rewrite = rewriter(SiteRouting.HTML_EXTENSION);

  it.each([
    ['/about', '/about.html'],
    ['/about/', '/about.html'],
    ['/blog/post-one', '/blog/post-one.html'],
  ])('%s -> %s', (input, expected) => {
    expect(rewrite(input)).toBe(expected);
  });

  it('defers the root to defaultRootObject', () => {
    expect(rewrite('/')).toBe('/');
  });

  it('leaves real files alone', () => {
    expect(rewrite('/_next/static/chunk.a1b2.js')).toBe('/_next/static/chunk.a1b2.js');
  });

  it('rewrites a route whose parent directory contains a dot', () => {
    expect(rewrite('/v1.2/docs')).toBe('/v1.2/docs.html');
  });
});
