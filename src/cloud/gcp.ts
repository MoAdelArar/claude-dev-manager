import { CloudProvider } from '../types';
import { CloudProviderAdapter, CloudProviderProfile, NFRArtifacts, NFRContext } from './providers';

const GCP_PROFILE: CloudProviderProfile = {
  name: 'Google Cloud Platform',
  provider: CloudProvider.GCP,
  services: {
    compute: ['Compute Engine', 'GKE', 'Cloud Run', 'App Engine'],
    containers: ['Artifact Registry', 'GKE', 'Cloud Run'],
    serverless: ['Cloud Functions', 'Cloud Run', 'Workflows'],
    databases: ['Cloud SQL', 'Cloud Spanner', 'Firestore', 'Memorystore'],
    messaging: ['Pub/Sub', 'Cloud Tasks', 'Eventarc'],
    storage: ['Cloud Storage', 'Filestore'],
    cdn: ['Cloud CDN'],
    loadBalancer: ['Cloud Load Balancing (HTTP(S), TCP, Internal)'],
    dns: ['Cloud DNS'],
  },
  monitoring: {
    metrics: 'Cloud Monitoring (Ops Agent)',
    logging: 'Cloud Logging',
    tracing: 'Cloud Trace',
    dashboards: 'Cloud Monitoring Dashboards',
    alerting: 'Cloud Alerting Policies + Notification Channels',
  },
  scaling: {
    horizontalPod: 'GKE Horizontal Pod Autoscaler / Cloud Run auto-scaling',
    verticalPod: 'GKE Vertical Pod Autoscaler',
    clusterAutoscaler: 'GKE Cluster Autoscaler / Node Auto-Provisioning',
    serverlessScaling: 'Cloud Run concurrency-based / Cloud Functions instance scaling',
    dbScaling: 'Cloud SQL read replicas / Spanner auto-scaling',
  },
  iac: ['Terraform', 'Google Cloud Deployment Manager', 'Pulumi'],
  regions: { primary: 'us-central1', dr: 'us-east1' },
  costTool: 'Google Cloud Billing + Cost Management + Recommender',
  secretsManager: 'Secret Manager',
  identityService: 'Cloud IAM + Identity Platform',
};

export class GCPProvider implements CloudProviderAdapter {
  readonly profile = GCP_PROFILE;

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
    return `# Monitoring Configuration — GCP
## Project: ${ctx.projectName}

### Cloud Monitoring Metrics
- **Custom Metrics Prefix:** \`custom.googleapis.com/${ctx.projectName}\`
- **Custom Metrics:**
  - \`request_count\` — Total API requests (kind: DELTA)
  - \`request_latency_ms\` — Request latency distribution (kind: DELTA, value: DISTRIBUTION)
  - \`error_rate\` — Error percentage (kind: GAUGE)
  - \`active_connections\` — Current connections (kind: GAUGE)
  - \`queue_depth\` — Pub/Sub unacked messages (kind: GAUGE)
  - \`cache_hit_rate\` — Memorystore hit ratio (kind: GAUGE)

### Cloud Logging
- **Log Sinks:**
  - \`${ctx.projectName}-app-logs\` → Cloud Storage (retention: 30 days hot, 1 year cold)
  - \`${ctx.projectName}-audit-logs\` → BigQuery (for analysis)
  - \`${ctx.projectName}-error-logs\` → Cloud Logging bucket (retention: 180 days)
- **Structured Logging:** JSON payloads via \`@google-cloud/logging\`
- **Log-Based Metrics:**
  - \`logging/user/${ctx.projectName}/error_count\`: \`severity >= ERROR\`
  - \`logging/user/${ctx.projectName}/slow_request\`: \`jsonPayload.duration > 1000\`

### Cloud Trace
- **Sampling Rate:** 1/20 requests (production), 1/1 (staging)
- **Trace context propagation:** W3C Trace Context header
- **Custom spans:** Database queries, external API calls, cache operations

### Cloud Monitoring Dashboards
- **Operations:** Request rate, latency heatmap, error rate, instance count
- **Infrastructure:** GKE node utilization, Cloud SQL metrics, Memorystore
- **Business:** Active users, API usage by endpoint, Pub/Sub throughput`;
  }

  private alertingRules(ctx: NFRContext): string {
    return `# Alerting Rules — GCP Cloud Alerting
## Project: ${ctx.projectName}

### Critical Alerts (PagerDuty)
| Policy Name | Metric | Condition | Duration | Channel |
|---|---|---|---|---|
| High Error Rate | error_rate | > 5% | 5 min | PagerDuty webhook |
| High Latency P99 | request_latency_ms (p99) | > 3000ms | 5 min | PagerDuty webhook |
| Service Unhealthy | uptime_check/check_passed | false | 1 min | PagerDuty webhook |
| Cloud SQL CPU | cloudsql.googleapis.com/database/cpu/utilization | > 0.9 | 5 min | PagerDuty webhook |
| Persistent Disk Full | compute.googleapis.com/instance/disk/write_bytes_count | < 10% free | 5 min | PagerDuty webhook |

### Warning Alerts (Slack)
| Policy Name | Metric | Condition | Duration | Channel |
|---|---|---|---|---|
| Elevated Latency | request_latency_ms (p99) | > 1500ms | 10 min | Slack webhook |
| Elevated Errors | error_rate | > 1% | 10 min | Slack webhook |
| High Memory | GKE container/memory/utilization | > 0.8 | 10 min | Slack webhook |
| High CPU | GKE container/cpu/utilization | > 0.75 | 10 min | Slack webhook |
| Pub/Sub Backlog | pubsub.googleapis.com/subscription/oldest_unacked_message_age | > 300s | 5 min | Slack webhook |
| Cache Evictions | Memorystore evicted_keys | > 100/min | 5 min | Slack webhook |

### Notification Channels
- \`${ctx.projectName}-critical\`: PagerDuty integration
- \`${ctx.projectName}-warnings\`: Slack #ops-alerts channel
- \`${ctx.projectName}-info\`: Email distribution list

### Escalation Policy
1. **P1:** PagerDuty on-call → 5 min → team lead → 15 min → engineering director
2. **P2:** Slack alert → 30 min → on-call engineer
3. **P3:** Dashboard review in daily standup`;
  }

  private scalingPolicy(ctx: NFRContext): string {
    return `# Scaling Policy — GCP
## Project: ${ctx.projectName}

### GKE Horizontal Pod Autoscaler
\`\`\`yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ${ctx.projectName}-hpa
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
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "1000"
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

### GKE Cluster Autoscaler
- Node Auto-Provisioning enabled
- Min nodes: 2, Max nodes: 10
- Machine type: e2-standard-4 (baseline), n2-standard-8 (burst)

### Cloud SQL Read Replicas
- Auto-scaling: 0-3 read replicas based on connection count
- Failover replica: always-on in different zone

### Memorystore Scaling
- Standard tier with automatic failover
- Memory: 5GB baseline, manually scale to 20GB for peak

### Capacity Planning
| Load Tier | Requests/sec | GKE Pods | Cloud SQL | Memorystore |
|---|---|---|---|---|
| Baseline | 100 | 2 | db-custom-2-8192 | 5GB |
| Normal | 500 | 4 | db-custom-2-8192 | 5GB |
| Peak | 2,000 | 10 | db-custom-4-16384 | 10GB |
| Burst | 5,000 | 20 | db-custom-8-32768 | 20GB |`;
  }

  private costAnalysis(ctx: NFRContext): string {
    return `# Cost Analysis — GCP
## Project: ${ctx.projectName}

### Monthly Cost Estimate (Normal Load)
| Service | Configuration | Monthly Est. |
|---|---|---|
| GKE (Autopilot) | 4 pods × 1 vCPU / 2GB | $130 |
| Cloud Load Balancing | 1 HTTP(S) LB + forwarding rules | $25 |
| Cloud SQL (PostgreSQL) | db-custom-2-8192, HA | $380 |
| Memorystore (Redis) | 5GB Standard tier | $175 |
| Cloud Storage | 100GB Standard + requests | $3 |
| Cloud CDN | 500GB egress | $40 |
| Cloud Monitoring | Custom metrics + logs | $35 |
| Secret Manager | 10 secrets + access | $1 |
| Cloud DNS | 1 zone + queries | $1 |
| Cloud NAT | 1 gateway + data processing | $40 |
| **Total** | | **~$830/mo** |

### Cost Optimization Recommendations
1. **Committed Use Discounts (CUD):** 1-year commitment for Compute (up to 37% savings)
2. **Sustained Use Discounts:** Automatic for GCE/GKE (up to 30%)
3. **Preemptible/Spot VMs:** For batch processing and non-critical workloads (60-91% savings)
4. **Cloud Storage Lifecycle:** Nearline after 30d, Coldline after 90d, Archive after 365d
5. **Recommender API:** Enable for right-sizing VMs, idle resources, and cost savings
6. **GKE Autopilot:** Pay only for pod resources, no node management overhead

### Budget Alerts
- Monthly budget: $1,200
- Alert thresholds: 50%, 80%, 100%, 120% (forecasted)
- Pub/Sub notification for programmatic response

### Labels
\`\`\`
project: ${ctx.projectName}
environment: production | staging | development
team: engineering
cost-center: <cost-center-id>
managed-by: cdm
\`\`\``;
  }

  private slaDefinition(ctx: NFRContext): string {
    return `# SLA / SLO / SLI Definitions — GCP
## Project: ${ctx.projectName}

### Service Level Indicators (SLIs)
| SLI | Measurement | Data Source |
|---|---|---|
| Availability | Successful requests / total requests | Cloud Load Balancing metrics |
| Latency (p50) | Median response time | Cloud Monitoring custom metric |
| Latency (p99) | 99th percentile response time | Cloud Monitoring custom metric |
| Error Rate | 5xx responses / total responses | Cloud Load Balancing metrics |
| Throughput | Requests per second | Cloud Monitoring |
| Data Freshness | Time since last successful sync | Custom metric |

### Service Level Objectives (SLOs)
| SLO | Target | Error Budget (30d) | Window |
|---|---|---|---|
| Availability | 99.9% | 43.2 min downtime | Rolling 30d |
| Latency p50 | < 200ms | N/A | Rolling 30d |
| Latency p99 | < 2000ms | N/A | Rolling 30d |
| Error Rate | < 0.1% | N/A | Rolling 30d |
| MTTD | < 5 min | N/A | Per incident |
| MTTR | < 30 min | N/A | Per incident |

### GCP SLO Monitoring Service
- SLO defined in Cloud Monitoring using the SLO API
- Error budget burn-rate alerts at 2x, 5x, 10x normal rate
- Monthly SLO compliance report auto-generated

### Dependency SLAs (GCP guarantees)
| Service | GCP SLA | Our Target |
|---|---|---|
| Cloud SQL HA | 99.95% | 99.9% |
| GKE Autopilot | 99.95% | 99.9% |
| Cloud Load Balancing | 99.99% | 99.9% |
| Cloud Storage | 99.95% | 99.9% |
| Cloud CDN | 99.95% | 99.9% |`;
  }

  private disasterRecoveryPlan(ctx: NFRContext): string {
    return `# Disaster Recovery Plan — GCP
## Project: ${ctx.projectName}

### Recovery Objectives
- **RPO:** 1 hour
- **RTO:** 30 minutes

### DR Strategy: Warm Standby
- **Primary Region:** ${this.profile.regions.primary}
- **DR Region:** ${this.profile.regions.dr}

### Architecture
\`\`\`
Primary (us-central1)            DR (us-east1)
┌─────────────────────┐          ┌─────────────────────┐
│ Cloud LB (Active)   │          │ Cloud LB (Standby)  │
│ GKE (Active)        │          │ GKE (Scaled to 0)   │
│ Cloud SQL Primary   │───────→  │ Cloud SQL Replica    │
│ Memorystore Primary │          │ Memorystore Standby  │
│ GCS (Multi-region)  │          │ GCS (Auto-replicated)│
└─────────────────────┘          └─────────────────────┘
\`\`\`

### Backup Strategy
| Resource | Method | Frequency | Retention |
|---|---|---|---|
| Cloud SQL | Automated backups + PITR | Continuous | 30 days |
| Cloud SQL | Cross-region replica | Real-time | Always on |
| Cloud Storage | Multi-regional bucket | Automatic | Same as source |
| GKE Config | Git + \`kubectl\` manifests | On deploy | Unlimited |
| Secrets | Multi-regional replication | On change | All versions |

### Failover Procedure
1. **Detection:** Uptime check failure for 3 consecutive minutes
2. **Decision:** Auto for DB; manual approval for region failover
3. **Promote DB:** Promote Cloud SQL replica to primary
4. **Scale GKE:** Set replica count to production baseline in DR region
5. **DNS:** Update Cloud DNS / Global LB to route to DR region
6. **Cache Warm:** Memorystore restores from latest snapshot
7. **Validate:** Run synthetic monitors against DR endpoint
8. **Notify:** Pub/Sub → Slack/PagerDuty with status

### DR Testing Schedule
- Tabletop: Quarterly | Partial failover: Semi-annually | Full DR: Annually`;
  }

  private performanceBenchmark(ctx: NFRContext): string {
    return `# Performance Benchmarks — GCP
## Project: ${ctx.projectName}

### Baseline Targets
| Endpoint | p50 | p99 | Throughput | Error Rate |
|---|---|---|---|---|
| Health check | < 10ms | < 50ms | N/A | 0% |
| Read (cached) | < 50ms | < 200ms | 2000 rps | < 0.01% |
| Read (DB) | < 100ms | < 500ms | 500 rps | < 0.05% |
| Write | < 200ms | < 1000ms | 200 rps | < 0.1% |
| Async/batch | < 5000ms | < 30s | 50 rps | < 0.5% |

### Load Testing
- **Tool:** k6 / Locust (run from GCE in same VPC)
- **Scenarios:** Smoke (5 VU, 1 min) → Load (100 VU, 15 min) → Stress (500 VU, 5 min) → Soak (50 VU, 2 hrs)
- **Schedule:** Smoke on every deploy, full suite weekly

### Resource Baselines (Normal Load)
| Resource | Metric | Expected | Alert |
|---|---|---|---|
| GKE Pods | CPU | 30-50% | 75% |
| GKE Pods | Memory | 40-60% | 80% |
| Cloud SQL | CPU | 20-40% | 80% |
| Cloud SQL | Connections | 20-50 | 80% max |
| Memorystore | Memory | 30-50% | 75% |
| Memorystore | Hit rate | > 90% | < 80% |`;
  }

  private runbook(ctx: NFRContext): string {
    return `# Operational Runbook — GCP
## Project: ${ctx.projectName}

### Severity Levels
| Level | Criteria | Response | Team |
|---|---|---|---|
| SEV1 | Service down / data loss | 5 min | On-call + lead + director |
| SEV2 | Degraded (>5% errors) | 15 min | On-call + lead |
| SEV3 | Minor degradation | 30 min | On-call |
| SEV4 | No user impact | Next business day | Assigned engineer |

### Common Procedures

#### High CPU on GKE Pods
1. Check: \`kubectl top pods -n ${ctx.projectName}\`
2. Review logs: \`kubectl logs -f deploy/${ctx.projectName} -n ${ctx.projectName}\`
3. If traffic spike: HPA should handle; verify HPA status
4. If code issue: \`kubectl rollout undo deploy/${ctx.projectName}\`
5. Escalate if unresolved in 15 min

#### Cloud SQL Connection Exhaustion
1. Check: Cloud SQL metrics in Monitoring console
2. Query active connections: \`SELECT * FROM pg_stat_activity\`
3. Restart problematic pods: \`kubectl rollout restart deploy/${ctx.projectName}\`
4. If persistent: increase max_connections or scale up instance
5. Check connection pooling config (PgBouncer / application pool)

#### Deployment Rollback
1. Identify bad release: \`kubectl rollout history deploy/${ctx.projectName}\`
2. Rollback: \`kubectl rollout undo deploy/${ctx.projectName}\`
3. Verify pods healthy: \`kubectl get pods -n ${ctx.projectName}\`
4. Check LB backend health: Cloud Console → Load Balancing → Backend health
5. Monitor error rate returns to baseline

### Access
- Console: SSO via Google Workspace
- CLI: \`gcloud auth login && gcloud config set project ${ctx.projectName}-prod\`
- Secrets: \`gcloud secrets versions access latest --secret=<name>\`
- Kubectl: \`gcloud container clusters get-credentials ${ctx.projectName}-cluster\``;
  }
}
