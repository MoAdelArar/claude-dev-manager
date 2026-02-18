import { CloudProvider } from '../types';
import { CloudProviderAdapter, CloudProviderProfile, NFRArtifacts, NFRContext } from './providers';

const AWS_PROFILE: CloudProviderProfile = {
  name: 'Amazon Web Services',
  provider: CloudProvider.AWS,
  services: {
    compute: ['EC2', 'ECS', 'EKS', 'App Runner'],
    containers: ['ECR', 'ECS Fargate', 'EKS'],
    serverless: ['Lambda', 'API Gateway', 'Step Functions'],
    databases: ['RDS', 'DynamoDB', 'ElastiCache', 'Aurora'],
    messaging: ['SQS', 'SNS', 'EventBridge', 'Kinesis'],
    storage: ['S3', 'EFS', 'EBS'],
    cdn: ['CloudFront'],
    loadBalancer: ['ALB', 'NLB', 'Global Accelerator'],
    dns: ['Route 53'],
  },
  monitoring: {
    metrics: 'Amazon CloudWatch Metrics',
    logging: 'Amazon CloudWatch Logs',
    tracing: 'AWS X-Ray',
    dashboards: 'CloudWatch Dashboards',
    alerting: 'CloudWatch Alarms + SNS',
  },
  scaling: {
    horizontalPod: 'EKS Horizontal Pod Autoscaler / ECS Service Auto Scaling',
    verticalPod: 'EKS Vertical Pod Autoscaler',
    clusterAutoscaler: 'EKS Cluster Autoscaler / Karpenter',
    serverlessScaling: 'Lambda Provisioned Concurrency / Auto Scaling',
    dbScaling: 'Aurora Auto Scaling / DynamoDB Auto Scaling',
  },
  iac: ['AWS CloudFormation', 'AWS CDK', 'Terraform'],
  regions: { primary: 'us-east-1', dr: 'us-west-2' },
  costTool: 'AWS Cost Explorer + Budgets + Trusted Advisor',
  secretsManager: 'AWS Secrets Manager / SSM Parameter Store',
  identityService: 'AWS IAM + Cognito',
};

export class AWSProvider implements CloudProviderAdapter {
  readonly profile = AWS_PROFILE;

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
    return `# Monitoring Configuration — AWS
## Project: ${ctx.projectName}

### CloudWatch Metrics
- **Namespace:** \`${ctx.projectName}/Application\`
- **Custom Metrics:**
  - \`RequestCount\` — Total API requests (Unit: Count)
  - \`RequestLatencyP50\` — Median latency (Unit: Milliseconds)
  - \`RequestLatencyP99\` — 99th percentile latency (Unit: Milliseconds)
  - \`ErrorRate\` — 4xx + 5xx / total requests (Unit: Percent)
  - \`ActiveConnections\` — Current active connections (Unit: Count)
  - \`QueueDepth\` — SQS queue message count (Unit: Count)
  - \`CacheHitRate\` — ElastiCache hit ratio (Unit: Percent)

### CloudWatch Logs
- **Log Groups:**
  - \`/ecs/${ctx.projectName}/application\` — Application logs (retention: 30 days)
  - \`/ecs/${ctx.projectName}/access\` — Access logs (retention: 90 days)
  - \`/ecs/${ctx.projectName}/error\` — Error logs (retention: 180 days)
- **Log Format:** JSON structured logging
- **Metric Filters:**
  - \`ErrorCount\`: filter pattern \`{ $.level = "error" }\`
  - \`FatalCount\`: filter pattern \`{ $.level = "fatal" }\`
  - \`SlowQuery\`: filter pattern \`{ $.duration > 1000 }\`

### AWS X-Ray Tracing
- **Sampling Rule:** 5% of requests in production, 100% in staging
- **Service Map:** Auto-generated from instrumented services
- **Trace Groups:** By API endpoint, by error status
- **Annotations:** userId, requestId, featureFlag

### CloudWatch Dashboards
- **Operations Dashboard:**
  - Request rate, latency percentiles, error rates
  - CPU/Memory utilization per service
  - ALB target health, response codes
- **Business Dashboard:**
  - Active users, feature usage, conversion funnels
- **Infrastructure Dashboard:**
  - ECS task counts, RDS connections, ElastiCache memory
  - S3 bucket sizes, Lambda invocations and duration`;
  }

  private alertingRules(ctx: NFRContext): string {
    return `# Alerting Rules — AWS CloudWatch Alarms
## Project: ${ctx.projectName}

### Critical Alerts (PagerDuty / On-call)
| Alarm Name | Metric | Threshold | Period | Action |
|---|---|---|---|---|
| HighErrorRate | ErrorRate | > 5% | 5 min | SNS → PagerDuty |
| HighLatencyP99 | RequestLatencyP99 | > 3000ms | 5 min | SNS → PagerDuty |
| ServiceDown | HealthyHostCount | < 1 | 1 min | SNS → PagerDuty |
| DatabaseCPU | RDS CPUUtilization | > 90% | 5 min | SNS → PagerDuty |
| DiskSpaceLow | EBS VolumeWriteBytes | < 10% free | 5 min | SNS → PagerDuty |

### Warning Alerts (Slack / Email)
| Alarm Name | Metric | Threshold | Period | Action |
|---|---|---|---|---|
| ElevatedLatency | RequestLatencyP99 | > 1500ms | 10 min | SNS → Slack |
| ElevatedErrors | ErrorRate | > 1% | 10 min | SNS → Slack |
| HighMemory | ECS MemoryUtilization | > 80% | 10 min | SNS → Slack |
| HighCPU | ECS CPUUtilization | > 75% | 10 min | SNS → Slack |
| QueueBacklog | SQS ApproximateAgeOfOldestMessage | > 300s | 5 min | SNS → Slack |
| CacheEvictions | ElastiCache Evictions | > 100/min | 5 min | SNS → Slack |

### Info Alerts (Dashboard only)
| Alarm Name | Metric | Threshold | Period |
|---|---|---|---|
| DeploymentStarted | Custom/DeployCount | > 0 | 1 min |
| ScaleOutEvent | ECS RunningTaskCount | change > 2 | 5 min |
| CostAnomaly | CE AnomalyDetection | anomaly detected | 24 hr |

### Escalation Policy
1. **P1 (Critical):** Alert on-call → 5 min ack → escalate to lead → 15 min → escalate to VP Eng
2. **P2 (Warning):** Alert Slack channel → 30 min ack → escalate to on-call
3. **P3 (Info):** Dashboard notification, reviewed in daily standup

### SNS Topic Configuration
- \`${ctx.projectName}-critical-alerts\` → PagerDuty HTTPS endpoint
- \`${ctx.projectName}-warning-alerts\` → Slack webhook + email DL
- \`${ctx.projectName}-info-alerts\` → CloudWatch Dashboard`;
  }

  private scalingPolicy(ctx: NFRContext): string {
    return `# Scaling Policy — AWS Auto Scaling
## Project: ${ctx.projectName}

### ECS Service Auto Scaling
\`\`\`yaml
Service: ${ctx.projectName}-service
MinCapacity: 2
MaxCapacity: 20
TargetTrackingPolicies:
  - MetricType: ECSServiceAverageCPUUtilization
    TargetValue: 65
    ScaleOutCooldown: 120
    ScaleInCooldown: 300
  - MetricType: ECSServiceAverageMemoryUtilization
    TargetValue: 75
    ScaleOutCooldown: 120
    ScaleInCooldown: 300
  - MetricType: ALBRequestCountPerTarget
    TargetValue: 1000
    ScaleOutCooldown: 60
    ScaleInCooldown: 300
StepScaling:
  - AdjustmentType: PercentChangeInCapacity
    StepAdjustments:
      - MetricIntervalLowerBound: 0
        MetricIntervalUpperBound: 20
        ScalingAdjustment: 25
      - MetricIntervalLowerBound: 20
        ScalingAdjustment: 50
\`\`\`

### Aurora Auto Scaling (Read Replicas)
- Min replicas: 1, Max replicas: 5
- Target CPU utilization: 70%
- Scale-out cooldown: 300s, Scale-in cooldown: 600s

### ElastiCache Scaling
- Cluster mode enabled with 2-6 shards
- Replica auto scaling: 1-3 replicas per shard

### Lambda Concurrency
- Reserved concurrency: 100
- Provisioned concurrency: 20 (warm starts for critical paths)

### Capacity Planning
| Load Tier | Requests/sec | ECS Tasks | RDS Instance | Cache Nodes |
|---|---|---|---|---|
| Baseline | 100 | 2 | db.r6g.large | cache.r6g.large x2 |
| Normal | 500 | 4 | db.r6g.large | cache.r6g.large x2 |
| Peak | 2,000 | 10 | db.r6g.xlarge | cache.r6g.xlarge x3 |
| Burst | 5,000 | 20 | db.r6g.2xlarge | cache.r6g.xlarge x6 |

### Schedule-Based Scaling
- Weekday business hours (8am-8pm ET): min 4 tasks
- Weekday off-hours: min 2 tasks
- Weekends: min 2 tasks
- Known traffic events: pre-scale to Peak tier 1 hour before`;
  }

  private costAnalysis(ctx: NFRContext): string {
    return `# Cost Analysis — AWS
## Project: ${ctx.projectName}

### Monthly Cost Estimate (Normal Load)
| Service | Configuration | Monthly Est. |
|---|---|---|
| ECS Fargate | 4 tasks × 1 vCPU / 2GB | $140 |
| ALB | 1 ALB + LCU charges | $25 |
| RDS Aurora | db.r6g.large, Multi-AZ | $450 |
| ElastiCache | cache.r6g.large × 2 nodes | $280 |
| S3 | 100GB storage + requests | $5 |
| CloudFront | 500GB transfer | $50 |
| CloudWatch | Metrics, logs, alarms | $40 |
| Secrets Manager | 10 secrets | $5 |
| Route 53 | 1 hosted zone + queries | $5 |
| VPC / NAT Gateway | 1 NAT GW + transfer | $45 |
| **Total** | | **~$1,045/mo** |

### Cost Optimization Recommendations
1. **Compute Savings Plans:** Commit to 1-year Savings Plan for 30-40% savings on Fargate
2. **Reserved Instances:** RI for RDS and ElastiCache (up to 40% savings)
3. **S3 Lifecycle Policies:** Transition logs to S3 Glacier after 90 days
4. **Right-sizing:** Review CloudWatch metrics monthly for over-provisioned resources
5. **Spot Instances:** Use Fargate Spot for non-critical batch workloads (up to 70% savings)
6. **NAT Gateway:** Consider VPC endpoints for S3/DynamoDB to reduce NAT costs

### AWS Budgets Configuration
- Monthly budget: $1,500 (with 80% and 100% alerts)
- Forecasted spend alert at $1,200
- Per-service budgets for top 3 services
- Cost Anomaly Detection enabled with SNS alert

### Tagging Strategy
\`\`\`
Project: ${ctx.projectName}
Environment: production | staging | development
Team: engineering
CostCenter: <cost-center-id>
ManagedBy: cdm
\`\`\``;
  }

  private slaDefinition(ctx: NFRContext): string {
    return `# SLA / SLO / SLI Definitions — AWS
## Project: ${ctx.projectName}

### Service Level Indicators (SLIs)
| SLI | Measurement | Data Source |
|---|---|---|
| Availability | Successful requests / total requests | ALB metrics |
| Latency (p50) | Median response time | CloudWatch custom metric |
| Latency (p99) | 99th percentile response time | CloudWatch custom metric |
| Error Rate | 5xx responses / total responses | ALB metrics |
| Throughput | Requests per second | ALB metrics |
| Data Freshness | Time since last data sync | Custom CloudWatch metric |

### Service Level Objectives (SLOs)
| SLO | Target | Error Budget (30d) | Measurement Window |
|---|---|---|---|
| Availability | 99.9% | 43.2 minutes downtime | Rolling 30 days |
| Latency p50 | < 200ms | N/A | Rolling 30 days |
| Latency p99 | < 2000ms | N/A | Rolling 30 days |
| Error Rate | < 0.1% | N/A | Rolling 30 days |
| Deployment Success | 99% | 1 failed deploy/month | Rolling 30 days |
| Mean Time to Detect (MTTD) | < 5 min | N/A | Per incident |
| Mean Time to Recover (MTTR) | < 30 min | N/A | Per incident |

### Error Budget Policy
- **> 50% budget remaining:** Normal release velocity
- **25-50% remaining:** Reduce deployments to 1/day, require additional review
- **< 25% remaining:** Freeze feature releases, focus on reliability
- **Exhausted:** Full freeze, all hands on reliability until budget recovers

### Dependency SLAs
| Dependency | Provider SLA | Our Target |
|---|---|---|
| RDS Aurora Multi-AZ | 99.99% | 99.95% |
| ECS Fargate | 99.99% | 99.9% |
| ALB | 99.99% | 99.9% |
| S3 | 99.99% | 99.9% |
| CloudFront | 99.9% | 99.9% |`;
  }

  private disasterRecoveryPlan(ctx: NFRContext): string {
    return `# Disaster Recovery Plan — AWS
## Project: ${ctx.projectName}

### Recovery Objectives
- **RPO (Recovery Point Objective):** 1 hour (last backup within 1h of failure)
- **RTO (Recovery Time Objective):** 30 minutes (service restored within 30min)

### DR Strategy: Warm Standby (Active-Passive)
- **Primary Region:** ${this.profile.regions.primary}
- **DR Region:** ${this.profile.regions.dr}

### Architecture
\`\`\`
Primary (us-east-1)              DR (us-west-2)
┌─────────────────────┐          ┌─────────────────────┐
│ Route 53 (Active)   │          │ Route 53 (Standby)  │
│ ALB + ECS (Active)  │          │ ALB + ECS (Scaled 0)│
│ Aurora Primary      │───────→  │ Aurora Read Replica  │
│ ElastiCache Primary │          │ ElastiCache Standby  │
│ S3 (CRR enabled)    │───────→  │ S3 (Replica)         │
└─────────────────────┘          └─────────────────────┘
\`\`\`

### Backup Strategy
| Resource | Backup Method | Frequency | Retention |
|---|---|---|---|
| Aurora DB | Automated snapshots | Continuous (PITR) | 35 days |
| Aurora DB | Cross-region replica | Real-time | Always on |
| S3 Buckets | Cross-Region Replication | Real-time | Same as source |
| ECS Task Definitions | Stored in CloudFormation/CDK | On deploy | All versions |
| Secrets | Cross-region replication | On change | All versions |
| Configuration | Git repository + S3 backup | On change | Unlimited |

### Failover Procedure
1. **Detection:** CloudWatch alarm triggers (HealthyHostCount = 0 for 3 min)
2. **Decision:** Auto-failover for DB; manual approval for full region failover
3. **DNS Failover:** Route 53 health check triggers DNS cutover (TTL: 60s)
4. **Scale DR region:** ECS desired count from 0 to production baseline
5. **Promote DB:** Promote Aurora read replica to primary in DR region
6. **Warm cache:** ElastiCache pre-populated from snapshot or lazy-loaded
7. **Validate:** Synthetic health checks confirm DR region is serving traffic
8. **Notify:** SNS → Slack/PagerDuty with failover status

### Failback Procedure
1. Restore primary region infrastructure
2. Re-establish Aurora replication (primary → DR becomes DR → primary)
3. Validate data consistency
4. DNS cutback to primary during maintenance window
5. Scale down DR region

### DR Testing Schedule
- **Tabletop exercise:** Quarterly
- **Partial failover test:** Semi-annually (DB failover only)
- **Full DR test:** Annually (complete region failover)`;
  }

  private performanceBenchmark(ctx: NFRContext): string {
    return `# Performance Benchmarks — AWS
## Project: ${ctx.projectName}

### Baseline Performance Targets
| Endpoint Type | p50 Latency | p99 Latency | Throughput | Error Rate |
|---|---|---|---|---|
| Health check | < 10ms | < 50ms | N/A | 0% |
| Read (cached) | < 50ms | < 200ms | 2000 rps | < 0.01% |
| Read (DB) | < 100ms | < 500ms | 500 rps | < 0.05% |
| Write | < 200ms | < 1000ms | 200 rps | < 0.1% |
| Batch/async | < 5000ms | < 30000ms | 50 rps | < 0.5% |

### Load Test Configuration
- **Tool:** k6 / Artillery (run from EC2 in same VPC)
- **Scenarios:**
  - Smoke test: 5 VUs for 1 min (validates setup)
  - Load test: ramp to 100 VUs over 5 min, hold 10 min
  - Stress test: ramp to 500 VUs over 10 min, hold 5 min
  - Spike test: 10 VUs → 300 VUs instantly, hold 2 min
  - Soak test: 50 VUs for 2 hours (detects memory leaks)

### Resource Baseline (Normal Load)
| Resource | Metric | Expected | Alert Threshold |
|---|---|---|---|
| ECS Tasks | CPU utilization | 30-50% | 75% |
| ECS Tasks | Memory utilization | 40-60% | 80% |
| RDS Aurora | CPU utilization | 20-40% | 80% |
| RDS Aurora | Connection count | 20-50 | 80% of max |
| ElastiCache | Memory utilization | 30-50% | 75% |
| ElastiCache | Cache hit rate | > 90% | < 80% |
| ALB | Active connections | 100-500 | 5000 |

### Performance Test Schedule
- **Every deploy:** Smoke test in staging
- **Weekly:** Full load test in staging
- **Monthly:** Stress + spike test in staging
- **Quarterly:** Soak test in production-mirror`;
  }

  private runbook(ctx: NFRContext): string {
    return `# Operational Runbook — AWS
## Project: ${ctx.projectName}

### Incident Response
**Severity Levels:**
| Level | Criteria | Response Time | Team |
|---|---|---|---|
| SEV1 | Service down or data loss | 5 min | On-call + lead + VP |
| SEV2 | Degraded performance (>5% errors) | 15 min | On-call + lead |
| SEV3 | Non-critical degradation | 30 min | On-call |
| SEV4 | Minor issue, no user impact | Next business day | Assigned engineer |

### Common Runbook Procedures

#### High CPU on ECS Tasks
1. Check CloudWatch CPU metric and identify affected tasks
2. Review application logs: \`aws logs filter-log-events --log-group /ecs/${ctx.projectName}/application\`
3. Check for recent deployments: \`aws ecs describe-services --cluster ${ctx.projectName}\`
4. If caused by traffic: auto-scaling should handle; verify scaling policy is active
5. If caused by code: rollback to previous task definition revision
6. Escalate if not resolved in 15 min

#### Database Connection Exhaustion
1. Check RDS connections: \`aws cloudwatch get-metric-statistics --namespace AWS/RDS --metric DatabaseConnections\`
2. Identify top consumers from pg_stat_activity or Performance Insights
3. Restart misbehaving ECS tasks: \`aws ecs update-service --force-new-deployment\`
4. If persistent: increase max connections or scale up RDS instance
5. Check for connection pool misconfiguration in application

#### Memory Leak Detection
1. Monitor ECS MemoryUtilization trending upward over hours
2. Enable container-level memory metrics
3. Capture heap dump if JVM: use ECS Exec to connect to container
4. For Node.js: check for unreleased event listeners, growing caches
5. Immediate fix: rolling restart of ECS tasks
6. Root cause: profile in staging with soak test

#### Deployment Rollback
1. Identify the bad deployment: \`aws ecs describe-services\` for latest task definition
2. Rollback: \`aws ecs update-service --task-definition <previous-revision>\`
3. Wait for new tasks to reach RUNNING state
4. Verify health checks pass on ALB target group
5. Monitor error rate returns to baseline
6. Post-incident: tag the bad release and document root cause

#### Region Failover
1. Confirm primary region is unhealthy (multiple CloudWatch alarms)
2. Get approval from incident commander
3. Promote Aurora replica in DR region
4. Scale up ECS tasks in DR region
5. Update Route 53 to point to DR region ALB
6. Verify traffic is flowing to DR region
7. Communicate status to stakeholders

### Access & Credentials
- AWS Console: SSO via \`${ctx.projectName}-production\` account
- CLI: \`aws sso login --profile ${ctx.projectName}-prod\`
- Secrets: AWS Secrets Manager — never stored locally
- Logs: CloudWatch Log Insights queries documented in wiki`;
  }
}
