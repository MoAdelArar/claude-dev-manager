import { type Skill, AgentRole, ArtifactType } from '../types';

export const apiDesignSkill: Skill = {
  id: 'api-design',
  name: 'API Design',
  description: 'Design REST, GraphQL, or gRPC API contracts with versioning and error handling',
  category: 'design',
  compatibleAgents: [AgentRole.ARCHITECT],
  promptTemplate: `Design the API contract for the requested feature.

Include:
1. **Endpoints/Operations**
   - HTTP method and path (REST) or operation name (GraphQL/gRPC)
   - Request parameters, body schema
   - Response schema with all fields
   - Status codes and error responses

2. **Data Models**
   - Request/response types in {language}
   - Validation rules
   - Required vs optional fields

3. **Authentication & Authorization**
   - Auth mechanism (JWT, API key, OAuth)
   - Required permissions per endpoint
   - Rate limiting considerations

4. **Versioning Strategy**
   - How to version the API
   - Deprecation policy
   - Backward compatibility approach

5. **Error Handling**
   - Error response format
   - Error codes and messages
   - Retry guidance for clients

Output OpenAPI/Swagger spec for REST, or schema definition for GraphQL/gRPC.
Follow {framework} conventions for API patterns.`,
  expectedArtifacts: [ArtifactType.API_SPEC],
  requiredInputArtifacts: [ArtifactType.REQUIREMENTS_DOC],
  projectFilter: {
    hasAPI: true,
  },
};
