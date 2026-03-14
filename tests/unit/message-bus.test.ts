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

      bus.subscribe(AgentRole.DEVELOPER, [MessageType.TASK_ASSIGNMENT], (msg) => {
        received.push(msg);
      });

      await bus.publish({
        id: uuidv4(),
        type: MessageType.TASK_ASSIGNMENT,
        from: AgentRole.PLANNER,
        to: AgentRole.DEVELOPER,
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

      bus.subscribe(AgentRole.DEVELOPER, [MessageType.TASK_ASSIGNMENT], (msg) => {
        received.push(msg);
      });

      await bus.publish({
        id: uuidv4(),
        type: MessageType.TASK_ASSIGNMENT,
        from: AgentRole.PLANNER,
        to: AgentRole.ARCHITECT,
        subject: 'Another task',
        body: 'Different agent',
        priority: MessagePriority.NORMAL,
        timestamp: new Date(),
        metadata: {},
      });

      expect(received).toHaveLength(0);
    });

    it('should not deliver messages of wrong type', async () => {
      const received: AgentMessage[] = [];

      bus.subscribe(AgentRole.DEVELOPER, [MessageType.REVIEW_REQUEST], (msg) => {
        received.push(msg);
      });

      await bus.publish({
        id: uuidv4(),
        type: MessageType.TASK_ASSIGNMENT,
        from: AgentRole.PLANNER,
        to: AgentRole.DEVELOPER,
        subject: 'Wrong type',
        body: 'Should not be delivered',
        priority: MessagePriority.NORMAL,
        timestamp: new Date(),
        metadata: {},
      });

      expect(received).toHaveLength(0);
    });

    it('should deliver to multiple subscribers', async () => {
      const received1: AgentMessage[] = [];
      const received2: AgentMessage[] = [];

      bus.subscribe(AgentRole.REVIEWER, [MessageType.REVIEW_REQUEST], (msg) => {
        received1.push(msg);
      });

      bus.subscribe(AgentRole.REVIEWER, [MessageType.REVIEW_REQUEST], (msg) => {
        received2.push(msg);
      });

      await bus.publish({
        id: uuidv4(),
        type: MessageType.REVIEW_REQUEST,
        from: AgentRole.DEVELOPER,
        to: AgentRole.REVIEWER,
        subject: 'Review needed',
        body: 'Please review this',
        priority: MessagePriority.HIGH,
        timestamp: new Date(),
        metadata: {},
      });

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
    });
  });

  describe('unsubscribe', () => {
    it('should stop receiving messages after unsubscribing', async () => {
      const received: AgentMessage[] = [];

      const subId = bus.subscribe(AgentRole.ARCHITECT, [MessageType.TASK_ASSIGNMENT], (msg) => {
        received.push(msg);
      });

      await bus.publish({
        id: uuidv4(),
        type: MessageType.TASK_ASSIGNMENT,
        from: AgentRole.PLANNER,
        to: AgentRole.ARCHITECT,
        subject: 'First message',
        body: 'Should be received',
        priority: MessagePriority.NORMAL,
        timestamp: new Date(),
        metadata: {},
      });

      bus.unsubscribe(subId);

      await bus.publish({
        id: uuidv4(),
        type: MessageType.TASK_ASSIGNMENT,
        from: AgentRole.PLANNER,
        to: AgentRole.ARCHITECT,
        subject: 'Second message',
        body: 'Should not be received',
        priority: MessagePriority.NORMAL,
        timestamp: new Date(),
        metadata: {},
      });

      expect(received).toHaveLength(1);
      expect(received[0].subject).toBe('First message');
    });
  });

  describe('getFullLog', () => {
    it('should track message log', async () => {
      await bus.publish({
        id: uuidv4(),
        type: MessageType.STATUS_UPDATE,
        from: AgentRole.DEVELOPER,
        to: AgentRole.PLANNER,
        subject: 'Update 1',
        body: 'First update',
        priority: MessagePriority.LOW,
        timestamp: new Date(),
        metadata: {},
      });

      await bus.publish({
        id: uuidv4(),
        type: MessageType.STATUS_UPDATE,
        from: AgentRole.ARCHITECT,
        to: AgentRole.PLANNER,
        subject: 'Update 2',
        body: 'Second update',
        priority: MessagePriority.LOW,
        timestamp: new Date(),
        metadata: {},
      });

      const log = bus.getFullLog();
      expect(log).toHaveLength(2);
    });

    it('should get messages from specific agent', async () => {
      await bus.publish({
        id: uuidv4(),
        type: MessageType.STATUS_UPDATE,
        from: AgentRole.DEVELOPER,
        to: AgentRole.PLANNER,
        subject: 'From developer',
        body: 'Test',
        priority: MessagePriority.LOW,
        timestamp: new Date(),
        metadata: {},
      });

      await bus.publish({
        id: uuidv4(),
        type: MessageType.STATUS_UPDATE,
        from: AgentRole.OPERATOR,
        to: AgentRole.PLANNER,
        subject: 'From operator',
        body: 'Test',
        priority: MessagePriority.LOW,
        timestamp: new Date(),
        metadata: {},
      });

      const devMessages = bus.getMessagesFrom(AgentRole.DEVELOPER);
      expect(devMessages).toHaveLength(1);
      expect(devMessages[0].from).toBe(AgentRole.DEVELOPER);
    });
  });

  describe('clear', () => {
    it('should clear all log and subscriptions', async () => {
      const received: AgentMessage[] = [];

      bus.subscribe(AgentRole.REVIEWER, [MessageType.REVIEW_REQUEST], (msg) => {
        received.push(msg);
      });

      await bus.publish({
        id: uuidv4(),
        type: MessageType.REVIEW_REQUEST,
        from: AgentRole.DEVELOPER,
        to: AgentRole.REVIEWER,
        subject: 'Before clear',
        body: 'Test',
        priority: MessagePriority.NORMAL,
        timestamp: new Date(),
        metadata: {},
      });

      expect(bus.getFullLog()).toHaveLength(1);
      expect(received).toHaveLength(1);

      bus.clear();

      expect(bus.getFullLog()).toHaveLength(0);

      await bus.publish({
        id: uuidv4(),
        type: MessageType.REVIEW_REQUEST,
        from: AgentRole.DEVELOPER,
        to: AgentRole.REVIEWER,
        subject: 'After clear',
        body: 'Test',
        priority: MessagePriority.NORMAL,
        timestamp: new Date(),
        metadata: {},
      });

      expect(bus.getFullLog()).toHaveLength(1);
      expect(received).toHaveLength(1);
    });
  });
});
