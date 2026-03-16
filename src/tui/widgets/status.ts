import type blessed from 'blessed';
import { getTheme } from '../theme.js';

export interface StatusState {
  mode: 'idle' | 'executing' | 'streaming' | 'error';
  tokens?: number;
  duration?: number;
  message?: string;
}

export class StatusWidget {
  private box: blessed.Widgets.BoxElement;
  private state: StatusState;

  constructor(box: blessed.Widgets.BoxElement) {
    this.box = box;
    this.state = { mode: 'idle' };
    this.render();
  }

  setState(updates: Partial<StatusState>): void {
    this.state = { ...this.state, ...updates };
    this.render();
  }

  getState(): StatusState {
    return { ...this.state };
  }

  private render(): void {
    const theme = getTheme();
    const width = (this.box.width as number) - 2;

    const hints = this.getKeyboardHints();
    const statusInfo = this.getStatusInfo();

    const hintsLen = this.stripTags(hints).length;
    const statusLen = this.stripTags(statusInfo).length;
    const padding = Math.max(0, width - hintsLen - statusLen);

    const content = ` ${hints}${' '.repeat(padding)}${statusInfo} `;
    this.box.setContent(content);
  }

  private getKeyboardHints(): string {
    const theme = getTheme();
    const hints = [
      `{${theme.colors.muted}-fg}Enter{/}:Send`,
      `{${theme.colors.muted}-fg}↑↓{/}:History`,
      `{${theme.colors.muted}-fg}Tab{/}:Complete`,
      `{${theme.colors.muted}-fg}Ctrl+C{/}:Exit`,
      `{${theme.colors.muted}-fg}Ctrl+L{/}:Clear`,
    ];
    return hints.join('  ');
  }

  private getStatusInfo(): string {
    const theme = getTheme();

    switch (this.state.mode) {
      case 'executing':
        return `{${theme.colors.warning}-fg}⟳ Executing...{/}`;
      case 'streaming':
        return `{${theme.colors.primary}-fg}◉ Streaming...{/}`;
      case 'error':
        return `{${theme.colors.error}-fg}✗ Error${this.state.message ? `: ${this.state.message}` : ''}{/}`;
      case 'idle':
      default:
        const parts: string[] = [];
        if (this.state.tokens !== undefined) {
          parts.push(`{${theme.colors.muted}-fg}${this.state.tokens} tokens{/}`);
        }
        if (this.state.duration !== undefined) {
          parts.push(`{${theme.colors.muted}-fg}${this.state.duration}ms{/}`);
        }
        if (parts.length === 0) {
          parts.push(`{${theme.colors.success}-fg}● Ready{/}`);
        }
        return parts.join(' | ');
    }
  }

  private stripTags(str: string): string {
    return str.replace(/\{[^}]+\}/g, '');
  }
}

export function createStatus(box: blessed.Widgets.BoxElement): StatusWidget {
  return new StatusWidget(box);
}
