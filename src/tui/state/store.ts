import type { ChatMessage, MessageRole } from '../widgets/chat.js';
import type { HeaderState } from '../widgets/header.js';
import type { StatusState } from '../widgets/status.js';

export type ExecutionProgress =
  | 'idle'
  | 'resolving-personas'
  | 'executing-main'
  | 'executing-review'
  | 'parsing-artifacts'
  | 'completed'
  | 'failed';

export interface ExecutionState {
  isRunning: boolean;
  currentFeatureId: string | null;
  progress: ExecutionProgress;
  persona: string | null;
  aborted: boolean;
}

export interface AppState {
  projectPath: string;
  isInitialized: boolean;
  messages: ChatMessage[];
  streamingContent: string;
  header: HeaderState;
  status: StatusState;
  execution: ExecutionState;
}

type StateListener = (state: AppState) => void;

export class StateStore {
  private state: AppState;
  private listeners: StateListener[] = [];
  private messageIdCounter = 0;

  constructor(projectPath: string) {
    this.state = {
      projectPath,
      isInitialized: false,
      messages: [],
      streamingContent: '',
      header: {
        projectName: '',
        projectPath,
        model: 'claude-sonnet-4-20250514',
        persona: 'auto',
        isInitialized: false,
      },
      status: {
        mode: 'idle',
      },
      execution: {
        isRunning: false,
        currentFeatureId: null,
        progress: 'idle',
        persona: null,
        aborted: false,
      },
    };
  }

  getState(): AppState {
    return this.state;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private update(updates: Partial<AppState>): void {
    this.state = { ...this.state, ...updates };
    this.notify();
  }

  setInitialized(initialized: boolean, projectName?: string): void {
    this.update({
      isInitialized: initialized,
      header: {
        ...this.state.header,
        isInitialized: initialized,
        projectName: projectName ?? this.state.header.projectName,
      },
    });
  }

  setHeader(updates: Partial<HeaderState>): void {
    this.update({
      header: { ...this.state.header, ...updates },
    });
  }

  setStatus(updates: Partial<StatusState>): void {
    this.update({
      status: { ...this.state.status, ...updates },
    });
  }

  setExecutionProgress(progress: ExecutionProgress): void {
    this.update({
      execution: { ...this.state.execution, progress },
    });
  }

  startExecution(featureId: string, persona: string): void {
    this.update({
      execution: {
        isRunning: true,
        currentFeatureId: featureId,
        progress: 'resolving-personas',
        persona,
        aborted: false,
      },
      status: { mode: 'executing' },
    });
  }

  finishExecution(success: boolean, tokens?: number, duration?: number): void {
    this.update({
      execution: {
        ...this.state.execution,
        isRunning: false,
        progress: success ? 'completed' : 'failed',
      },
      status: {
        mode: 'idle',
        tokens,
        duration,
      },
    });
  }

  abortExecution(): void {
    this.update({
      execution: {
        ...this.state.execution,
        isRunning: false,
        progress: 'idle',
        aborted: true,
      },
      status: { mode: 'idle' },
    });
  }

  private generateMessageId(): string {
    this.messageIdCounter++;
    return `msg-${this.messageIdCounter}`;
  }

  addMessage(role: MessageRole, content: string, persona?: string): string {
    const id = this.generateMessageId();
    const message: ChatMessage = {
      id,
      role,
      content,
      timestamp: new Date(),
      persona,
    };
    this.update({
      messages: [...this.state.messages, message],
    });
    return id;
  }

  updateMessage(id: string, updates: Partial<ChatMessage>): void {
    const messages = this.state.messages.map((m) =>
      m.id === id ? { ...m, ...updates } : m,
    );
    this.update({ messages });
  }

  appendToStreaming(content: string): void {
    this.update({
      streamingContent: this.state.streamingContent + content,
      status: { mode: 'streaming' },
    });
  }

  clearStreaming(): string {
    const content = this.state.streamingContent;
    this.update({ streamingContent: '' });
    return content;
  }

  clearMessages(): void {
    this.update({
      messages: [],
      streamingContent: '',
    });
  }
}

export function createStore(projectPath: string): StateStore {
  return new StateStore(projectPath);
}
