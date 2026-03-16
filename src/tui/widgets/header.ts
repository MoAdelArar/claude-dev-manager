import type blessed from 'blessed';
import { getTheme } from '../theme.js';

export interface HeaderState {
  projectName: string;
  projectPath: string;
  model: string;
  persona: string;
  isInitialized: boolean;
}

export class HeaderWidget {
  private box: blessed.Widgets.BoxElement;
  private state: HeaderState;

  constructor(box: blessed.Widgets.BoxElement) {
    this.box = box;
    this.state = {
      projectName: '',
      projectPath: process.cwd(),
      model: 'claude-sonnet-4-20250514',
      persona: 'auto',
      isInitialized: false,
    };
    this.render();
  }

  setState(updates: Partial<HeaderState>): void {
    this.state = { ...this.state, ...updates };
    this.render();
  }

  getState(): HeaderState {
    return { ...this.state };
  }

  private render(): void {
    const theme = getTheme();
    const width = (this.box.width as number) - 4;

    const leftContent = this.state.isInitialized
      ? `{${theme.colors.primary}-fg}●{/} ${this.state.projectName || 'CDM'}`
      : `{${theme.colors.warning}-fg}○{/} Not initialized`;

    const rightContent = `{${theme.colors.muted}-fg}${this.state.persona}{/} | {${theme.colors.secondary}-fg}${this.state.model}{/}`;

    const leftLen = this.stripTags(leftContent).length;
    const rightLen = this.stripTags(rightContent).length;
    const padding = Math.max(0, width - leftLen - rightLen);

    const content = ` ${leftContent}${' '.repeat(padding)}${rightContent} `;
    this.box.setContent(content);
  }

  private stripTags(str: string): string {
    return str.replace(/\{[^}]+\}/g, '');
  }
}

export function createHeader(box: blessed.Widgets.BoxElement): HeaderWidget {
  return new HeaderWidget(box);
}
