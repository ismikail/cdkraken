import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {App, Stack} from 'aws-cdk-lib';
import {Template} from 'aws-cdk-lib/assertions';
import {SiteBucket} from '../src';

/**
 * Covers SiteBucket used on its own. StaticWebsite always hands it a
 * distribution, so these paths are unreachable through the parent construct.
 */
let buildPath: string;

beforeAll(() => {
  buildPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cdkraken-bucket-'));
  fs.writeFileSync(path.join(buildPath, 'index.html'), '<!doctype html>');
});

afterAll(() => {
  fs.rmSync(buildPath, {recursive: true, force: true});
});

function synth(props: Partial<ConstructorParameters<typeof SiteBucket>[2]> = {}): {
  template: Template;
  deploymentCount: number;
} {
  const stack = new Stack(new App(), 'TestStack', {env: {account: '111111111111', region: 'us-east-1'}});
  const bucket = new SiteBucket(stack, 'Origin', {buildPath, ...props});
  const deployments = bucket.deployStaticWebsite();

  return {template: Template.fromStack(stack), deploymentCount: deployments.length};
}

describe('SiteBucket used standalone', () => {
  it('deploys without a distribution, and so without an invalidation', () => {
    const {template} = synth();

    for (const deployment of Object.values(template.findResources('Custom::CDKBucketDeployment'))) {
      expect(deployment.Properties.DistributionId).toBeUndefined();
      expect(deployment.Properties.DistributionPaths).toBeUndefined();
    }
  });

  it('returns one deployment when no immutable paths are configured', () => {
    expect(synth().deploymentCount).toBe(1);
  });

  it('returns both deployments when immutable paths are configured', () => {
    const {deploymentCount, template} = synth({immutablePaths: ['_app/immutable']});

    expect(deploymentCount).toBe(2);
    template.resourceCountIs('Custom::CDKBucketDeployment', 2);
  });

  it('outputs the bucket name', () => {
    const outputs = Object.values(synth().template.findOutputs('*'));

    expect(outputs).toHaveLength(1);
    expect(outputs[0].Value).toEqual({Ref: expect.stringContaining('Origin')});
  });
});
