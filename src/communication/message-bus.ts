import { v4 as uuidv4 } from 'uuid';
import {
  type AgentMessage,
  type AgentRole,
  type MessageType,
  MessagePriority,
} from '../types';
import logger from '../utils/logger';

type MessageHandler = (message: AgentMessage) => void | Promise<void>;

interface Subscription {
  id: string;
  agent: AgentRole;
  types: MessageType[];
  handler: MessageHandler;
}

export class MessageBus {
  private subscriptions: Subscription[] = [];
  private messageLog: AgentMessage[] = [];
  private readonly maxLogSize: number;

  constructor(maxLogSize: number = 10000) {
    this.maxLogSize = maxLogSize;
  }

  subscribe(
    agent: AgentRole,
    types: MessageType[],
    handler: MessageHandler,
  ): string {
    const id = uuidv4();
    this.subscriptions.push({ id, agent, types, handler });
    return id;
  }

  unsubscribe(subscriptionId: string): void {
    this.subscriptions = this.subscriptions.filter((s) => s.id !== subscriptionId);
  }

  async publish(message: AgentMessage): Promise<void> {
    if (!message.id) {
      message.id = uuidv4();
    }
    if (!message.timestamp) {
      message.timestamp = new Date();
    }

    this.logMessage(message);

    const targetSubscriptions = this.subscriptions.filter(
      (s) =>
        s.agent === message.to &&
        (s.types.length === 0 || s.types.includes(message.type)),
    );

    for (const sub of targetSubscriptions) {
      try {
        await sub.handler(message);
      } catch (error) {
        logger.error(`Message handler error for ${sub.agent}: ${error}`);
      }
    }
  }

  async broadcast(
    from: AgentRole,
    type: MessageType,
    subject: string,
    body: string,
    priority: MessagePriority = MessagePriority.NORMAL,
  ): Promise<void> {
    const uniqueAgents = new Set(this.subscriptions.map((s) => s.agent));

    for (const agent of uniqueAgents) {
      if (agent !== from) {
        await this.publish({
          id: uuidv4(),
          type,
          from,
          to: agent,
          subject,
          body,
          priority,
          timestamp: new Date(),
          metadata: { broadcast: true },
        });
      }
    }
  }

  send(
    from: AgentRole,
    to: AgentRole,
    type: MessageType,
    subject: string,
    body: string,
    priority: MessagePriority = MessagePriority.NORMAL,
    artifacts?: string[],
  ): AgentMessage {
    const message: AgentMessage = {
      id: uuidv4(),
      type,
      from,
      to,
      subject,
      body,
      priority,
      timestamp: new Date(),
      artifacts,
      metadata: {},
    };

    this.publish(message);
    return message;
  }

  reply(
    original: AgentMessage,
    body: string,
    type?: MessageType,
  ): AgentMessage {
    return this.send(
      original.to,
      original.from,
      type ?? original.type,
      `Re: ${original.subject}`,
      body,
      original.priority,
    );
  }

  getMessagesFor(agent: AgentRole, type?: MessageType): AgentMessage[] {
    return this.messageLog.filter(
      (m) => m.to === agent && (!type || m.type === type),
    );
  }

  getMessagesFrom(agent: AgentRole, type?: MessageType): AgentMessage[] {
    return this.messageLog.filter(
      (m) => m.from === agent && (!type || m.type === type),
    );
  }

  getConversation(agent1: AgentRole, agent2: AgentRole): AgentMessage[] {
    return this.messageLog
      .filter(
        (m) =>
          (m.from === agent1 && m.to === agent2) ||
          (m.from === agent2 && m.to === agent1),
      )
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  getMessageThread(messageId: string): AgentMessage[] {
    const thread: AgentMessage[] = [];
    const message = this.messageLog.find((m) => m.id === messageId);
    if (!message) return thread;

    thread.push(message);

    const replies = this.messageLog.filter((m) => m.replyTo === messageId);
    for (const reply of replies) {
      thread.push(reply, ...this.getMessageThread(reply.id).slice(1));
    }

    return thread;
  }

  getFullLog(): AgentMessage[] {
    return [...this.messageLog];
  }

  clear(): void {
    this.messageLog = [];
    this.subscriptions = [];
  }

  getStats(): {
    totalMessages: number;
    byType: Record<string, number>;
    byAgent: Record<string, { sent: number; received: number }>;
  } {
    const byType: Record<string, number> = {};
    const byAgent: Record<string, { sent: number; received: number }> = {};

    for (const msg of this.messageLog) {
      byType[msg.type] = (byType[msg.type] ?? 0) + 1;

      if (!byAgent[msg.from]) byAgent[msg.from] = { sent: 0, received: 0 };
      if (!byAgent[msg.to]) byAgent[msg.to] = { sent: 0, received: 0 };
      byAgent[msg.from].sent += 1;
      byAgent[msg.to].received += 1;
    }

    return { totalMessages: this.messageLog.length, byType, byAgent };
  }

  private logMessage(message: AgentMessage): void {
    this.messageLog.push(message);

    if (this.messageLog.length > this.maxLogSize) {
      this.messageLog = this.messageLog.slice(-Math.floor(this.maxLogSize * 0.8));
    }

    logger.debug(
      `[MSG] ${message.from} -> ${message.to}: [${message.type}] ${message.subject}`,
    );
  }
}
