# Deployment Plan

## Feature: {{FEATURE_NAME}}
**Date:** {{DATE}}
**Author:** DevOps Engineer Agent
**Status:** Draft

---

## 1. Pre-Deployment Checklist

- [ ] All tests passing in CI
- [ ] Security scan clean
- [ ] Code review approved
- [ ] Database migrations tested
- [ ] Feature flags configured
- [ ] Monitoring dashboards updated
- [ ] Rollback procedure verified
- [ ] Stakeholders notified
- [ ] Maintenance window scheduled (if needed)

## 2. Deployment Strategy

**Strategy:** Blue-Green / Canary / Rolling
**Target Environment:** {{ENVIRONMENT}}
**Expected Downtime:** Zero

## 3. Deployment Steps

### Step 1: Prepare
- Verify all prerequisites
- Create deployment branch/tag
- Build and push container image

### Step 2: Database Migration
- Run migrations against staging first
- Verify data integrity
- Apply to production with expand-contract pattern

### Step 3: Deploy
- Deploy to inactive environment
- Run smoke tests
- Verify health checks

### Step 4: Switch Traffic
- Gradually shift traffic (10% → 50% → 100%)
- Monitor error rates at each step
- Confirm all metrics within SLA

### Step 5: Verify
- Run post-deployment tests
- Verify business metrics
- Confirm monitoring alerts are active

## 4. Rollback Procedure

### Automated Triggers
- Error rate > 5% for 2 minutes
- Health check failures > 50%
- P95 latency > 3x baseline

### Manual Rollback Steps
1. Identify issue and confirm rollback
2. Switch traffic back to previous version
3. Verify previous version is serving correctly
4. Investigate root cause

## 5. Monitoring

### Key Metrics
- Request rate, error rate, duration
- CPU, memory, disk utilization
- Business metrics: {{METRICS}}

### Alert Configuration
- P1 (Page): Service down, error rate > 5%
- P2 (Slack): Error rate > 1%, latency spike
- P3 (Email): Deployment complete, minor anomalies

## 6. Post-Deployment

- [ ] Verify all health checks passing
- [ ] Confirm metrics within normal range
- [ ] Update documentation
- [ ] Notify stakeholders of completion
- [ ] Schedule retrospective if issues occurred
