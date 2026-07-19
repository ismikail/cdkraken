import {needsRoutingFunction, ROUTING_CODE, SiteRouting, SPA_FALLBACK, toDeploymentGlob} from '../src';

describe('needsRoutingFunction', () => {
  it.each([
    [SiteRouting.DIRECTORY_INDEX, true],
    [SiteRouting.HTML_EXTENSION, true],
    // SPA needs distribution error responses, NONE needs nothing at all.
    [SiteRouting.SPA, false],
    [SiteRouting.NONE, false],
  ])('%s -> %s', (routing, expected) => {
    expect(needsRoutingFunction(routing)).toBe(expected);
  });

  it('agrees with the routing code table', () => {
    for (const routing of Object.values(SiteRouting)) {
      expect(needsRoutingFunction(routing)).toBe(routing in ROUTING_CODE);
    }
  });
});

describe('ROUTING_CODE', () => {
  it.each([SiteRouting.DIRECTORY_INDEX, SiteRouting.HTML_EXTENSION])('%s exposes a handler entry point', (routing) => {
    expect(ROUTING_CODE[routing]).toContain('function handler(event)');
  });

  it.each([SiteRouting.DIRECTORY_INDEX, SiteRouting.HTML_EXTENSION])('%s stays ES5-safe', (routing) => {
    // CloudFront Functions run a constrained runtime — these would fail there.
    const code = ROUTING_CODE[routing] as string;
    expect(code).not.toMatch(/=>|\bconst\b|\blet\b|endsWith|includes|`/);
  });
});

describe('SPA_FALLBACK', () => {
  it('maps 403 as well as 404', () => {
    // A private OAC-fronted bucket answers a missing key with 403, not 404 —
    // covering only 404 would leave every SPA deep link broken.
    expect(SPA_FALLBACK.map((r) => r.httpStatus).sort()).toEqual([403, 404]);
  });

  it('rewrites to index.html with a 200 and no caching', () => {
    for (const response of SPA_FALLBACK) {
      expect(response.responseHttpStatus).toBe(200);
      expect(response.responsePagePath).toBe('/index.html');
      // Non-zero would keep serving a stale fallback after a fixing deploy.
      expect(response.ttl?.toSeconds()).toBe(0);
    }
  });
});

describe('toDeploymentGlob', () => {
  it.each([
    ['_app/immutable', '_app/immutable/*'],
    ['_app/immutable/', '_app/immutable/*'],
    ['_app/immutable//', '_app/immutable/*'],
    ['assets', 'assets/*'],
  ])('%s -> %s', (input, expected) => {
    expect(toDeploymentGlob(input)).toBe(expected);
  });
});
