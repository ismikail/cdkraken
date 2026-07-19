import {App, Stack} from 'aws-cdk-lib';
import {Template} from 'aws-cdk-lib/assertions';
import {Bucket} from 'aws-cdk-lib/aws-s3';
import {SiteDistribution} from '../src';

/**
 * Covers SiteDistribution used on its own. StaticWebsite always resolves and
 * passes `routing`, so its default is unreachable through the parent construct.
 */
function synth(props: Partial<ConstructorParameters<typeof SiteDistribution>[2]> = {}): Template {
  const stack = new Stack(new App(), 'TestStack', {env: {account: '111111111111', region: 'us-east-1'}});
  const originBucket = new Bucket(stack, 'Origin');

  new SiteDistribution(stack, 'Dist', {originBucket, ...props});

  return Template.fromStack(stack);
}

describe('SiteDistribution used standalone', () => {
  it('defaults to directory-index routing', () => {
    const template = synth();

    template.resourceCountIs('AWS::CloudFront::Function', 1);
    const fn = Object.values(template.findResources('AWS::CloudFront::Function'))[0];
    expect(fn.Properties.FunctionCode).toContain("uri + '/index.html'");
  });

  it('serves on the generated domain when no certificate is given', () => {
    const dist = Object.values(synth().findResources('AWS::CloudFront::Distribution'))[0];

    expect(dist.Properties.DistributionConfig.Aliases).toBeUndefined();
    expect(dist.Properties.DistributionConfig.ViewerCertificate).toBeUndefined();
  });
});
