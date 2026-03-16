import blessed from 'blessed';
import type { ScreenManager } from './screen.js';
import { getTheme, styleBox } from './theme.js';

export interface LayoutWidgets {
  header: blessed.Widgets.BoxElement;
  chat: blessed.Widgets.BoxElement;
  input: blessed.Widgets.TextboxElement;
  status: blessed.Widgets.BoxElement;
}

export class LayoutManager {
  private screen: ScreenManager;
  public widgets: LayoutWidgets;

  constructor(screen: ScreenManager) {
    this.screen = screen;
    this.widgets = this.createWidgets();
    this.attachWidgets();
  }

  private createWidgets(): LayoutWidgets {
    const theme = getTheme();

    const header = blessed.box({
      parent: this.screen.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      tags: true,
      content: '',
      border: {
        type: 'line',
      },
      style: {
        fg: theme.colors.fg,
        bg: theme.colors.bg,
        border: {
          fg: theme.colors.border,
        },
      },
    });

    const chat = blessed.box({
      parent: this.screen.screen,
      top: 3,
      left: 0,
      width: '100%',
      height: '100%-8',
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: '│',
        track: {
          bg: theme.colors.bg,
        },
        style: {
          inverse: true,
        },
      },
      keys: true,
      vi: true,
      mouse: true,
      content: '',
      style: {
        fg: theme.colors.fg,
        bg: theme.colors.bg,
      },
    });

    const input = blessed.textbox({
      parent: this.screen.screen,
      bottom: 2,
      left: 0,
      width: '100%',
      height: 3,
      tags: true,
      inputOnFocus: true,
      border: {
        type: 'line',
      },
      style: {
        fg: theme.colors.fg,
        bg: theme.colors.bg,
        border: {
          fg: theme.colors.primary,
        },
        focus: {
          border: {
            fg: theme.colors.primary,
          },
        },
      },
    });

    const status = blessed.box({
      parent: this.screen.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 2,
      tags: true,
      content: '',
      style: {
        fg: theme.colors.muted,
        bg: theme.colors.highlight,
      },
    });

    return { header, chat, input, status };
  }

  private attachWidgets(): void {
    this.screen.screen.append(this.widgets.header);
    this.screen.screen.append(this.widgets.chat);
    this.screen.screen.append(this.widgets.input);
    this.screen.screen.append(this.widgets.status);
  }

  focusInput(): void {
    this.widgets.input.focus();
  }

  render(): void {
    this.screen.render();
  }

  scrollChatToBottom(): void {
    this.widgets.chat.setScrollPerc(100);
  }

  appendToChat(content: string): void {
    const currentContent = this.widgets.chat.getContent();
    this.widgets.chat.setContent(currentContent + content);
    this.scrollChatToBottom();
    this.render();
  }

  setChat(content: string): void {
    this.widgets.chat.setContent(content);
    this.scrollChatToBottom();
    this.render();
  }

  clearChat(): void {
    this.widgets.chat.setContent('');
    this.render();
  }

  setHeader(content: string): void {
    this.widgets.header.setContent(content);
    this.render();
  }

  setStatus(content: string): void {
    this.widgets.status.setContent(content);
    this.render();
  }

  getInputValue(): string {
    return this.widgets.input.getValue();
  }

  clearInput(): void {
    this.widgets.input.clearValue();
    this.render();
  }
}

export function createLayout(screen: ScreenManager): LayoutManager {
  return new LayoutManager(screen);
}
