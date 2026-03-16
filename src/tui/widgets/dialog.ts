import blessed from 'blessed';
import type { ScreenManager } from '../screen.js';
import { getTheme } from '../theme.js';

export type DialogType = 'help' | 'status' | 'confirm' | 'info' | 'error';

export interface DialogOptions {
  title: string;
  content: string;
  type?: DialogType;
  buttons?: string[];
  onClose?: (button?: string) => void;
}

export class DialogWidget {
  private screen: ScreenManager;
  private box: blessed.Widgets.BoxElement | null = null;
  private onCloseCallback?: (button?: string) => void;

  constructor(screen: ScreenManager) {
    this.screen = screen;
  }

  show(options: DialogOptions): void {
    this.close();

    const theme = getTheme();
    const type = options.type ?? 'info';
    this.onCloseCallback = options.onClose;

    const titleColor = this.getTitleColor(type);
    const buttons = options.buttons ?? ['OK'];

    const contentLines = options.content.split('\n').length;
    const height = Math.min(contentLines + 8, Math.floor((this.screen.height as number) * 0.8));
    const width = Math.min(60, Math.floor((this.screen.width as number) * 0.8));

    this.box = blessed.box({
      parent: this.screen.screen,
      top: 'center',
      left: 'center',
      width,
      height,
      tags: true,
      content: this.formatContent(options.content),
      label: ` {${titleColor}-fg}${options.title}{/} `,
      border: {
        type: 'line',
      },
      style: {
        fg: theme.colors.fg,
        bg: theme.colors.highlight,
        border: {
          fg: titleColor,
        },
        label: {
          fg: titleColor,
        },
      },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: '│',
        style: {
          inverse: true,
        },
      },
      keys: true,
      vi: true,
      mouse: true,
    });

    const buttonRow = blessed.box({
      parent: this.box,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      tags: true,
      style: {
        fg: theme.colors.fg,
        bg: theme.colors.highlight,
      },
    });

    const buttonWidth = Math.floor((width - 4) / buttons.length);
    buttons.forEach((label, index) => {
      const button = blessed.button({
        parent: buttonRow,
        bottom: 1,
        left: index * buttonWidth + 2,
        width: buttonWidth - 2,
        height: 1,
        content: `[ ${label} ]`,
        tags: true,
        style: {
          fg: theme.colors.fg,
          bg: theme.colors.highlight,
          focus: {
            fg: theme.colors.bg,
            bg: theme.colors.primary,
          },
          hover: {
            fg: theme.colors.bg,
            bg: theme.colors.primary,
          },
        },
      });

      button.on('press', () => {
        this.close(label);
      });

      if (index === 0) {
        button.focus();
      }
    });

    this.box.key(['escape', 'q'], () => {
      this.close();
    });

    this.box.key(['enter'], () => {
      this.close(buttons[0]);
    });

    this.box.focus();
    this.screen.render();
  }

  private getTitleColor(type: DialogType): string {
    const theme = getTheme();
    switch (type) {
      case 'error':
        return theme.colors.error;
      case 'help':
        return theme.colors.secondary;
      case 'status':
        return theme.colors.success;
      case 'confirm':
        return theme.colors.warning;
      default:
        return theme.colors.primary;
    }
  }

  private formatContent(content: string): string {
    return '\n' + content
      .split('\n')
      .map((line) => ` ${line}`)
      .join('\n') + '\n';
  }

  close(button?: string): void {
    if (this.box) {
      this.box.destroy();
      this.box = null;
      this.screen.render();
    }
    if (this.onCloseCallback) {
      this.onCloseCallback(button);
      this.onCloseCallback = undefined;
    }
  }

  isOpen(): boolean {
    return this.box !== null;
  }

  showHelp(onClose?: () => void): void {
    this.show({
      title: 'Help - CDM Commands',
      type: 'help',
      content: `Available Commands:

  /init              Initialize CDM in current directory
  /analyze           Re-analyze project structure  
  /status            Show project and feature status
  /personas [query]  List personas or resolve for query
  /artifacts         List recent artifacts
  /history           Show development history
  /config            Show current configuration
  /clear             Clear chat history
  /exit              Exit CDM

Keyboard Shortcuts:

  Enter              Submit message
  ↑/↓                Navigate history
  Tab                Command completion
  Ctrl+C             Exit
  Ctrl+L             Clear screen
  Escape             Close dialogs`,
      buttons: ['Close'],
      onClose,
    });
  }

  showConfirm(
    title: string,
    message: string,
    onConfirm: () => void,
    onCancel?: () => void,
  ): void {
    this.show({
      title,
      type: 'confirm',
      content: message,
      buttons: ['Yes', 'No'],
      onClose: (button) => {
        if (button === 'Yes') {
          onConfirm();
        } else if (onCancel) {
          onCancel();
        }
      },
    });
  }

  showError(title: string, message: string, onClose?: () => void): void {
    this.show({
      title,
      type: 'error',
      content: message,
      buttons: ['OK'],
      onClose,
    });
  }

  showInfo(title: string, message: string, onClose?: () => void): void {
    this.show({
      title,
      type: 'info',
      content: message,
      buttons: ['OK'],
      onClose,
    });
  }
}

export function createDialog(screen: ScreenManager): DialogWidget {
  return new DialogWidget(screen);
}
