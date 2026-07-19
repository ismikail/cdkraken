import {needsRoutingFunction, ROUTING_CODE, SiteRouting, toDeploymentGlob} from '../src';

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
