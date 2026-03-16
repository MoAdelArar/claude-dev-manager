import type blessed from 'blessed';
import { getTheme } from '../theme.js';

export type MessageRole = 'user' | 'assistant' | 'system' | 'error';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  persona?: string;
  isStreaming?: boolean;
  artifacts?: string[];
}

export class ChatWidget {
  private box: blessed.Widgets.BoxElement;
  private messages: ChatMessage[] = [];
  private streamingContent: string = '';

  constructor(box: blessed.Widgets.BoxElement) {
    this.box = box;
    this.renderWelcome();
  }

  private renderWelcome(): void {
    const theme = getTheme();
    const welcome = `
{center}{${theme.colors.primary}-fg}╭─────────────────────────────────────╮{/}{/center}
{center}{${theme.colors.primary}-fg}│{/}  {bold}CDM - Claude Dev Manager{/}          {${theme.colors.primary}-fg}│{/}{/center}
{center}{${theme.colors.primary}-fg}╰─────────────────────────────────────╯{/}{/center}

{center}{${theme.colors.muted}-fg}Type a message or use /help for commands{/}{/center}

`;
    this.box.setContent(welcome);
  }

  addMessage(message: ChatMessage): void {
    this.messages.push(message);
    this.render();
  }

  updateMessage(id: string, updates: Partial<ChatMessage>): void {
    const index = this.messages.findIndex((m) => m.id === id);
    if (index !== -1) {
      this.messages[index] = { ...this.messages[index], ...updates };
      this.render();
    }
  }

  appendToStreaming(content: string): void {
    this.streamingContent += content;
    this.render();
  }

  clearStreaming(): void {
    this.streamingContent = '';
  }

  clearMessages(): void {
    this.messages = [];
    this.streamingContent = '';
    this.renderWelcome();
  }

  private render(): void {
    const theme = getTheme();
    let content = '';

    for (const msg of this.messages) {
      content += this.formatMessage(msg);
      content += '\n';
    }

    if (this.streamingContent) {
      content += this.formatStreamingContent();
    }

    this.box.setContent(content);
    this.box.setScrollPerc(100);
  }

  private formatMessage(msg: ChatMessage): string {
    const theme = getTheme();
    const time = this.formatTime(msg.timestamp);

    switch (msg.role) {
      case 'user':
        return `{${theme.colors.userMessage}-fg}┌─ You {${theme.colors.muted}-fg}${time}{/}{/}
{${theme.colors.userMessage}-fg}│{/} ${this.wrapText(msg.content, '│ ')}
{${theme.colors.userMessage}-fg}└{/}`;

      case 'assistant':
        const persona = msg.persona ? ` (${msg.persona})` : '';
        const artifacts =
          msg.artifacts && msg.artifacts.length > 0
            ? `\n{${theme.colors.muted}-fg}│ 📎 Artifacts: ${msg.artifacts.join(', ')}{/}`
            : '';
        return `{${theme.colors.assistantMessage}-fg}┌─ Assistant${persona} {${theme.colors.muted}-fg}${time}{/}{/}
{${theme.colors.assistantMessage}-fg}│{/} ${this.wrapText(msg.content, '│ ')}${artifacts}
{${theme.colors.assistantMessage}-fg}└{/}`;

      case 'system':
        return `{${theme.colors.systemMessage}-fg}┌─ System {${theme.colors.muted}-fg}${time}{/}{/}
{${theme.colors.systemMessage}-fg}│{/} ${this.wrapText(msg.content, '│ ')}
{${theme.colors.systemMessage}-fg}└{/}`;

      case 'error':
        return `{${theme.colors.error}-fg}┌─ Error {${theme.colors.muted}-fg}${time}{/}{/}
{${theme.colors.error}-fg}│{/} ${this.wrapText(msg.content, '│ ')}
{${theme.colors.error}-fg}└{/}`;

      default:
        return msg.content;
    }
  }

  private formatStreamingContent(): string {
    const theme = getTheme();
    return `{${theme.colors.assistantMessage}-fg}┌─ Assistant {${theme.colors.muted}-fg}(streaming...){/}{/}
{${theme.colors.assistantMessage}-fg}│{/} ${this.wrapText(this.streamingContent, '│ ')}{${theme.colors.primary}-fg}▌{/}
{${theme.colors.assistantMessage}-fg}└{/}`;
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private wrapText(text: string, prefix: string): string {
    const width = (this.box.width as number) - prefix.length - 4;
    if (width <= 0) return text;

    const lines = text.split('\n');
    const wrapped: string[] = [];

    for (const line of lines) {
      if (line.length <= width) {
        wrapped.push(line);
      } else {
        let remaining = line;
        while (remaining.length > width) {
          let breakPoint = remaining.lastIndexOf(' ', width);
          if (breakPoint === -1) breakPoint = width;
          wrapped.push(remaining.slice(0, breakPoint));
          remaining = remaining.slice(breakPoint).trim();
        }
        if (remaining) wrapped.push(remaining);
      }
    }

    return wrapped.join(`\n${prefix}`);
  }

  scrollUp(): void {
    this.box.scroll(-3);
  }

  scrollDown(): void {
    this.box.scroll(3);
  }

  scrollToBottom(): void {
    this.box.setScrollPerc(100);
  }
}

export function createChat(box: blessed.Widgets.BoxElement): ChatWidget {
  return new ChatWidget(box);
}
