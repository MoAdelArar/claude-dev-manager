import type blessed from 'blessed';
import type { ScreenManager } from '../screen.js';
import { getTheme } from '../theme.js';

export interface InputOptions {
  onSubmit: (value: string) => void;
  onCancel?: () => void;
  getCompletions?: (prefix: string) => string[];
}

export class InputWidget {
  private textbox: blessed.Widgets.TextboxElement;
  private screen: ScreenManager;
  private options: InputOptions;
  private history: string[] = [];
  private historyIndex: number = -1;
  private completions: string[] = [];
  private completionIndex: number = -1;
  private completionBox: blessed.Widgets.BoxElement | null = null;

  constructor(
    textbox: blessed.Widgets.TextboxElement,
    screen: ScreenManager,
    options: InputOptions,
  ) {
    this.textbox = textbox;
    this.screen = screen;
    this.options = options;
    this.setupEvents();
  }

  private setupEvents(): void {
    this.textbox.on('submit', (value: string) => {
      if (value.trim()) {
        this.addToHistory(value);
        this.options.onSubmit(value);
      }
      this.textbox.clearValue();
      this.textbox.focus();
      this.screen.render();
    });

    this.textbox.on('cancel', () => {
      this.hideCompletions();
      if (this.options.onCancel) {
        this.options.onCancel();
      }
    });

    this.textbox.key(['up'], () => {
      this.navigateHistory(-1);
    });

    this.textbox.key(['down'], () => {
      this.navigateHistory(1);
    });

    this.textbox.key(['tab'], () => {
      this.handleTabCompletion();
    });

    this.textbox.key(['escape'], () => {
      this.hideCompletions();
      this.textbox.clearValue();
      this.screen.render();
    });
  }

  private addToHistory(value: string): void {
    if (this.history[this.history.length - 1] !== value) {
      this.history.push(value);
    }
    this.historyIndex = this.history.length;
  }

  private navigateHistory(direction: number): void {
    if (this.history.length === 0) return;

    this.historyIndex += direction;

    if (this.historyIndex < 0) {
      this.historyIndex = 0;
    } else if (this.historyIndex >= this.history.length) {
      this.historyIndex = this.history.length;
      this.textbox.clearValue();
      this.screen.render();
      return;
    }

    this.textbox.setValue(this.history[this.historyIndex]);
    this.screen.render();
  }

  private handleTabCompletion(): void {
    const value = this.textbox.getValue();

    if (!value.startsWith('/')) {
      return;
    }

    if (this.options.getCompletions) {
      const completions = this.options.getCompletions(value);

      if (completions.length === 0) {
        this.hideCompletions();
        return;
      }

      if (completions.length === 1) {
        this.textbox.setValue(completions[0] + ' ');
        this.hideCompletions();
        this.screen.render();
        return;
      }

      this.showCompletions(completions);
    }
  }

  private showCompletions(completions: string[]): void {
    const theme = getTheme();
    this.completions = completions;
    this.completionIndex = 0;

    if (this.completionBox) {
      this.completionBox.destroy();
    }

    const content = completions
      .map((c, i) =>
        i === this.completionIndex ? `{inverse} ${c} {/inverse}` : ` ${c} `,
      )
      .join('\n');

    const box = require('blessed').box({
      parent: this.screen.screen,
      bottom: 5,
      left: 1,
      width: 30,
      height: Math.min(completions.length + 2, 10),
      tags: true,
      content: content,
      border: {
        type: 'line',
      },
      style: {
        fg: theme.colors.fg,
        bg: theme.colors.highlight,
        border: {
          fg: theme.colors.primary,
        },
      },
    });

    this.completionBox = box;

    box.key(['up'], () => {
      this.navigateCompletions(-1);
    });

    box.key(['down'], () => {
      this.navigateCompletions(1);
    });

    box.key(['enter'], () => {
      this.selectCompletion();
    });

    box.key(['escape', 'tab'], () => {
      this.hideCompletions();
      this.textbox.focus();
    });

    box.focus();
    this.screen.render();
  }

  private navigateCompletions(direction: number): void {
    if (!this.completionBox || this.completions.length === 0) return;

    this.completionIndex += direction;

    if (this.completionIndex < 0) {
      this.completionIndex = this.completions.length - 1;
    } else if (this.completionIndex >= this.completions.length) {
      this.completionIndex = 0;
    }

    const content = this.completions
      .map((c, i) =>
        i === this.completionIndex ? `{inverse} ${c} {/inverse}` : ` ${c} `,
      )
      .join('\n');

    this.completionBox.setContent(content);
    this.screen.render();
  }

  private selectCompletion(): void {
    if (this.completionIndex >= 0 && this.completionIndex < this.completions.length) {
      this.textbox.setValue(this.completions[this.completionIndex] + ' ');
    }
    this.hideCompletions();
    this.textbox.focus();
    this.screen.render();
  }

  private hideCompletions(): void {
    if (this.completionBox) {
      this.completionBox.destroy();
      this.completionBox = null;
    }
    this.completions = [];
    this.completionIndex = -1;
    this.screen.render();
  }

  focus(): void {
    this.textbox.focus();
  }

  getValue(): string {
    return this.textbox.getValue();
  }

  setValue(value: string): void {
    this.textbox.setValue(value);
    this.screen.render();
  }

  clear(): void {
    this.textbox.clearValue();
    this.screen.render();
  }
}

export function createInput(
  textbox: blessed.Widgets.TextboxElement,
  screen: ScreenManager,
  options: InputOptions,
): InputWidget {
  return new InputWidget(textbox, screen, options);
}
