import {
  type Artifact,
  type HandoffPayload,
  ArtifactType,
  ArtifactStatus,
  ReviewStatus,
  AgentRole,
  PipelineStage,
  MessageType,
  MessagePriority,
} from '../../src/types';
import { HandoffProtocol } from '../../src/communication/handoff';
import { MessageBus } from '../../src/communication/message-bus';

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: `art-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: ArtifactType.REQUIREMENTS_DOC,
    name: 'Test Artifact',
    description: 'A test artifact',
    filePath: 'test/artifact.md',
    createdBy: AgentRole.PRODUCT_MANAGER,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    content: 'Test content',
    metadata: {},
    status: ArtifactStatus.DRAFT,
    reviewStatus: ReviewStatus.PENDING,
    ...overrides,
  };
}

function makeHandoffPayload(overrides: Partial<HandoffPayload> = {}): HandoffPayload {
  return {
    fromAgent: AgentRole.PRODUCT_MANAGER,
    toAgent: AgentRole.SYSTEM_ARCHITECT,
    stage: PipelineStage.REQUIREMENTS_GATHERING,
    context: 'Feature requirements are complete.',
    artifacts: [makeArtifact()],
    instructions: 'Design the system architecture based on these requirements.',
    constraints: ['Must use microservices', 'Budget limited'],
    previousFeedback: ['Previous design was too complex'],
    ...overrides,
  };
}

describe('HandoffProtocol', () => {
  let messageBus: MessageBus;
  let protocol: HandoffProtocol;

  beforeEach(() => {
    messageBus = new MessageBus();
    protocol = new HandoffProtocol(messageBus);
  });

  describe('executeHandoff()', () => {
    it('should return success for a valid handoff payload', async () => {
      const payload = makeHandoffPayload();
      const result = await protocol.executeHandoff(payload);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.payload).toBe(payload);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should send a message on the message bus for valid handoff', async () => {
      const payload = makeHandoffPayload();
      await protocol.executeHandoff(payload);

      const messages = messageBus.getFullLog();
      expect(messages.length).toBeGreaterThan(0);

      const handoffMessage = messages.find(m => m.type === MessageType.ARTIFACT_HANDOFF);
      expect(handoffMessage).toBeDefined();
      expect(handoffMessage!.from).toBe(AgentRole.PRODUCT_MANAGER);
      expect(handoffMessage!.to).toBe(AgentRole.SYSTEM_ARCHITECT);
      expect(handoffMessage!.priority).toBe(MessagePriority.HIGH);
      expect(handoffMessage!.subject).toContain('Handoff');
    });

    it('should include artifact IDs in the message', async () => {
      const artifact = makeArtifact({ id: 'specific-art-id' });
      const payload = makeHandoffPayload({ artifacts: [artifact] });
      await protocol.executeHandoff(payload);

      const messages = messageBus.getFullLog();
      const handoffMessage = messages.find(m => m.type === MessageType.ARTIFACT_HANDOFF);
      expect(handoffMessage!.artifacts).toContain('specific-art-id');
    });

    it('should format handoff message body with context, instructions, artifacts, constraints, and feedback', async () => {
      const payload = makeHandoffPayload({
        context: 'My context',
        instructions: 'My instructions',
        constraints: ['Constraint A', 'Constraint B'],
        previousFeedback: ['Feedback 1'],
      });
      await protocol.executeHandoff(payload);

      const messages = messageBus.getFullLog();
      const handoffMessage = messages.find(m => m.type === MessageType.ARTIFACT_HANDOFF);
      const body = handoffMessage!.body;

      expect(body).toContain('My context');
      expect(body).toContain('My instructions');
      expect(body).toContain('Constraint A');
      expect(body).toContain('Constraint B');
      expect(body).toContain('Feedback 1');
      expect(body).toContain('Artifacts');
    });

    it('should return failure with validation errors for invalid payload', async () => {
      const payload = makeHandoffPayload({
        fromAgent: AgentRole.PRODUCT_MANAGER,
        toAgent: AgentRole.PRODUCT_MANAGER,
        context: '',
        instructions: '',
      });

      const result = await protocol.executeHandoff(payload);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should not send a message bus message on validation failure', async () => {
      const payload = makeHandoffPayload({
        fromAgent: AgentRole.PRODUCT_MANAGER,
        toAgent: AgentRole.PRODUCT_MANAGER,
        context: '',
        instructions: '',
      });

      await protocol.executeHandoff(payload);

      const messages = messageBus.getFullLog();
      expect(messages).toHaveLength(0);
    });

    it('should record handoff in history regardless of success or failure', async () => {
      const validPayload = makeHandoffPayload();
      const invalidPayload = makeHandoffPayload({
        fromAgent: AgentRole.PRODUCT_MANAGER,
        toAgent: AgentRole.PRODUCT_MANAGER,
        context: '',
      });

      await protocol.executeHandoff(validPayload);
      await protocol.executeHandoff(invalidPayload);

      const history = protocol.getHandoffHistory();
      expect(history).toHaveLength(2);
      expect(history[0].success).toBe(true);
      expect(history[1].success).toBe(false);
    });

    it('should handle handoff with empty artifacts and constraints', async () => {
      const payload = makeHandoffPayload({
        artifacts: [],
        constraints: [],
        previousFeedback: [],
      });

      const result = await protocol.executeHandoff(payload);
      expect(result.success).toBe(true);
    });
  });

  describe('requestReview()', () => {
    it('should send a review request message', async () => {
      const artifacts = [makeArtifact({ id: 'rev-art-1' })];
      await protocol.requestReview(
        AgentRole.SENIOR_DEVELOPER,
        AgentRole.CODE_REVIEWER,
        PipelineStage.CODE_REVIEW,
        artifacts,
        'Please review the implementation.',
      );

      const messages = messageBus.getFullLog();
      expect(messages.length).toBeGreaterThan(0);

      const reviewMsg = messages.find(m => m.type === MessageType.REVIEW_REQUEST);
      expect(reviewMsg).toBeDefined();
      expect(reviewMsg!.from).toBe(AgentRole.SENIOR_DEVELOPER);
      expect(reviewMsg!.to).toBe(AgentRole.CODE_REVIEWER);
      expect(reviewMsg!.subject).toContain('Review request');
      expect(reviewMsg!.subject).toContain(PipelineStage.CODE_REVIEW);
      expect(reviewMsg!.body).toBe('Please review the implementation.');
      expect(reviewMsg!.priority).toBe(MessagePriority.HIGH);
      expect(reviewMsg!.artifacts).toContain('rev-art-1');
    });
  });

  describe('submitReviewResponse()', () => {
    it('should send an approval message when approved is true', async () => {
      await protocol.submitReviewResponse(
        AgentRole.CODE_REVIEWER,
        AgentRole.SENIOR_DEVELOPER,
        PipelineStage.CODE_REVIEW,
        true,
        'Looks great, approved.',
      );

      const messages = messageBus.getFullLog();
      const approvalMsg = messages.find(m => m.type === MessageType.APPROVAL);
      expect(approvalMsg).toBeDefined();
      expect(approvalMsg!.from).toBe(AgentRole.CODE_REVIEWER);
      expect(approvalMsg!.to).toBe(AgentRole.SENIOR_DEVELOPER);
      expect(approvalMsg!.subject).toContain('approved');
      expect(approvalMsg!.body).toBe('Looks great, approved.');
      expect(approvalMsg!.priority).toBe(MessagePriority.HIGH);
    });

    it('should send a rejection message when approved is false', async () => {
      await protocol.submitReviewResponse(
        AgentRole.CODE_REVIEWER,
        AgentRole.SENIOR_DEVELOPER,
        PipelineStage.CODE_REVIEW,
        false,
        'Needs refactoring.',
      );

      const messages = messageBus.getFullLog();
      const rejectionMsg = messages.find(m => m.type === MessageType.REJECTION);
      expect(rejectionMsg).toBeDefined();
      expect(rejectionMsg!.from).toBe(AgentRole.CODE_REVIEWER);
      expect(rejectionMsg!.to).toBe(AgentRole.SENIOR_DEVELOPER);
      expect(rejectionMsg!.subject).toContain('rejected');
      expect(rejectionMsg!.body).toBe('Needs refactoring.');
    });
  });

  describe('escalate()', () => {
    it('should send an escalation message with CRITICAL priority', async () => {
      await protocol.escalate(
        AgentRole.SENIOR_DEVELOPER,
        AgentRole.ENGINEERING_MANAGER,
        PipelineStage.IMPLEMENTATION,
        'Blocked on a critical dependency issue.',
      );

      const messages = messageBus.getFullLog();
      const escalationMsg = messages.find(m => m.type === MessageType.ESCALATION);
      expect(escalationMsg).toBeDefined();
      expect(escalationMsg!.from).toBe(AgentRole.SENIOR_DEVELOPER);
      expect(escalationMsg!.to).toBe(AgentRole.ENGINEERING_MANAGER);
      expect(escalationMsg!.priority).toBe(MessagePriority.CRITICAL);
      expect(escalationMsg!.subject).toContain('Escalation');
      expect(escalationMsg!.subject).toContain(PipelineStage.IMPLEMENTATION);
      expect(escalationMsg!.body).toBe('Blocked on a critical dependency issue.');
    });
  });

  describe('getHandoffHistory()', () => {
    it('should return empty array when no handoffs have occurred', () => {
      const history = protocol.getHandoffHistory();
      expect(history).toEqual([]);
    });

    it('should return all recorded handoffs', async () => {
      await protocol.executeHandoff(makeHandoffPayload());
      await protocol.executeHandoff(makeHandoffPayload({
        fromAgent: AgentRole.SYSTEM_ARCHITECT,
        toAgent: AgentRole.ENGINEERING_MANAGER,
        stage: PipelineStage.ARCHITECTURE_DESIGN,
      }));

      const history = protocol.getHandoffHistory();
      expect(history).toHaveLength(2);
    });

    it('should return a copy of the history (not a reference)', async () => {
      await protocol.executeHandoff(makeHandoffPayload());
      const history1 = protocol.getHandoffHistory();
      const history2 = protocol.getHandoffHistory();

      expect(history1).not.toBe(history2);
      expect(history1).toEqual(history2);
    });
  });

  describe('getHandoffsForStage()', () => {
    it('should return empty array when no handoffs match the stage', async () => {
      await protocol.executeHandoff(makeHandoffPayload({
        stage: PipelineStage.REQUIREMENTS_GATHERING,
      }));

      const result = protocol.getHandoffsForStage(PipelineStage.DEPLOYMENT);
      expect(result).toEqual([]);
    });

    it('should return only handoffs for the specified stage', async () => {
      await protocol.executeHandoff(makeHandoffPayload({
        stage: PipelineStage.REQUIREMENTS_GATHERING,
      }));
      await protocol.executeHandoff(makeHandoffPayload({
        stage: PipelineStage.ARCHITECTURE_DESIGN,
        fromAgent: AgentRole.SYSTEM_ARCHITECT,
        toAgent: AgentRole.ENGINEERING_MANAGER,
      }));
      await protocol.executeHandoff(makeHandoffPayload({
        stage: PipelineStage.REQUIREMENTS_GATHERING,
        fromAgent: AgentRole.BUSINESS_ANALYST,
        toAgent: AgentRole.SYSTEM_ARCHITECT,
      }));

      const result = protocol.getHandoffsForStage(PipelineStage.REQUIREMENTS_GATHERING);
      expect(result).toHaveLength(2);
      expect(result.every(h => h.payload.stage === PipelineStage.REQUIREMENTS_GATHERING)).toBe(true);
    });

    it('should include both successful and failed handoffs for the stage', async () => {
      await protocol.executeHandoff(makeHandoffPayload({
        stage: PipelineStage.REQUIREMENTS_GATHERING,
      }));
      await protocol.executeHandoff(makeHandoffPayload({
        stage: PipelineStage.REQUIREMENTS_GATHERING,
        fromAgent: AgentRole.PRODUCT_MANAGER,
        toAgent: AgentRole.PRODUCT_MANAGER,
        context: '',
      }));

      const result = protocol.getHandoffsForStage(PipelineStage.REQUIREMENTS_GATHERING);
      expect(result).toHaveLength(2);
      expect(result[0].success).toBe(true);
      expect(result[1].success).toBe(false);
    });
  });
});
