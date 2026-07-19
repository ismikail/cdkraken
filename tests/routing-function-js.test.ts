import {App, Stack} from 'aws-cdk-lib';
import {Match, Template} from 'aws-cdk-lib/assertions';
import {FunctionRuntime} from 'aws-cdk-lib/aws-cloudfront';
import {DEFAULT_ROUTING_FUNCTION_RUNTIME, RoutingFunctionJs, SiteRouting} from '../src';

/**
 * Extract the inline handler and run it, so the rewrite rules are tested as
 * behaviour rather than as a string match against the template.
 */
function rewriter(routing: SiteRouting): (uri: string) => string {
  const stack = new Stack(new App(), 'TestStack');
  new RoutingFunctionJs(stack, 'Fn', routing);

  const resource = Object.values(Template.fromStack(stack).findResources('AWS::CloudFront::Function'))[0];
  const code: string = resource.Properties.FunctionCode;

  // biome-ignore lint/security/noGlobalEval: evaluating our own generated handler under test
  const handler = eval(`(function () { ${code}; return handler; })()`);
  return (uri: string) => handler({request: {uri}}).uri;
}

describe('RoutingFunctionJs', () => {
  it.each([SiteRouting.SPA, SiteRouting.NONE])('throws when constructed for %s', (routing) => {
    const stack = new Stack(new App(), 'TestStack');
    expect(() => new RoutingFunctionJs(stack, 'Fn', routing)).toThrow(/not implemented with a CloudFront Function/);
  });

  it('pins the runtime rather than inheriting the consumer feature flag', () => {
    // Left unset, CDK picks 1.0 or 2.0 from the consuming app's cdk.json, so
    // the same construct would deploy differently in different repos.
    const stack = new Stack(new App(), 'TestStack');
    new RoutingFunctionJs(stack, 'Fn', SiteRouting.DIRECTORY_INDEX);

    Template.fromStack(stack).hasResourceProperties('AWS::CloudFront::Function', {
      FunctionConfig: Match.objectLike({Runtime: 'cloudfront-js-2.0'}),
    });
    expect(DEFAULT_ROUTING_FUNCTION_RUNTIME.value).toBe('cloudfront-js-2.0');
  });

  it('lets a caller override the runtime', () => {
    const stack = new Stack(new App(), 'TestStack');
    new RoutingFunctionJs(stack, 'Fn', SiteRouting.DIRECTORY_INDEX, {runtime: FunctionRuntime.JS_1_0});

    Template.fromStack(stack).hasResourceProperties('AWS::CloudFront::Function', {
      FunctionConfig: Match.objectLike({Runtime: 'cloudfront-js-1.0'}),
    });
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
