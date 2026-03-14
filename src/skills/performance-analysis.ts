import { type Skill, AgentRole, ArtifactType } from '../types';

export const performanceAnalysisSkill: Skill = {
  id: 'performance-analysis',
  name: 'Performance Analysis',
  description: 'Analyze code for performance bottlenecks, optimization opportunities, and load testing',
  category: 'review',
  compatibleAgents: [AgentRole.REVIEWER],
  promptTemplate: `Analyze the code for performance issues and optimization opportunities.

Evaluate:
1. **Algorithmic Complexity**
   - Time complexity (Big O)
   - Space complexity
   - Identify O(n²) or worse operations
   - Suggest more efficient alternatives

2. **Database Performance**
   - N+1 query problems
   - Missing indexes
   - Inefficient joins
   - Query optimization opportunities

3. **Memory Usage**
   - Memory leaks potential
   - Unnecessary object creation
   - Large object handling
   - Caching opportunities

4. **Network & I/O**
   - Unnecessary API calls
   - Missing request batching
   - Connection pooling
   - Async operation handling

5. **Caching Strategy**
   - What should be cached
   - Cache invalidation approach
   - TTL recommendations

6. **Load Testing Recommendations**
   - Key scenarios to test
   - Expected throughput targets
   - Breaking points to identify

For each issue:
- Impact: high / medium / low
- Current behavior
- Recommended optimization
- Expected improvement

Focus on measurable improvements.
Avoid premature optimization — prioritize real bottlenecks.`,
  expectedArtifacts: [ArtifactType.PERFORMANCE_REPORT],
  requiredInputArtifacts: [ArtifactType.SOURCE_CODE],
};
