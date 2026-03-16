import { CloudProvider } from '../types.js';
import { type CloudProviderAdapter, type NFRArtifacts, type NFRContext } from './providers.js';
import { AWSProvider } from './aws.js';
import { GCPProvider } from './gcp.js';
import { AzureProvider } from './azure.js';

const PROVIDERS: Record<string, () => CloudProviderAdapter> = {
  [CloudProvider.AWS]: () => new AWSProvider(),
  [CloudProvider.GCP]: () => new GCPProvider(),
  [CloudProvider.AZURE]: () => new AzureProvider(),
};

export function getCloudProvider(provider: CloudProvider): CloudProviderAdapter | null {
  const factory = PROVIDERS[provider];
  return factory ? factory() : null;
}

export function getAllProviders(): CloudProviderAdapter[] {
  return Object.values(PROVIDERS).map(factory => factory());
}

export function generateMultiCloudNFR(ctx: NFRContext): Record<string, NFRArtifacts> {
  const result: Record<string, NFRArtifacts> = {};
  for (const [name, factory] of Object.entries(PROVIDERS)) {
    result[name] = factory().generateNFRArtifacts(ctx);
  }
  return result;
}

export type { CloudProviderAdapter, NFRArtifacts, NFRContext } from './providers.js';
export { AWSProvider } from './aws.js';
export { GCPProvider } from './gcp.js';
export { AzureProvider } from './azure.js';
