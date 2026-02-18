import { CloudProvider } from '../types';
import { CloudProviderAdapter, CloudProviderProfile, NFRArtifacts, NFRContext } from './providers';

const AZURE_PROFILE: CloudProviderProfile = {
  name: 'Microsoft Azure',
  provider: CloudProvider.AZURE,
  services: {
    compute: ['Virtual Machines', 'AKS', 'App Service', 'Container Apps'],
    containers: ['Container Registry', 'AKS', 'Container Apps', 'Container Instances'],
    serverless: ['Azure Functions', 'Logic Apps', 'Durable Functions'],
    databases: ['Azure SQL', 'Cosmos DB', 'Azure Cache for Redis', 'PostgreSQL Flexible Server'],
    messaging: ['Service Bus', 'Event Grid', 'Event Hubs', 'Queue Storage'],
    storage: ['Blob Storage', 'Azure Files', 'Managed Disks'],
    cdn: ['Azure CDN', 'Azure Front Door'],
    loadBalancer: ['Application Gateway', 'Azure Load Balancer', 'Azure Front Door'],
    dns: ['Azure DNS'],
  },
  monitoring: {
    metrics: 'Azure Monitor Metrics',
    logging: 'Azure Monitor Logs (Log Analytics)',
    tracing: 'Application Insights (Distributed Tracing)',
    dashboards: 'Azure Dashboards + Workbooks',
    alerting: 'Azure Monitor Alerts + Action Groups',
  },
  scaling: {
    horizontalPod: 'AKS Horizontal Pod Autoscaler / Container Apps auto-scaling',
    verticalPod: 'AKS Vertical Pod Autoscaler',
    clusterAutoscaler: 'AKS Cluster Autoscaler',
    serverlessScaling: 'Azure Functions Consumption Plan / Premium Plan pre-warmed',
    dbScaling: 'Azure SQL Elastic Pools / Cosmos DB auto-scale RU',
  },
  iac: ['Azure Bicep', 'ARM Templates', 'Terraform', 'Pulumi'],
  regions: { primary: 'eastus', dr: 'westus2' },
  costTool: 'Azure Cost Management + Advisor',
  secretsManager: 'Azure Key Vault',
  identityService: 'Microsoft Entra ID (Azure AD) + RBAC',
};

export class AzureProvider implements CloudProviderAdapter {
  readonly profile = AZURE_PROFILE;

  generateNFRArtifacts(ctx: NFRContext): NFRArtifacts {
    return {
      monitoringConfig: this.monitoringConfig(ctx),
      alertingRules: this.alertingRules(ctx),
      scalingPolicy: this.scalingPolicy(ctx),
      costAnalysis: this.costAnalysis(ctx),
      slaDefinition: this.slaDefinition(ctx),
      disasterRecoveryPlan: this.disasterRecoveryPlan(ctx),
      performanceBenchmark: this.performanceBenchmark(ctx),
      runbook: this.runbook(ctx),
    };
  }

  private monitoringConfig(ctx: NFRContext): string {
    return `# Monitoring Configuration — Azure
## Project: ${ctx.projectName}

### Application Insights
- **Instrumentation Key:** Configured via Key Vault
- **SDK:** \`@azure/monitor-opentelemetry\` (auto-instrumentation)
- **Custom Telemetry:**
  - \`RequestCount\` — Total API requests (customMetrics)
  - \`RequestDuration\` — Latency percentiles (customMetrics)
  - \`ErrorRate\` — Failed request percentage (customMetrics)
  - \`ActiveConnections\` — Current connections (customMetrics)
  - \`QueueDepth\` — Service Bus message count (customMetrics)
  - \`CacheHitRate\` — Redis cache hit ratio (customMetrics)

### Azure Monitor Logs (Log Analytics Workspace)
- **Workspace:** \`${ctx.projectName}-logs-workspace\`
- **Tables:**
  - \`AppTraces\` — Application logs (retention: 30 days)
  - \`AppRequests\` — HTTP request logs (retention: 90 days)
  - \`AppExceptions\` — Exception logs (retention: 180 days)
- **Diagnostic Settings:**
  - AKS control plane → Log Analytics
  - Azure SQL → Log Analytics
  - Key Vault access → Log Analytics
- **KQL Queries Saved:**
  - Error rate by endpoint: \`AppRequests | where ResultCode >= 500 | summarize count() by Name, bin(TimeGenerated, 5m)\`
  - Slow queries: \`AppDependencies | where DurationMs > 1000\`

### Distributed Tracing
- End-to-end transaction search via Application Insights
- W3C Trace Context propagation across services
- Dependency tracking: SQL, Redis, HTTP, Service Bus

### Azure Dashboards + Workbooks
- **Operations Dashboard:** Request metrics, dependencies, failures, live metrics stream
- **Infrastructure Dashboard:** AKS node metrics, SQL DTU, Redis memory
- **Business Dashboard:** User sessions, page views, custom events`;
  }

  private alertingRules(ctx: NFRContext): string {
    return `# Alerting Rules — Azure Monitor Alerts
## Project: ${ctx.projectName}

### Critical Alerts (PagerDuty via Action Group)
| Alert Rule | Signal | Condition | Frequency | Action Group |
|---|---|---|---|---|
| High Error Rate | requests/failed | > 5% of total | 5 min | ${ctx.projectName}-critical-ag |
| High Latency P99 | requests/duration (p99) | > 3000ms | 5 min | ${ctx.projectName}-critical-ag |
| Service Unhealthy | availabilityResults/availabilityPercentage | < 99% | 1 min | ${ctx.projectName}-critical-ag |
| SQL DTU High | sqlserver/dtu_consumption_percent | > 90% | 5 min | ${ctx.projectName}-critical-ag |
| Disk Space Low | host/disk/free | < 10% | 5 min | ${ctx.projectName}-critical-ag |

### Warning Alerts (Slack / Teams via Action Group)
| Alert Rule | Signal | Condition | Frequency | Action Group |
|---|---|---|---|---|
| Elevated Latency | requests/duration (p99) | > 1500ms | 10 min | ${ctx.projectName}-warning-ag |
| Elevated Errors | requests/failed | > 1% | 10 min | ${ctx.projectName}-warning-ag |
| AKS High Memory | node_memory_working_set_percentage | > 80% | 10 min | ${ctx.projectName}-warning-ag |
| AKS High CPU | node_cpu_usage_percentage | > 75% | 10 min | ${ctx.projectName}-warning-ag |
| Service Bus Backlog | activeMessages | > 1000 | 5 min | ${ctx.projectName}-warning-ag |
| Redis Evictions | evictedkeys | > 100/min | 5 min | ${ctx.projectName}-warning-ag |

### Action Groups
- \`${ctx.projectName}-critical-ag\`: PagerDuty webhook + SMS to on-call + email DL
- \`${ctx.projectName}-warning-ag\`: Slack/Teams webhook + email DL
- \`${ctx.projectName}-info-ag\`: Email only

### Escalation Policy
1. **P1:** PagerDuty on-call → 5 min → team lead → 15 min → engineering director
2. **P2:** Teams/Slack → 30 min → on-call
3. **P3:** Reviewed in daily standup`;
  }

  private scalingPolicy(ctx: NFRContext): string {
    return `# Scaling Policy — Azure
## Project: ${ctx.projectName}

### AKS Horizontal Pod Autoscaler
\`\`\`yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ${ctx.projectName}-hpa
  namespace: ${ctx.projectName}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ${ctx.projectName}
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 65
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 75
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 25
          periodSeconds: 120
\`\`\`

### AKS Cluster Autoscaler
- Node pool: Standard_D4s_v5 (baseline), Standard_D8s_v5 (burst)
- Min nodes: 2, Max nodes: 10
- Scale-down delay after add: 10 min

### Azure SQL Elastic Pool
- eDTU model with auto-scale: 100-400 eDTUs
- Serverless tier for dev/staging (auto-pause after 1 hour)

### Azure Cache for Redis
- Premium tier with clustering for production (6GB, 2 shards)
- Standard tier for staging (1GB)

### Capacity Planning
| Load Tier | Requests/sec | AKS Pods | Azure SQL | Redis |
|---|---|---|---|---|
| Baseline | 100 | 2 | S2 (50 DTU) | C1 (1GB) |
| Normal | 500 | 4 | S3 (100 DTU) | P1 (6GB) |
| Peak | 2,000 | 10 | P2 (250 DTU) | P2 (13GB) |
| Burst | 5,000 | 20 | P4 (500 DTU) | P3 (26GB) |

### Schedule-Based Scaling (Azure Autoscale)
- Business hours (8am-8pm ET): min 4 pods
- Off-hours: min 2 pods
- Pre-event scaling via scheduled KEDA rules`;
  }

  private costAnalysis(ctx: NFRContext): string {
    return `# Cost Analysis — Azure
## Project: ${ctx.projectName}

### Monthly Cost Estimate (Normal Load)
| Service | Configuration | Monthly Est. |
|---|---|---|
| AKS (Standard) | 4 pods on D4s_v5 (2 nodes) | $280 |
| Application Gateway | WAF v2 + capacity units | $200 |
| Azure SQL | S3 (100 DTU), geo-replication | $300 |
| Azure Cache for Redis | P1 Premium (6GB) | $340 |
| Blob Storage | 100GB LRS + transactions | $5 |
| Azure CDN (Front Door) | 500GB egress | $50 |
| Azure Monitor | Log Analytics + App Insights | $60 |
| Key Vault | 10 secrets + operations | $1 |
| Azure DNS | 1 zone + queries | $1 |
| NAT Gateway | 1 gateway + data | $40 |
| **Total** | | **~$1,277/mo** |

### Cost Optimization Recommendations
1. **Azure Reservations:** 1-year reserved instances for VMs (up to 40% savings)
2. **Azure Hybrid Benefit:** Bring existing Windows/SQL licenses (up to 85% savings)
3. **Spot VMs:** For batch/non-critical AKS node pools (up to 90% savings)
4. **Azure SQL Serverless:** For dev/staging (auto-pause, pay per second)
5. **Blob Lifecycle:** Cool after 30d, Archive after 90d
6. **Azure Advisor:** Review weekly for right-sizing and idle resource recommendations

### Azure Budgets
- Monthly budget: $1,800
- Alerts at 50%, 80%, 100%, and 120% (forecasted)
- Action group for automated response at 100%

### Resource Tags
\`\`\`
Project: ${ctx.projectName}
Environment: production | staging | development
Team: engineering
CostCenter: <cost-center-id>
ManagedBy: cdm
\`\`\``;
  }

  private slaDefinition(ctx: NFRContext): string {
    return `# SLA / SLO / SLI Definitions — Azure
## Project: ${ctx.projectName}

### Service Level Indicators (SLIs)
| SLI | Measurement | Data Source |
|---|---|---|
| Availability | Successful requests / total | Application Insights |
| Latency (p50) | Median response time | Application Insights |
| Latency (p99) | 99th percentile | Application Insights |
| Error Rate | 5xx / total responses | Application Insights |
| Throughput | Requests/sec | Application Insights |
| Data Freshness | Time since last sync | Custom metric |

### Service Level Objectives (SLOs)
| SLO | Target | Error Budget (30d) | Window |
|---|---|---|---|
| Availability | 99.9% | 43.2 min | Rolling 30d |
| Latency p50 | < 200ms | N/A | Rolling 30d |
| Latency p99 | < 2000ms | N/A | Rolling 30d |
| Error Rate | < 0.1% | N/A | Rolling 30d |
| MTTD | < 5 min | N/A | Per incident |
| MTTR | < 30 min | N/A | Per incident |

### Dependency SLAs (Azure guarantees)
| Service | Azure SLA | Our Target |
|---|---|---|
| Azure SQL (HA) | 99.995% | 99.9% |
| AKS | 99.95% | 99.9% |
| App Gateway | 99.95% | 99.9% |
| Blob Storage (LRS) | 99.9% | 99.9% |
| Front Door | 99.99% | 99.9% |`;
  }

  private disasterRecoveryPlan(ctx: NFRContext): string {
    return `# Disaster Recovery Plan — Azure
## Project: ${ctx.projectName}

### Recovery Objectives
- **RPO:** 1 hour
- **RTO:** 30 minutes

### DR Strategy: Warm Standby
- **Primary Region:** ${this.profile.regions.primary}
- **DR Region:** ${this.profile.regions.dr}

### Architecture
\`\`\`
Primary (East US)                DR (West US 2)
┌─────────────────────┐          ┌─────────────────────┐
│ Front Door (Active) │          │ Front Door (Standby) │
│ AKS (Active)        │          │ AKS (Scaled to 0)    │
│ Azure SQL Primary   │───────→  │ Azure SQL Geo-Replica │
│ Redis Primary       │          │ Redis (Geo-Repl.)     │
│ Blob (RA-GRS)       │───────→  │ Blob (Read replica)   │
└─────────────────────┘          └─────────────────────┘
\`\`\`

### Backup Strategy
| Resource | Method | Frequency | Retention |
|---|---|---|---|
| Azure SQL | Auto-backups + PITR | Continuous | 35 days |
| Azure SQL | Active Geo-Replication | Real-time | Always on |
| Blob Storage | RA-GRS (read-access geo-redundant) | Automatic | Same as source |
| AKS Config | GitOps (Flux/ArgoCD) | On deploy | Unlimited |
| Key Vault | Soft-delete + purge protection | On change | 90 days |

### Failover Procedure
1. **Detection:** Azure Front Door health probe fails for 3 min
2. **Automatic:** Front Door routes traffic to DR backend pool
3. **Database:** Azure SQL auto-failover group triggers (or manual promotion)
4. **Scale AKS:** Increase replica count in DR cluster
5. **Cache:** Redis geo-replication promotes secondary
6. **Validate:** Availability tests against DR endpoint
7. **Notify:** Action Group → Teams/PagerDuty with status

### Azure Site Recovery
- Configured for VM-based workloads if any
- Recovery plans with automated scripts
- Monthly test failover in non-production

### DR Testing
- Tabletop: Quarterly | Partial: Semi-annually | Full: Annually`;
  }

  private performanceBenchmark(ctx: NFRContext): string {
    return `# Performance Benchmarks — Azure
## Project: ${ctx.projectName}

### Baseline Targets
| Endpoint | p50 | p99 | Throughput | Error Rate |
|---|---|---|---|---|
| Health check | < 10ms | < 50ms | N/A | 0% |
| Read (cached) | < 50ms | < 200ms | 2000 rps | < 0.01% |
| Read (DB) | < 100ms | < 500ms | 500 rps | < 0.05% |
| Write | < 200ms | < 1000ms | 200 rps | < 0.1% |
| Async/batch | < 5s | < 30s | 50 rps | < 0.5% |

### Load Testing (Azure Load Testing)
- Integrated with Azure DevOps / GitHub Actions
- JMeter scripts stored in repo
- Scenarios: Smoke → Load → Stress → Soak
- Auto-fail pipeline if p99 > threshold

### Resource Baselines
| Resource | Metric | Expected | Alert |
|---|---|---|---|
| AKS Pods | CPU | 30-50% | 75% |
| AKS Pods | Memory | 40-60% | 80% |
| Azure SQL | DTU consumption | 20-40% | 80% |
| Azure SQL | Connection count | 20-50 | 80% max |
| Redis | Memory | 30-50% | 75% |
| Redis | Cache hit rate | > 90% | < 80% |`;
  }

  private runbook(ctx: NFRContext): string {
    return `# Operational Runbook — Azure
## Project: ${ctx.projectName}

### Severity Levels
| Level | Criteria | Response | Team |
|---|---|---|---|
| SEV1 | Service down / data loss | 5 min | On-call + lead + director |
| SEV2 | Degraded (>5% errors) | 15 min | On-call + lead |
| SEV3 | Minor degradation | 30 min | On-call |
| SEV4 | No user impact | Next business day | Assigned |

### Common Procedures

#### High CPU on AKS Pods
1. Check: \`kubectl top pods -n ${ctx.projectName}\`
2. Review: Application Insights Live Metrics for request patterns
3. If traffic: HPA handles; verify with \`kubectl get hpa\`
4. If code: \`kubectl rollout undo deploy/${ctx.projectName}\`
5. Escalate if unresolved in 15 min

#### Azure SQL Connection Exhaustion
1. Check DTU metrics in Azure Portal → SQL Database → Metrics
2. Query: \`SELECT * FROM sys.dm_exec_sessions WHERE database_id = DB_ID()\`
3. Restart pods: \`kubectl rollout restart deploy/${ctx.projectName}\`
4. Scale SQL tier if needed: Portal → SQL Database → Compute + Storage

#### Deployment Rollback
1. Check: \`kubectl rollout history deploy/${ctx.projectName}\`
2. Rollback: \`kubectl rollout undo deploy/${ctx.projectName}\`
3. Verify health: Application Gateway → Backend Health
4. Monitor error rate in Application Insights

#### Region Failover
1. Confirm primary unhealthy (Front Door health probes failing)
2. Front Door auto-routes to DR (if configured) or manual DNS update
3. Promote Azure SQL geo-replica: Portal → Failover Group → Failover
4. Scale AKS in DR region
5. Validate and notify stakeholders

### Access
- Portal: SSO via Microsoft Entra ID
- CLI: \`az login && az account set -s ${ctx.projectName}-production\`
- Secrets: \`az keyvault secret show --vault-name ${ctx.projectName}-kv --name <secret>\`
- Kubectl: \`az aks get-credentials -g ${ctx.projectName}-rg -n ${ctx.projectName}-aks\``;
  }
}
