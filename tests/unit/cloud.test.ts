import { CloudProvider } from '../../src/types';
import {
  getCloudProvider,
  getAllProviders,
  generateMultiCloudNFR,
  AWSProvider,
  GCPProvider,
  AzureProvider,
  type NFRContext,
  type NFRArtifacts,
  type CloudProviderAdapter,
} from '../../src/cloud/index';

const TEST_CTX: NFRContext = {
  projectName: 'my-test-project',
  language: 'TypeScript',
  framework: 'Express',
  deployTarget: 'Kubernetes',
  featureDescription: 'A test feature for unit tests',
};

const NFR_ARTIFACT_KEYS: (keyof NFRArtifacts)[] = [
  'monitoringConfig',
  'alertingRules',
  'scalingPolicy',
  'costAnalysis',
  'slaDefinition',
  'disasterRecoveryPlan',
  'performanceBenchmark',
  'runbook',
];

describe('Cloud module index', () => {
  describe('getCloudProvider()', () => {
    it('should return an AWS provider for CloudProvider.AWS', () => {
      const provider = getCloudProvider(CloudProvider.AWS);
      expect(provider).not.toBeNull();
      expect(provider!.profile.provider).toBe(CloudProvider.AWS);
    });

    it('should return a GCP provider for CloudProvider.GCP', () => {
      const provider = getCloudProvider(CloudProvider.GCP);
      expect(provider).not.toBeNull();
      expect(provider!.profile.provider).toBe(CloudProvider.GCP);
    });

    it('should return an Azure provider for CloudProvider.AZURE', () => {
      const provider = getCloudProvider(CloudProvider.AZURE);
      expect(provider).not.toBeNull();
      expect(provider!.profile.provider).toBe(CloudProvider.AZURE);
    });

    it('should return null for CloudProvider.NONE', () => {
      const provider = getCloudProvider(CloudProvider.NONE);
      expect(provider).toBeNull();
    });

    it('should return null for CloudProvider.MULTI_CLOUD', () => {
      const provider = getCloudProvider(CloudProvider.MULTI_CLOUD);
      expect(provider).toBeNull();
    });
  });

  describe('getAllProviders()', () => {
    it('should return 3 providers', () => {
      const providers = getAllProviders();
      expect(providers).toHaveLength(3);
    });

    it('should include AWS, GCP, and Azure', () => {
      const providers = getAllProviders();
      const providerTypes = providers.map(p => p.profile.provider);
      expect(providerTypes).toContain(CloudProvider.AWS);
      expect(providerTypes).toContain(CloudProvider.GCP);
      expect(providerTypes).toContain(CloudProvider.AZURE);
    });
  });

  describe('generateMultiCloudNFR()', () => {
    it('should return NFR artifacts for all 3 providers', () => {
      const result = generateMultiCloudNFR(TEST_CTX);
      const keys = Object.keys(result);
      expect(keys).toHaveLength(3);
      expect(keys).toContain(CloudProvider.AWS);
      expect(keys).toContain(CloudProvider.GCP);
      expect(keys).toContain(CloudProvider.AZURE);
    });

    it('should include all 8 artifact types for each provider', () => {
      const result = generateMultiCloudNFR(TEST_CTX);
      for (const providerKey of Object.keys(result)) {
        const artifacts = result[providerKey];
        for (const key of NFR_ARTIFACT_KEYS) {
          expect(artifacts[key]).toBeDefined();
          expect(typeof artifacts[key]).toBe('string');
          expect(artifacts[key].length).toBeGreaterThan(0);
        }
      }
    });
  });
});

describe('AWSProvider', () => {
  let provider: CloudProviderAdapter;

  beforeAll(() => {
    provider = new AWSProvider();
  });

  describe('profile', () => {
    it('should have the correct name', () => {
      expect(provider.profile.name).toBe('Amazon Web Services');
    });

    it('should have provider set to AWS', () => {
      expect(provider.profile.provider).toBe(CloudProvider.AWS);
    });

    it('should have all service keys', () => {
      const services = provider.profile.services;
      expect(services.compute).toBeDefined();
      expect(services.containers).toBeDefined();
      expect(services.serverless).toBeDefined();
      expect(services.databases).toBeDefined();
      expect(services.messaging).toBeDefined();
      expect(services.storage).toBeDefined();
      expect(services.cdn).toBeDefined();
      expect(services.loadBalancer).toBeDefined();
      expect(services.dns).toBeDefined();
    });

    it('should have all monitoring keys', () => {
      const mon = provider.profile.monitoring;
      expect(mon.metrics).toBeDefined();
      expect(mon.logging).toBeDefined();
      expect(mon.tracing).toBeDefined();
      expect(mon.dashboards).toBeDefined();
      expect(mon.alerting).toBeDefined();
    });
  });

  describe('generateNFRArtifacts()', () => {
    let artifacts: NFRArtifacts;

    beforeAll(() => {
      artifacts = provider.generateNFRArtifacts(TEST_CTX);
    });

    it('should return all 8 NFR artifacts', () => {
      for (const key of NFR_ARTIFACT_KEYS) {
        expect(artifacts[key]).toBeDefined();
      }
    });

    it.each(NFR_ARTIFACT_KEYS)('%s should be a non-empty string', (key) => {
      expect(typeof artifacts[key]).toBe('string');
      expect(artifacts[key].length).toBeGreaterThan(0);
    });

    it.each(NFR_ARTIFACT_KEYS)('%s should contain the project name', (key) => {
      expect(artifacts[key]).toContain(TEST_CTX.projectName);
    });

    it('monitoringConfig should reference CloudWatch', () => {
      expect(artifacts.monitoringConfig).toContain('CloudWatch');
    });

    it('alertingRules should reference CloudWatch and SNS', () => {
      expect(artifacts.alertingRules).toContain('CloudWatch');
      expect(artifacts.alertingRules).toContain('SNS');
    });

    it('scalingPolicy should reference ECS', () => {
      expect(artifacts.scalingPolicy).toContain('ECS');
    });

    it('runbook should reference AWS services', () => {
      expect(artifacts.runbook).toContain('aws');
    });

    it('disasterRecoveryPlan should reference regions', () => {
      expect(artifacts.disasterRecoveryPlan).toContain('us-east-1');
      expect(artifacts.disasterRecoveryPlan).toContain('us-west-2');
    });

    it('costAnalysis should contain cost figures', () => {
      expect(artifacts.costAnalysis).toContain('$');
    });
  });
});

describe('GCPProvider', () => {
  let provider: CloudProviderAdapter;

  beforeAll(() => {
    provider = new GCPProvider();
  });

  describe('profile', () => {
    it('should have the correct name', () => {
      expect(provider.profile.name).toBe('Google Cloud Platform');
    });

    it('should have provider set to GCP', () => {
      expect(provider.profile.provider).toBe(CloudProvider.GCP);
    });

    it('should have all service keys', () => {
      const services = provider.profile.services;
      expect(services.compute).toBeDefined();
      expect(services.containers).toBeDefined();
      expect(services.serverless).toBeDefined();
      expect(services.databases).toBeDefined();
      expect(services.messaging).toBeDefined();
      expect(services.storage).toBeDefined();
      expect(services.cdn).toBeDefined();
      expect(services.loadBalancer).toBeDefined();
      expect(services.dns).toBeDefined();
    });

    it('should have all monitoring keys', () => {
      const mon = provider.profile.monitoring;
      expect(mon.metrics).toBeDefined();
      expect(mon.logging).toBeDefined();
      expect(mon.tracing).toBeDefined();
      expect(mon.dashboards).toBeDefined();
      expect(mon.alerting).toBeDefined();
    });
  });

  describe('generateNFRArtifacts()', () => {
    let artifacts: NFRArtifacts;

    beforeAll(() => {
      artifacts = provider.generateNFRArtifacts(TEST_CTX);
    });

    it('should return all 8 NFR artifacts', () => {
      for (const key of NFR_ARTIFACT_KEYS) {
        expect(artifacts[key]).toBeDefined();
      }
    });

    it.each(NFR_ARTIFACT_KEYS)('%s should be a non-empty string', (key) => {
      expect(typeof artifacts[key]).toBe('string');
      expect(artifacts[key].length).toBeGreaterThan(0);
    });

    it.each(NFR_ARTIFACT_KEYS)('%s should contain the project name', (key) => {
      expect(artifacts[key]).toContain(TEST_CTX.projectName);
    });

    it('monitoringConfig should reference Cloud Monitoring', () => {
      expect(artifacts.monitoringConfig).toContain('Cloud Monitoring');
    });

    it('alertingRules should reference Cloud Alerting', () => {
      expect(artifacts.alertingRules).toContain('Cloud Alerting');
    });

    it('scalingPolicy should reference GKE', () => {
      expect(artifacts.scalingPolicy).toContain('GKE');
    });

    it('runbook should reference gcloud', () => {
      expect(artifacts.runbook).toContain('gcloud');
    });

    it('disasterRecoveryPlan should reference GCP regions', () => {
      expect(artifacts.disasterRecoveryPlan).toContain('us-central1');
      expect(artifacts.disasterRecoveryPlan).toContain('us-east1');
    });

    it('costAnalysis should contain cost figures', () => {
      expect(artifacts.costAnalysis).toContain('$');
    });
  });
});

describe('AzureProvider', () => {
  let provider: CloudProviderAdapter;

  beforeAll(() => {
    provider = new AzureProvider();
  });

  describe('profile', () => {
    it('should have the correct name', () => {
      expect(provider.profile.name).toBe('Microsoft Azure');
    });

    it('should have provider set to AZURE', () => {
      expect(provider.profile.provider).toBe(CloudProvider.AZURE);
    });

    it('should have all service keys', () => {
      const services = provider.profile.services;
      expect(services.compute).toBeDefined();
      expect(services.containers).toBeDefined();
      expect(services.serverless).toBeDefined();
      expect(services.databases).toBeDefined();
      expect(services.messaging).toBeDefined();
      expect(services.storage).toBeDefined();
      expect(services.cdn).toBeDefined();
      expect(services.loadBalancer).toBeDefined();
      expect(services.dns).toBeDefined();
    });

    it('should have all monitoring keys', () => {
      const mon = provider.profile.monitoring;
      expect(mon.metrics).toBeDefined();
      expect(mon.logging).toBeDefined();
      expect(mon.tracing).toBeDefined();
      expect(mon.dashboards).toBeDefined();
      expect(mon.alerting).toBeDefined();
    });
  });

  describe('generateNFRArtifacts()', () => {
    let artifacts: NFRArtifacts;

    beforeAll(() => {
      artifacts = provider.generateNFRArtifacts(TEST_CTX);
    });

    it('should return all 8 NFR artifacts', () => {
      for (const key of NFR_ARTIFACT_KEYS) {
        expect(artifacts[key]).toBeDefined();
      }
    });

    it.each(NFR_ARTIFACT_KEYS)('%s should be a non-empty string', (key) => {
      expect(typeof artifacts[key]).toBe('string');
      expect(artifacts[key].length).toBeGreaterThan(0);
    });

    it.each(NFR_ARTIFACT_KEYS)('%s should contain the project name', (key) => {
      expect(artifacts[key]).toContain(TEST_CTX.projectName);
    });

    it('monitoringConfig should reference Application Insights', () => {
      expect(artifacts.monitoringConfig).toContain('Application Insights');
    });

    it('alertingRules should reference Azure Monitor', () => {
      expect(artifacts.alertingRules).toContain('Azure Monitor');
    });

    it('scalingPolicy should reference AKS', () => {
      expect(artifacts.scalingPolicy).toContain('AKS');
    });

    it('runbook should reference Azure CLI', () => {
      expect(artifacts.runbook).toContain('az ');
    });

    it('disasterRecoveryPlan should reference Azure regions', () => {
      expect(artifacts.disasterRecoveryPlan).toContain('East US');
      expect(artifacts.disasterRecoveryPlan).toContain('West US 2');
    });

    it('costAnalysis should contain cost figures', () => {
      expect(artifacts.costAnalysis).toContain('$');
    });

    it('slaDefinition should reference Application Insights as data source', () => {
      expect(artifacts.slaDefinition).toContain('Application Insights');
    });
  });
});
