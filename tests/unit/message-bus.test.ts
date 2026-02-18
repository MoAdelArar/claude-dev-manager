import { v4 as uuidv4 } from 'uuid';
import { MessageBus } from '../../src/communication/message-bus';
import {
  AgentRole,
  MessageType,
  MessagePriority,
  AgentMessage,
} from '../../src/types';

describe('MessageBus', () => {
  let bus: MessageBus;

  beforeEach(() => {
    bus = new MessageBus();
  });

  afterEach(() => {
    bus.clear();
  });

  describe('subscribe and publish', () => {
    it('should deliver messages to the correct subscriber', async () => {
      const received: AgentMessage[] = [];

      bus.subscribe(AgentRole.ENGINEERING_MANAGER, [MessageType.TASK_ASSIGNMENT], (msg) => {
        received.push(msg);
      });

      await bus.publish({
        id: uuidv4(),
        type: MessageType.TASK_ASSIGNMENT,
        from: AgentRole.PRODUCT_MANAGER,
        to: AgentRole.ENGINEERING_MANAGER,
        subject: 'New task',
        body: 'Please work on this',
        priority: MessagePriority.HIGH,
        timestamp: new Date(),
        metadata: {},
      });

      expect(received).toHaveLength(1);
      expect(received[0].subject).toBe('New task');
    });

    it('should not deliver messages to wrong agent', async () => {
      const received: AgentMessage[] = [];

      bus.subscribe(AgentRole.SENIOR_DEVELOPER, [MessageType.TASK_ASSIGNMENT], (msg) => {
        received.push(msg);
      });

      await bus.publish({
        id: uuidv4(),
        type: MessageType.TASK_ASSIGNMENT,
        from: AgentRole.PRODUCT_MANAGER,
        to: AgentRole.ENGINEERING_MANAGER,
        subject: 'Not for dev',
        body: 'This goes to EM',
        priority: MessagePriority.NORMAL,
        timestamp: new Date(),
        metadata: {},
      });

      expect(received).toHaveLength(0);
    });

    it('should filter by message type', async () => {
      const received: AgentMessage[] = [];

      bus.subscribe(AgentRole.ENGINEERING_MANAGER, [MessageType.REVIEW_REQUEST], (msg) => {
        received.push(msg);
      });

      await bus.publish({
        id: uuidv4(),
        type: MessageType.TASK_ASSIGNMENT,
        from: AgentRole.PRODUCT_MANAGER,
        to: AgentRole.ENGINEERING_MANAGER,
        subject: 'Task',
        body: 'Task body',
        priority: MessagePriority.NORMAL,
        timestamp: new Date(),
        metadata: {},
      });

      expect(received).toHaveLength(0);
    });
  });

  describe('send', () => {
    it('should create and return a message', () => {
      const msg = bus.send(
        AgentRole.PRODUCT_MANAGER,
        AgentRole.ENGINEERING_MANAGER,
        MessageType.TASK_ASSIGNMENT,
        'Test Subject',
        'Test Body',
      );

      expect(msg.id).toBeDefined();
      expect(msg.from).toBe(AgentRole.PRODUCT_MANAGER);
      expect(msg.to).toBe(AgentRole.ENGINEERING_MANAGER);
      expect(msg.subject).toBe('Test Subject');
    });
  });

  describe('reply', () => {
    it('should create a reply message', () => {
      const original = bus.send(
        AgentRole.PRODUCT_MANAGER,
        AgentRole.ENGINEERING_MANAGER,
        MessageType.QUESTION,
        'Question',
        'What about this?',
      );

      const reply = bus.reply(original, 'Here is the answer');

      expect(reply.from).toBe(AgentRole.ENGINEERING_MANAGER);
      expect(reply.to).toBe(AgentRole.PRODUCT_MANAGER);
      expect(reply.subject).toBe('Re: Question');
    });
  });

  describe('broadcast', () => {
    it('should send to all subscribers except sender', async () => {
      const emReceived: AgentMessage[] = [];
      const devReceived: AgentMessage[] = [];

      bus.subscribe(AgentRole.ENGINEERING_MANAGER, [], (msg) => { emReceived.push(msg); });
      bus.subscribe(AgentRole.SENIOR_DEVELOPER, [], (msg) => { devReceived.push(msg); });
      bus.subscribe(AgentRole.PRODUCT_MANAGER, [], () => {});

      await bus.broadcast(
        AgentRole.PRODUCT_MANAGER,
        MessageType.STATUS_UPDATE,
        'Announcement',
        'Important update',
      );

      expect(emReceived).toHaveLength(1);
      expect(devReceived).toHaveLength(1);
    });
  });

  describe('getMessagesFor', () => {
    it('should return messages for a specific agent', () => {
      bus.send(AgentRole.PRODUCT_MANAGER, AgentRole.ENGINEERING_MANAGER, MessageType.TASK_ASSIGNMENT, 'Task 1', 'Body 1');
      bus.send(AgentRole.PRODUCT_MANAGER, AgentRole.ENGINEERING_MANAGER, MessageType.TASK_ASSIGNMENT, 'Task 2', 'Body 2');
      bus.send(AgentRole.PRODUCT_MANAGER, AgentRole.SENIOR_DEVELOPER, MessageType.TASK_ASSIGNMENT, 'Task 3', 'Body 3');

      const emMessages = bus.getMessagesFor(AgentRole.ENGINEERING_MANAGER);
      expect(emMessages).toHaveLength(2);

      const devMessages = bus.getMessagesFor(AgentRole.SENIOR_DEVELOPER);
      expect(devMessages).toHaveLength(1);
    });

    it('should filter by type when specified', () => {
      bus.send(AgentRole.PRODUCT_MANAGER, AgentRole.ENGINEERING_MANAGER, MessageType.TASK_ASSIGNMENT, 'Task', 'Body');
      bus.send(AgentRole.QA_ENGINEER, AgentRole.ENGINEERING_MANAGER, MessageType.REVIEW_REQUEST, 'Review', 'Body');

      const tasks = bus.getMessagesFor(AgentRole.ENGINEERING_MANAGER, MessageType.TASK_ASSIGNMENT);
      expect(tasks).toHaveLength(1);
    });
  });

  describe('getConversation', () => {
    it('should return all messages between two agents', () => {
      bus.send(AgentRole.PRODUCT_MANAGER, AgentRole.ENGINEERING_MANAGER, MessageType.QUESTION, 'Q1', 'Body');
      bus.send(AgentRole.ENGINEERING_MANAGER, AgentRole.PRODUCT_MANAGER, MessageType.ANSWER, 'A1', 'Body');
      bus.send(AgentRole.PRODUCT_MANAGER, AgentRole.SENIOR_DEVELOPER, MessageType.QUESTION, 'Q2', 'Body');

      const conversation = bus.getConversation(AgentRole.PRODUCT_MANAGER, AgentRole.ENGINEERING_MANAGER);
      expect(conversation).toHaveLength(2);
    });
  });

  describe('getStats', () => {
    it('should return accurate message statistics', () => {
      bus.send(AgentRole.PRODUCT_MANAGER, AgentRole.ENGINEERING_MANAGER, MessageType.TASK_ASSIGNMENT, 'T1', 'B');
      bus.send(AgentRole.PRODUCT_MANAGER, AgentRole.ENGINEERING_MANAGER, MessageType.TASK_ASSIGNMENT, 'T2', 'B');
      bus.send(AgentRole.QA_ENGINEER, AgentRole.ENGINEERING_MANAGER, MessageType.REVIEW_REQUEST, 'R1', 'B');

      const stats = bus.getStats();
      expect(stats.totalMessages).toBe(3);
      expect(stats.byType[MessageType.TASK_ASSIGNMENT]).toBe(2);
      expect(stats.byType[MessageType.REVIEW_REQUEST]).toBe(1);
      expect(stats.byAgent[AgentRole.PRODUCT_MANAGER].sent).toBe(2);
      expect(stats.byAgent[AgentRole.ENGINEERING_MANAGER].received).toBe(3);
    });
  });

  describe('unsubscribe', () => {
    it('should stop delivering messages after unsubscribe', async () => {
      const received: AgentMessage[] = [];

      const subId = bus.subscribe(AgentRole.ENGINEERING_MANAGER, [], (msg) => {
        received.push(msg);
      });

      bus.send(AgentRole.PRODUCT_MANAGER, AgentRole.ENGINEERING_MANAGER, MessageType.TASK_ASSIGNMENT, 'Before', 'B');
      expect(received).toHaveLength(1);

      bus.unsubscribe(subId);
      bus.send(AgentRole.PRODUCT_MANAGER, AgentRole.ENGINEERING_MANAGER, MessageType.TASK_ASSIGNMENT, 'After', 'B');
      expect(received).toHaveLength(1);
    });
  });
});
