import { CloudProvider } from '../types';

export interface CloudService {
  compute: string[];
  containers: string[];
  serverless: string[];
  databases: string[];
  messaging: string[];
  storage: string[];
  cdn: string[];
  loadBalancer: string[];
  dns: string[];
}

export interface MonitoringStack {
  metrics: string;
  logging: string;
  tracing: string;
  dashboards: string;
  alerting: string;
}

export interface ScalingCapabilities {
  horizontalPod: string;
  verticalPod: string;
  clusterAutoscaler: string;
  serverlessScaling: string;
  dbScaling: string;
}

export interface CloudProviderProfile {
  name: string;
  provider: CloudProvider;
  services: CloudService;
  monitoring: MonitoringStack;
  scaling: ScalingCapabilities;
  iac: string[];
  regions: { primary: string; dr: string };
  costTool: string;
  secretsManager: string;
  identityService: string;
}

export interface NFRArtifacts {
  monitoringConfig: string;
  alertingRules: string;
  scalingPolicy: string;
  costAnalysis: string;
  slaDefinition: string;
  disasterRecoveryPlan: string;
  performanceBenchmark: string;
  runbook: string;
}

export interface NFRContext {
  projectName: string;
  language: string;
  framework: string;
  deployTarget: string;
  featureDescription: string;
}

export interface CloudProviderAdapter {
  profile: CloudProviderProfile;
  generateNFRArtifacts(ctx: NFRContext): NFRArtifacts;
}
