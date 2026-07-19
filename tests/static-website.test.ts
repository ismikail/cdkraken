import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {App, Stack} from 'aws-cdk-lib';
import {Match, Template} from 'aws-cdk-lib/assertions';
import {Certificate} from 'aws-cdk-lib/aws-certificatemanager';
import {SITE_PRESETS, SiteRouting, StaticWebsite} from '../src';

/** BucketDeployment needs a real directory to stage, so build one per suite. */
let buildPath: string;

beforeAll(() => {
  buildPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cdkraken-build-'));
  fs.writeFileSync(path.join(buildPath, 'index.html'), '<!doctype html>');
});

afterAll(() => {
  fs.rmSync(buildPath, {recursive: true, force: true});
});

function synth(props: Partial<Parameters<typeof StaticWebsite.prototype.constructor>[2]> = {}): Template {
  const stack = new Stack(new App(), 'TestStack', {env: {account: '111111111111', region: 'us-east-1'}});
  const certificate = Certificate.fromCertificateArn(
    stack,
    'Cert',
    'arn:aws:acm:us-east-1:111111111111:certificate/abc-123',
  );

  new StaticWebsite(stack, 'Site', {
    buildPath,
    certificate,
    domainNames: ['example.com'],
    ...props,
  });

  return Template.fromStack(stack);
}

describe('custom domains', () => {
  it('serves on the generated CloudFront domain when no certificate is given', () => {
    // Omitting both is the preview / internal-environment shape.
    const template = synth({certificate: undefined, domainNames: undefined});
    const dist = Object.values(template.findResources('AWS::CloudFront::Distribution'))[0];

    // Both properties are omitted entirely; CloudFront then falls back to the
    // generated domain and its own certificate.
    expect(dist.Properties.DistributionConfig.Aliases).toBeUndefined();
    expect(dist.Properties.DistributionConfig.ViewerCertificate).toBeUndefined();
  });

  it('allows a certificate with no domain names', () => {
    // CDK documents this as the way to move an alternate domain name between
    // distributions, so the validation must stay one-directional.
    expect(() => synth({domainNames: undefined})).not.toThrow();
  });

  it('rejects domain names without a certificate at synth time', () => {
    // CloudFront refuses aliases with no ACM certificate, but CDK does not
    // check — left alone this surfaces part-way through a deploy instead.
    expect(() => synth({certificate: undefined, domainNames: ['example.com']})).toThrow(
      /domainNames \(example\.com\) requires a certificate/,
    );
  });

  it('outputs the CloudFront domain and the origin bucket name', () => {
    const values = Object.values(synth().findOutputs('*'));

    expect(values).toHaveLength(2);
    expect(values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          Value: {'Fn::GetAtt': [expect.stringContaining('SiteDistribution'), 'DomainName']},
        }),
        expect.objectContaining({Value: {Ref: expect.stringContaining('SiteBucket')}}),
      ]),
    );
  });

  it('scopes outputs so two sites in one stack do not collide', () => {
    const stack = new Stack(new App(), 'TestStack', {env: {account: '111111111111', region: 'us-east-1'}});
    for (const id of ['Marketing', 'Docs']) {
      new StaticWebsite(stack, id, {buildPath, domainNames: undefined, certificate: undefined});
    }

    // Two per site; a stack-scoped output would have collided on the second.
    expect(Object.keys(Template.fromStack(stack).findOutputs('*'))).toHaveLength(4);
  });

  it('exposes the distribution domain for stack outputs', () => {
    const stack = new Stack(new App(), 'TestStack', {env: {account: '111111111111', region: 'us-east-1'}});
    const site = new StaticWebsite(stack, 'Site', {buildPath});

    expect(stack.resolve(site.distributionDomainName)).toEqual({
      'Fn::GetAtt': [expect.stringContaining('SiteDistribution'), 'DomainName'],
    });
  });

  it('still applies routing and caching without a certificate', () => {
    const template = synth({certificate: undefined, domainNames: undefined});
    template.resourceCountIs('AWS::CloudFront::Function', 1);
    template.resourceCountIs('Custom::CDKBucketDeployment', 2);
  });
});

describe('StaticWebsite', () => {
  it('keeps the origin bucket private and encrypted', () => {
    synth().hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      BucketEncryption: Match.objectLike({
        ServerSideEncryptionConfiguration: [{ServerSideEncryptionByDefault: {SSEAlgorithm: 'AES256'}}],
      }),
    });
  });

  it('serves the domains over HTTPS only, with TLS 1.2', () => {
    synth().hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Aliases: ['example.com'],
        DefaultRootObject: 'index.html',
        ViewerCertificate: Match.objectLike({MinimumProtocolVersion: 'TLSv1.2_2021'}),
        DefaultCacheBehavior: Match.objectLike({ViewerProtocolPolicy: 'redirect-to-https'}),
      }),
    });
  });

  it('defaults to the SvelteKit directory-index preset', () => {
    const template = synth();
    template.resourceCountIs('AWS::CloudFront::Function', 1);
    const fn = Object.values(template.findResources('AWS::CloudFront::Function'))[0];
    expect(fn.Properties.FunctionCode).toContain("'/index.html'");
  });
});

describe('routing strategies', () => {
  it('DIRECTORY_INDEX rewrites extensionless routes to /index.html', () => {
    const template = synth({routing: SiteRouting.DIRECTORY_INDEX});
    const fn = Object.values(template.findResources('AWS::CloudFront::Function'))[0];
    expect(fn.Properties.FunctionCode).toContain("uri + '/index.html'");
  });

  it('HTML_EXTENSION appends .html instead', () => {
    const template = synth({routing: SiteRouting.HTML_EXTENSION});
    const fn = Object.values(template.findResources('AWS::CloudFront::Function'))[0];
    expect(fn.Properties.FunctionCode).toContain("uri + '.html'");
  });

  it('SPA uses error responses rather than a Function', () => {
    const template = synth({preset: SITE_PRESETS.VITE_SPA});

    // A viewer-request Function runs before the origin, so it cannot react to a
    // missing object — the fallback has to come from CloudFront error handling.
    template.resourceCountIs('AWS::CloudFront::Function', 0);
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CustomErrorResponses: Match.arrayWith([
          // 403, not just 404: an OAC-fronted private bucket will not disclose
          // that a key is absent, so a missing route surfaces as Forbidden.
          {ErrorCode: 403, ResponseCode: 200, ResponsePagePath: '/index.html', ErrorCachingMinTTL: 0},
          {ErrorCode: 404, ResponseCode: 200, ResponsePagePath: '/index.html', ErrorCachingMinTTL: 0},
        ]),
      }),
    });
  });

  it('NONE adds neither a Function nor error responses', () => {
    const template = synth({routing: SiteRouting.NONE, immutablePaths: []});
    template.resourceCountIs('AWS::CloudFront::Function', 0);
    const dist = Object.values(template.findResources('AWS::CloudFront::Distribution'))[0];
    expect(dist.Properties.DistributionConfig.CustomErrorResponses).toBeUndefined();
  });
});

describe('cache-aware upload', () => {
  it('splits hashed assets from HTML so deploys are visible immediately', () => {
    const template = synth({preset: SITE_PRESETS.SVELTEKIT_STATIC});
    const deployments = Object.values(template.findResources('Custom::CDKBucketDeployment'));
    expect(deployments).toHaveLength(2);

    const cacheControls = deployments.map((d) => d.Properties.SystemMetadata?.['cache-control']);
    expect(cacheControls).toEqual(
      expect.arrayContaining([expect.stringContaining('immutable'), expect.stringContaining('no-cache')]),
    );
  });

  it('never prunes, since each deployment sees only half the build', () => {
    const template = synth({preset: SITE_PRESETS.SVELTEKIT_STATIC});
    for (const d of Object.values(template.findResources('Custom::CDKBucketDeployment'))) {
      expect(d.Properties.Prune).toBe(false);
    }
  });

  it('falls back to a single deployment when no immutable paths are given', () => {
    const template = synth({immutablePaths: []});
    template.resourceCountIs('Custom::CDKBucketDeployment', 1);
  });

  it('invalidates the distribution on deploy', () => {
    synth().hasResourceProperties('Custom::CDKBucketDeployment', {
      DistributionPaths: ['/*'],
    });
  });
});
