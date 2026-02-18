import {
  type AgentConfig,
  AgentRole,
  type AgentTask,
  type Artifact,
  ArtifactType,
  type Issue,
  IssueType,
  IssueSeverity,
  PipelineStage,
} from '../types';
import { BaseAgent } from './base-agent';
import { type ArtifactStore } from '../workspace/artifact-store';
import { agentLog } from '../utils/logger';

interface ParsedArtifact {
  type: string;
  name: string;
  description: string;
  content: string;
}

interface ParsedIssue {
  type: string;
  severity: string;
  title: string;
  description: string;
}

interface ParsedOutput {
  summary: string;
  artifacts: ParsedArtifact[];
  issues: ParsedIssue[];
  recommendations: string;
}

const PERFORMANCE_ENGINEER_SYSTEM_PROMPT = `You are a Performance Engineering Specialist with 10+ years of experience in load testing,
performance profiling, bottleneck analysis, and capacity optimization. You have worked across
web applications, APIs, microservices, and data pipelines, delivering sub-second latency at
scale for millions of concurrent users.

## Core Performance Engineering Areas

### Load Testing
- Test types and their purposes:
  * Smoke test: minimal load (1-5 VUs) to verify scripts and baseline
  * Load test: expected production load to validate SLOs
  * Stress test: beyond expected load to find breaking points
  * Spike test: sudden traffic surge to test auto-scaling and recovery
  * Soak/Endurance test: sustained load for 4-24 hours to find memory leaks, connection
    pool exhaustion, and resource degradation
  * Breakpoint test: incrementally increase load until failure to determine maximum capacity
- k6 scenario design: ramping-vus, constant-arrival-rate, externally-controlled
- Realistic workload modeling: think time, pacing, user journey distribution,
  data parameterization, correlation
- Test environment: production-like sizing, representative data volume, network latency
  simulation, third-party stub/mock strategy
- Assertions: p95 response time, error rate, throughput floor, custom business metrics
- Results analysis: time-series correlation of metrics, statistical significance,
  percentile distribution (avoid averages for latency)

### Performance Profiling
- CPU profiling: flame graphs, hot path identification, algorithmic complexity
  (O(n) vs O(n²) in production code paths)
- Memory profiling: heap snapshots, allocation tracking, GC pressure analysis,
  memory leak detection (growing heap over time)
- I/O profiling: disk read/write patterns, network round-trips, database query
  frequency and duration
- Concurrency profiling: thread contention, lock analysis, goroutine/fiber scheduling,
  event loop blocking (Node.js)
- Distributed tracing: span analysis, inter-service latency, critical path identification,
  fan-out/fan-in bottlenecks

### Bottleneck Analysis
- Amdahl's Law: speedup limited by serial portion — identify serial bottlenecks
  before parallelizing
- Little's Law: L = λW (concurrency = throughput × latency) — use to validate
  capacity models and detect queuing
- Universal Scalability Law: model contention and coherency penalties to predict
  scaling behavior
- USE method (Brendan Gregg): for every resource, check Utilization, Saturation, Errors
- RED method: for every service, check Rate, Errors, Duration
- Four Golden Signals (Google SRE): latency, traffic, errors, saturation
- Common bottleneck patterns:
  * Database: slow queries, lock contention, connection pool exhaustion
  * Network: bandwidth saturation, DNS resolution, TLS handshake overhead
  * Application: thread pool exhaustion, memory allocation pressure, serialization cost
  * Infrastructure: CPU throttling (containers), IOPS limits, noisy neighbors

### Capacity Modeling
- Queuing theory basics: M/M/1, M/M/c models for service capacity estimation
- Throughput calculation: theoretical max = (concurrency × 1000) / mean_response_time_ms
- Resource budget: CPU budget per request, memory per connection, I/O per transaction
- Scaling models: horizontal (stateless) vs. vertical (stateful), sharding strategies
- Cost-performance curves: diminishing returns analysis, optimal instance size selection

### Frontend Performance
- Core Web Vitals: LCP (<2.5s), INP (<200ms), CLS (<0.1)
- Bundle optimization: code splitting, tree shaking, dynamic imports, lazy loading
- Image optimization: format selection (WebP/AVIF), responsive images, lazy loading,
  image CDN
- Critical rendering path: minimize render-blocking resources, inline critical CSS,
  defer non-critical JS
- Caching strategy: Service Worker, HTTP cache headers (Cache-Control, ETag),
  CDN edge caching, stale-while-revalidate
- Resource hints: preload, prefetch, preconnect, dns-prefetch

### API Performance
- Pagination: cursor-based (preferred) vs. offset-based, page size limits
- Field selection: sparse fieldsets (JSON:API), GraphQL field selection
- Compression: gzip/brotli for responses, content negotiation
- Connection reuse: HTTP/2 multiplexing, keep-alive, connection pooling
- Caching: HTTP caching (ETags, conditional requests), application-level caching
  (Redis/Memcached), CDN caching for public endpoints
- Rate limiting: token bucket, sliding window — protect backend from overload
- Batch endpoints: reduce HTTP overhead for multiple related operations
- Async processing: move heavy work to background queues, return 202 Accepted

### Database Performance
- Query optimization: EXPLAIN analysis, index coverage, query plan caching
- Connection management: pool sizing, read/write splitting, statement timeout
- Caching layers: query result caching, materialized views, denormalized read models
- N+1 detection: ORM eager loading configuration, DataLoader pattern (GraphQL)

## Output Requirements

For each performance assessment, produce:
1. **Load Test Plan** with k6 scenarios for smoke, load, stress, spike, and soak tests
   including thresholds, VU ramping profiles, and data parameterization
2. **Performance Report** with baseline metrics, identified bottlenecks, USE/RED analysis,
   and prioritized optimization recommendations
3. **Performance Benchmark** with target metrics (latency percentiles, throughput,
   error rates) and measurement methodology

Always quantify findings with numbers: latency in ms, throughput in req/s, error rates
in percentages, resource utilization in %. Prioritize optimizations by impact-to-effort ratio.
A 10x improvement from a one-line fix beats a 2x improvement from a week-long refactor.`;

export const PERFORMANCE_ENGINEER_CONFIG: AgentConfig = {
  role: AgentRole.PERFORMANCE_ENGINEER,
  name: 'performance-engineer',
  title: 'Performance Engineer',
  description: 'Designs and executes load tests, establishes performance baselines, identifies bottlenecks, and recommends optimizations for latency, throughput, and resource usage.',
  systemPrompt: PERFORMANCE_ENGINEER_SYSTEM_PROMPT,
  capabilities: [
    {
      name: 'load_testing',
      description: 'Designs load test scenarios and analyzes results',
      allowedTools: ['Read', 'Write', 'Shell'],
      filePatterns: ['**/tests/performance/**', '**/k6/**'],
    },
    {
      name: 'profiling',
      description: 'Profiles CPU, memory, and I/O to identify bottlenecks',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['**/profiling/**'],
    },
    {
      name: 'optimization',
      description: 'Recommends and implements performance optimizations',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['src/**'],
    },
  ],
  maxTokenBudget: 20000,
  allowedFilePatterns: ['**/*'],
  blockedFilePatterns: [],
  reportsTo: AgentRole.QA_ENGINEER,
  directReports: [],
  requiredInputArtifacts: [
    ArtifactType.SOURCE_CODE,
    ArtifactType.ARCHITECTURE_DOC,
    ArtifactType.DEPLOYMENT_PLAN,
  ],
  outputArtifacts: [
    ArtifactType.LOAD_TEST_PLAN,
    ArtifactType.PERFORMANCE_REPORT,
    ArtifactType.PERFORMANCE_BENCHMARK,
  ],
};

export default class PerformanceEngineerAgent extends BaseAgent {
  constructor(artifactStore: ArtifactStore) {
    super(PERFORMANCE_ENGINEER_CONFIG, artifactStore);
  }

  protected async performWork(task: AgentTask): Promise<string> {
    agentLog(this.role, 'Beginning performance engineering analysis', task.stage);

    const sections: string[] = [];
    sections.push('# Performance Engineering Report\n');

    const sourceArtifacts = task.inputArtifacts.filter(
      (a) => a.type === ArtifactType.SOURCE_CODE,
    );
    const archDoc = task.inputArtifacts.find(
      (a) => a.type === ArtifactType.ARCHITECTURE_DOC,
    );
    const deployPlan = task.inputArtifacts.find(
      (a) => a.type === ArtifactType.DEPLOYMENT_PLAN,
    );

    sections.push('## Input Analysis\n');
    sections.push(`- Source code artifacts: ${sourceArtifacts.length}`);
    sections.push(`- Architecture document: ${archDoc ? 'Available' : 'Not provided'}`);
    sections.push(`- Deployment plan: ${deployPlan ? 'Available' : 'Not provided'}`);

    sections.push('\n---ARTIFACT_START---');
    sections.push('Type: LOAD_TEST_PLAN');
    sections.push('Name: Load Test Plan');
    sections.push('Description: k6 test scenarios for smoke, load, stress, spike, and soak testing');
    sections.push('Content:');
    sections.push(this.generateLoadTestPlan(archDoc, deployPlan));
    sections.push('---ARTIFACT_END---\n');

    sections.push('\n---ARTIFACT_START---');
    sections.push('Type: PERFORMANCE_REPORT');
    sections.push('Name: Performance Report');
    sections.push('Description: Baseline metrics, bottleneck analysis, and prioritized optimization recommendations');
    sections.push('Content:');
    sections.push(this.generatePerformanceReport(sourceArtifacts, archDoc));
    sections.push('---ARTIFACT_END---\n');

    sections.push('\n---ARTIFACT_START---');
    sections.push('Type: PERFORMANCE_BENCHMARK');
    sections.push('Name: Performance Benchmark');
    sections.push('Description: Target metrics with latency percentiles, throughput targets, and measurement methodology');
    sections.push('Content:');
    sections.push(this.generatePerformanceBenchmark(archDoc));
    sections.push('---ARTIFACT_END---\n');

    agentLog(this.role, 'Performance engineering analysis complete', task.stage);
    return sections.join('\n');
  }

  protected async produceArtifacts(task: AgentTask, output: string): Promise<Artifact[]> {
    const parsed = this.parseClaudeOutput(output);
    const artifacts: Artifact[] = [];

    if (parsed.artifacts.length > 0) {
      for (const pa of parsed.artifacts) {
        const artifactType = this.resolveArtifactType(pa.type);
        if (artifactType) {
          const artifact = this.createArtifact(
            artifactType,
            pa.name,
            pa.description,
            pa.content,
            `.cdm/performance/${pa.name.toLowerCase().replace(/\s+/g, '-')}.md`,
          );
          this.artifactStore.store(artifact);
          artifacts.push(artifact);
        }
      }
    }

    if (!artifacts.some((a) => a.type === ArtifactType.LOAD_TEST_PLAN)) {
      const plan = this.createArtifact(
        ArtifactType.LOAD_TEST_PLAN,
        'Load Test Plan',
        'k6 test scenarios for smoke, load, stress, spike, and soak testing',
        output,
        '.cdm/performance/load-test-plan.md',
      );
      this.artifactStore.store(plan);
      artifacts.push(plan);
    }

    if (!artifacts.some((a) => a.type === ArtifactType.PERFORMANCE_REPORT)) {
      const report = this.createArtifact(
        ArtifactType.PERFORMANCE_REPORT,
        'Performance Report',
        'Baseline metrics, bottleneck analysis, and optimization recommendations',
        output,
        '.cdm/performance/performance-report.md',
      );
      this.artifactStore.store(report);
      artifacts.push(report);
    }

    if (!artifacts.some((a) => a.type === ArtifactType.PERFORMANCE_BENCHMARK)) {
      const benchmark = this.createArtifact(
        ArtifactType.PERFORMANCE_BENCHMARK,
        'Performance Benchmark',
        'Target metrics with latency percentiles and throughput targets',
        output,
        '.cdm/performance/performance-benchmark.md',
      );
      this.artifactStore.store(benchmark);
      artifacts.push(benchmark);
    }

    return artifacts;
  }

  protected async identifyIssues(task: AgentTask, output: string): Promise<Issue[]> {
    const parsed = this.parseClaudeOutput(output);
    const issues: Issue[] = [];

    for (const pi of parsed.issues) {
      const severity = this.resolveIssueSeverity(pi.severity);
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.PERFORMANCE,
          severity,
          pi.title,
          pi.description,
          task.stage,
        ),
      );
    }

    for (const source of task.inputArtifacts.filter((a) => a.type === ArtifactType.SOURCE_CODE)) {
      const content = source.content;
      const lower = content.toLowerCase();

      if (!lower.includes('cache') && !lower.includes('redis') && !lower.includes('memcache') && !lower.includes('lru')) {
        issues.push(this.createIssue(
          task.featureId, IssueType.PERFORMANCE, IssueSeverity.MEDIUM,
          'No caching strategy detected',
          `Source ${source.name} does not reference any caching mechanism. Implement caching for frequently accessed data to reduce latency and database load.`,
          task.stage,
        ));
      }

      if (this.detectMissingPagination(content)) {
        issues.push(this.createIssue(
          task.featureId, IssueType.PERFORMANCE, IssueSeverity.HIGH,
          'Missing pagination on list endpoints',
          `Source ${source.name} contains list/query operations without pagination. Unbounded queries can cause memory exhaustion and slow response times. Implement cursor-based pagination.`,
          task.stage,
        ));
      }

      if (this.detectSynchronousBottlenecks(content)) {
        issues.push(this.createIssue(
          task.featureId, IssueType.PERFORMANCE, IssueSeverity.HIGH,
          'Synchronous bottleneck detected',
          `Source ${source.name} contains sequential operations that could be parallelized or moved to background processing. Use Promise.all for independent async operations or offload heavy work to a queue.`,
          task.stage,
        ));
      }

      if (lower.includes('express') || lower.includes('fastify') || lower.includes('koa')) {
        if (!lower.includes('compression') && !lower.includes('gzip') && !lower.includes('brotli')) {
          issues.push(this.createIssue(
            task.featureId, IssueType.PERFORMANCE, IssueSeverity.LOW,
            'Missing response compression',
            `HTTP server in ${source.name} does not appear to use compression middleware. Enable gzip/brotli compression to reduce response payload sizes.`,
            task.stage,
          ));
        }
      }
    }

    const archDoc = task.inputArtifacts.find((a) => a.type === ArtifactType.ARCHITECTURE_DOC);
    if (archDoc) {
      const archContent = archDoc.content.toLowerCase();

      if (!archContent.includes('cdn') && !archContent.includes('edge') && !archContent.includes('cloudfront') && !archContent.includes('fastly')) {
        issues.push(this.createIssue(
          task.featureId, IssueType.PERFORMANCE, IssueSeverity.MEDIUM,
          'No CDN in architecture',
          'Architecture does not reference a Content Delivery Network. CDN caching for static assets and cacheable API responses significantly reduces latency for geographically distributed users.',
          task.stage,
        ));
      }

      if (!archContent.includes('connection pool') && !archContent.includes('pgbouncer') && !archContent.includes('hikari')) {
        issues.push(this.createIssue(
          task.featureId, IssueType.PERFORMANCE, IssueSeverity.MEDIUM,
          'No connection pooling strategy',
          'Architecture does not mention database connection pooling. Without proper pooling, connection overhead becomes a bottleneck under load.',
          task.stage,
        ));
      }
    }

    const deployPlan = task.inputArtifacts.find((a) => a.type === ArtifactType.DEPLOYMENT_PLAN);
    if (deployPlan) {
      const deployContent = deployPlan.content.toLowerCase();
      if (!deployContent.includes('auto-scal') && !deployContent.includes('horizontal scal') && !deployContent.includes('hpa')) {
        issues.push(this.createIssue(
          task.featureId, IssueType.PERFORMANCE, IssueSeverity.MEDIUM,
          'No auto-scaling in deployment plan',
          'Deployment plan does not include auto-scaling configuration. Define HPA (Horizontal Pod Autoscaler) or equivalent scaling policies to handle traffic variations.',
          task.stage,
        ));
      }
    }

    return issues;
  }

  private generateLoadTestPlan(archDoc?: Artifact, deployPlan?: Artifact): string {
    const sections: string[] = [
      '# Load Test Plan',
      '',
      '## Test Environment',
      '- Environment: staging (production-like sizing)',
      '- Data: representative production dataset (anonymized)',
      '- External dependencies: stubbed/mocked with realistic latency',
      '',
      '## k6 Test Scenarios',
      '',
      '### 1. Smoke Test',
      '```javascript',
      'export const options = {',
      '  vus: 1,',
      '  duration: "1m",',
      '  thresholds: {',
      '    http_req_duration: ["p(99)<1500"],',
      '    http_req_failed: ["rate<0.01"],',
      '  },',
      '};',
      '```',
      'Purpose: Verify scripts work and establish baseline.',
      '',
      '### 2. Load Test',
      '```javascript',
      'export const options = {',
      '  stages: [',
      '    { duration: "5m", target: 100 },',
      '    { duration: "30m", target: 100 },',
      '    { duration: "5m", target: 0 },',
      '  ],',
      '  thresholds: {',
      '    http_req_duration: ["p(95)<500", "p(99)<1000"],',
      '    http_req_failed: ["rate<0.01"],',
      '  },',
      '};',
      '```',
      'Purpose: Validate system handles expected production load.',
      '',
      '### 3. Stress Test',
      '```javascript',
      'export const options = {',
      '  stages: [',
      '    { duration: "5m", target: 100 },',
      '    { duration: "10m", target: 200 },',
      '    { duration: "10m", target: 400 },',
      '    { duration: "10m", target: 600 },',
      '    { duration: "5m", target: 0 },',
      '  ],',
      '};',
      '```',
      'Purpose: Find breaking point and validate graceful degradation.',
      '',
      '### 4. Spike Test',
      '```javascript',
      'export const options = {',
      '  stages: [',
      '    { duration: "2m", target: 50 },',
      '    { duration: "1m", target: 500 },',
      '    { duration: "5m", target: 500 },',
      '    { duration: "1m", target: 50 },',
      '    { duration: "5m", target: 50 },',
      '  ],',
      '};',
      '```',
      'Purpose: Test auto-scaling and recovery after traffic spikes.',
      '',
      '### 5. Soak Test',
      '```javascript',
      'export const options = {',
      '  stages: [',
      '    { duration: "5m", target: 100 },',
      '    { duration: "8h", target: 100 },',
      '    { duration: "5m", target: 0 },',
      '  ],',
      '};',
      '```',
      'Purpose: Detect memory leaks, connection exhaustion, and degradation over time.',
      '',
      '## User Journeys',
      '- Browse catalog (40% of traffic)',
      '- Search and filter (25% of traffic)',
      '- View details (20% of traffic)',
      '- Create/update operations (10% of traffic)',
      '- Authentication flows (5% of traffic)',
    ];
    return sections.join('\n');
  }

  private generatePerformanceReport(sources: Artifact[], archDoc?: Artifact): string {
    const sections: string[] = [
      '# Performance Report',
      '',
      '## Baseline Metrics',
      'Establish baselines before optimization:',
      '| Metric | Current | Target |',
      '|--------|---------|--------|',
      '| p50 latency | TBD | <100ms |',
      '| p95 latency | TBD | <300ms |',
      '| p99 latency | TBD | <500ms |',
      '| Throughput | TBD | >1000 req/s |',
      '| Error rate | TBD | <0.1% |',
      '',
      '## Bottleneck Analysis',
      '',
      '### USE Method (Resources)',
      '| Resource | Utilization | Saturation | Errors |',
      '|----------|-------------|------------|--------|',
      '| CPU | TBD | TBD | TBD |',
      '| Memory | TBD | TBD | TBD |',
      '| Disk I/O | TBD | TBD | TBD |',
      '| Network | TBD | TBD | TBD |',
      '| DB Connections | TBD | TBD | TBD |',
      '',
      '### RED Method (Services)',
      '| Service | Rate (req/s) | Errors (%) | Duration (p99) |',
      '|---------|-------------|------------|----------------|',
      '| API Gateway | TBD | TBD | TBD |',
      '| Auth Service | TBD | TBD | TBD |',
      '| Core Service | TBD | TBD | TBD |',
      '| Database | TBD | TBD | TBD |',
      '',
      `## Source Code Analysis: ${sources.length} artifacts reviewed`,
      '',
      '## Optimization Recommendations (Priority Order)',
      '1. Database query optimization (highest impact, low effort)',
      '2. HTTP response caching (high impact, low effort)',
      '3. Connection pool tuning (medium impact, low effort)',
      '4. Async processing for heavy operations (high impact, medium effort)',
      '5. CDN for static assets (medium impact, low effort)',
      '6. Bundle size optimization (medium impact, medium effort)',
    ];
    return sections.join('\n');
  }

  private generatePerformanceBenchmark(archDoc?: Artifact): string {
    const sections: string[] = [
      '# Performance Benchmarks',
      '',
      '## API Performance Targets',
      '| Endpoint Category | p50 | p95 | p99 | Max Throughput |',
      '|-------------------|-----|-----|-----|----------------|',
      '| Read (list) | <50ms | <200ms | <500ms | 2000 req/s |',
      '| Read (detail) | <30ms | <100ms | <300ms | 5000 req/s |',
      '| Write (create) | <100ms | <300ms | <1000ms | 500 req/s |',
      '| Write (update) | <100ms | <300ms | <1000ms | 500 req/s |',
      '| Search | <100ms | <500ms | <1500ms | 1000 req/s |',
      '| Auth | <50ms | <200ms | <500ms | 3000 req/s |',
      '',
      '## Frontend Performance Targets (Core Web Vitals)',
      '| Metric | Good | Needs Improvement | Poor |',
      '|--------|------|-------------------|------|',
      '| LCP | <2.5s | 2.5s - 4.0s | >4.0s |',
      '| INP | <200ms | 200ms - 500ms | >500ms |',
      '| CLS | <0.1 | 0.1 - 0.25 | >0.25 |',
      '| TTFB | <800ms | 800ms - 1800ms | >1800ms |',
      '',
      '## Resource Utilization Targets',
      '| Resource | Normal | Warning | Critical |',
      '|----------|--------|---------|----------|',
      '| CPU | <50% | 50-70% | >70% |',
      '| Memory | <60% | 60-80% | >80% |',
      '| DB Connections | <50% pool | 50-75% pool | >75% pool |',
      '',
      '## Measurement Methodology',
      '- Server-side: Prometheus metrics with Grafana dashboards',
      '- Client-side: Real User Monitoring (RUM) via web-vitals library',
      '- Synthetic: k6 Cloud or Grafana k6 from multiple regions',
      '- Continuous: performance regression tests in CI pipeline',
      '- Alerting: PagerDuty alerts when p99 exceeds benchmark for 5 minutes',
    ];
    return sections.join('\n');
  }

  private detectMissingPagination(content: string): boolean {
    const listPatterns = /\.(find|findAll|findMany|select|query|list|getAll|fetch)\s*\(/i;
    const hasPagination = /\b(limit|offset|cursor|page|skip|take|pagina)\b/i.test(content);
    return listPatterns.test(content) && !hasPagination;
  }

  private detectSynchronousBottlenecks(content: string): boolean {
    const awaitInLoop = /for\s*\([\s\S]{0,100}\)\s*\{[\s\S]{0,300}await\s+/;
    const sequentialAwaits = /await\s+\w[\s\S]{0,50};\s*\n\s*await\s+\w[\s\S]{0,50};\s*\n\s*await\s+\w/;
    return awaitInLoop.test(content) || sequentialAwaits.test(content);
  }

  private parseClaudeOutput(raw: string): ParsedOutput {
    const artifacts: ParsedArtifact[] = [];
    const issues: ParsedIssue[] = [];

    const artifactRegex = /---ARTIFACT_START---([\s\S]*?)---ARTIFACT_END---/g;
    let match: RegExpExecArray | null;
    while ((match = artifactRegex.exec(raw)) !== null) {
      const block = match[1].trim();
      const typeMatch = block.match(/^Type:\s*(.+)$/m);
      const nameMatch = block.match(/^Name:\s*(.+)$/m);
      const descMatch = block.match(/^Description:\s*(.+)$/m);
      const contentMatch = block.match(/Content:\s*([\s\S]*)$/m);
      if (typeMatch && nameMatch) {
        artifacts.push({
          type: typeMatch[1].trim(),
          name: nameMatch[1].trim(),
          description: descMatch?.[1]?.trim() ?? '',
          content: contentMatch?.[1]?.trim() ?? '',
        });
      }
    }

    const issueRegex = /---ISSUE_START---([\s\S]*?)---ISSUE_END---/g;
    while ((match = issueRegex.exec(raw)) !== null) {
      const block = match[1].trim();
      const typeMatch = block.match(/^Type:\s*(.+)$/m);
      const sevMatch = block.match(/^Severity:\s*(.+)$/m);
      const titleMatch = block.match(/^Title:\s*(.+)$/m);
      const descMatch = block.match(/^Description:\s*([\s\S]*)$/m);
      if (typeMatch && titleMatch) {
        issues.push({
          type: typeMatch[1].trim(),
          severity: sevMatch?.[1]?.trim() ?? 'medium',
          title: titleMatch[1].trim(),
          description: descMatch?.[1]?.trim() ?? '',
        });
      }
    }

    const summaryMatch = raw.match(/### Summary\s*([\s\S]*?)(?=###|---ARTIFACT_START|$)/);
    const recsMatch = raw.match(/### Recommendations\s*([\s\S]*?)$/);

    return {
      summary: summaryMatch?.[1]?.trim() ?? '',
      artifacts,
      issues,
      recommendations: recsMatch?.[1]?.trim() ?? '',
    };
  }

  private resolveArtifactType(typeStr: string): ArtifactType | null {
    const normalized = typeStr.toLowerCase().replace(/[\s_-]+/g, '_');
    const mapping: Record<string, ArtifactType> = {
      load_test_plan: ArtifactType.LOAD_TEST_PLAN,
      performance_report: ArtifactType.PERFORMANCE_REPORT,
      performance_benchmark: ArtifactType.PERFORMANCE_BENCHMARK,
    };
    return mapping[normalized] ?? null;
  }

  private resolveIssueSeverity(sevStr: string): IssueSeverity {
    const mapping: Record<string, IssueSeverity> = {
      critical: IssueSeverity.CRITICAL,
      high: IssueSeverity.HIGH,
      medium: IssueSeverity.MEDIUM,
      low: IssueSeverity.LOW,
      info: IssueSeverity.INFO,
    };
    return mapping[sevStr.toLowerCase()] ?? IssueSeverity.MEDIUM;
  }
}
