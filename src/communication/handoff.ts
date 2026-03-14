import {
  type AgentRole,
  type HandoffPayload,
  type Artifact,
  MessageType,
  MessagePriority,
} from '../types';
import { validateHandoff } from '../utils/validators';
import { agentLog } from '../utils/logger';
import { type MessageBus } from './message-bus';

export interface HandoffResult {
  success: boolean;
  payload: HandoffPayload;
  timestamp: Date;
  errors: string[];
}

export class HandoffProtocol {
  private messageBus: MessageBus;
  private handoffHistory: HandoffResult[] = [];

  constructor(messageBus: MessageBus) {
    this.messageBus = messageBus;
  }

  async executeHandoff(payload: HandoffPayload): Promise<HandoffResult> {
    const errors = validateHandoff(payload);
    if (errors.length > 0) {
      const result: HandoffResult = {
        success: false,
        payload,
        timestamp: new Date(),
        errors: errors.map((e) => e.message),
      };
      this.handoffHistory.push(result);
      return result;
    }

    agentLog(
      payload.fromAgent,
      `Handing off to ${payload.toAgent} at step ${payload.step}`,
      payload.step,
    );

    this.messageBus.send(
      payload.fromAgent,
      payload.toAgent,
      MessageType.ARTIFACT_HANDOFF,
      `Handoff: ${payload.step}`,
      this.formatHandoffMessage(payload),
      MessagePriority.HIGH,
      payload.artifacts.map((a) => a.id),
    );

    const result: HandoffResult = {
      success: true,
      payload,
      timestamp: new Date(),
      errors: [],
    };
    this.handoffHistory.push(result);

    agentLog(
      payload.toAgent,
      `Received handoff from ${payload.fromAgent}`,
      payload.step,
    );

    return result;
  }

  async requestReview(
    fromAgent: AgentRole,
    reviewer: AgentRole,
    step: string,
    artifacts: Artifact[],
    reviewInstructions: string,
  ): Promise<void> {
    this.messageBus.send(
      fromAgent,
      reviewer,
      MessageType.REVIEW_REQUEST,
      `Review request for ${step}`,
      reviewInstructions,
      MessagePriority.HIGH,
      artifacts.map((a) => a.id),
    );

    agentLog(fromAgent, `Requested review from ${reviewer}`, step);
  }

  async submitReviewResponse(
    reviewer: AgentRole,
    originalRequester: AgentRole,
    step: string,
    approved: boolean,
    feedback: string,
  ): Promise<void> {
    this.messageBus.send(
      reviewer,
      originalRequester,
      approved ? MessageType.APPROVAL : MessageType.REJECTION,
      `Review ${approved ? 'approved' : 'rejected'}: ${step}`,
      feedback,
      MessagePriority.HIGH,
    );

    agentLog(
      reviewer,
      `${approved ? 'Approved' : 'Rejected'} work at step ${step}`,
      step,
    );
  }

  async escalate(
    fromAgent: AgentRole,
    toAgent: AgentRole,
    step: string,
    reason: string,
  ): Promise<void> {
    this.messageBus.send(
      fromAgent,
      toAgent,
      MessageType.ESCALATION,
      `Escalation at ${step}`,
      reason,
      MessagePriority.CRITICAL,
    );

    agentLog(fromAgent, `Escalated to ${toAgent}: ${reason}`, step, 'warn');
  }

  getHandoffHistory(): HandoffResult[] {
    return [...this.handoffHistory];
  }

  getHandoffsForStep(step: string): HandoffResult[] {
    return this.handoffHistory.filter((h) => h.payload.step === step);
  }

  private formatHandoffMessage(payload: HandoffPayload): string {
    const sections: string[] = [];

    sections.push(`## Handoff: ${payload.fromAgent} → ${payload.toAgent}`);
    sections.push(`**Step:** ${payload.step}`);
    sections.push(`\n### Context\n${payload.context}`);
    sections.push(`\n### Instructions\n${payload.instructions}`);

    if (payload.artifacts.length > 0) {
      sections.push(`\n### Artifacts (${payload.artifacts.length})`);
      for (const artifact of payload.artifacts) {
        sections.push(`- **${artifact.name}** (${artifact.type}): ${artifact.description}`);
      }
    }

    if (payload.constraints.length > 0) {
      sections.push('\n### Constraints');
      for (const constraint of payload.constraints) {
        sections.push(`- ${constraint}`);
      }
    }

    if (payload.previousFeedback && payload.previousFeedback.length > 0) {
      sections.push('\n### Previous Feedback');
      for (const feedback of payload.previousFeedback) {
        sections.push(`- ${feedback}`);
      }
    }

    return sections.join('\n');
  }
}
