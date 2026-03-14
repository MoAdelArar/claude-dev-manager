import { type Skill, AgentRole, ArtifactType } from '../types';

export const securityAuditSkill: Skill = {
  id: 'security-audit',
  name: 'Security Audit',
  description: 'Audit code for OWASP vulnerabilities, threat modeling, and compliance (GDPR, SOC2, HIPAA)',
  category: 'review',
  compatibleAgents: [AgentRole.REVIEWER],
  promptTemplate: `Perform a security audit of the code.

Check for:
1. **OWASP Top 10**
   - Injection (SQL, NoSQL, Command, LDAP)
   - Broken authentication
   - Sensitive data exposure
   - XML external entities (XXE)
   - Broken access control
   - Security misconfiguration
   - Cross-site scripting (XSS)
   - Insecure deserialization
   - Using components with known vulnerabilities
   - Insufficient logging & monitoring

2. **Authentication & Authorization**
   - Proper password handling (hashing, salting)
   - Session management
   - JWT/token security
   - Permission checks on all endpoints

3. **Data Protection**
   - Encryption at rest and in transit
   - PII handling
   - Secrets management (no hardcoded secrets)
   - Input validation and sanitization

4. **Compliance**
   - GDPR: data minimization, right to deletion, consent
   - SOC2: access controls, audit logging
   - HIPAA: PHI protection (if applicable)

5. **Threat Modeling**
   - Attack surface analysis
   - Trust boundaries
   - Potential threat vectors

For each vulnerability:
- Severity: critical / high / medium / low
- CWE/CVE reference if applicable
- Risk description
- Remediation steps

Prioritize findings by exploitability and impact.`,
  expectedArtifacts: [ArtifactType.SECURITY_REPORT],
  requiredInputArtifacts: [ArtifactType.SOURCE_CODE],
};
