import blessed from 'blessed';

export interface ScreenOptions {
  title?: string;
  smartCSR?: boolean;
  fullUnicode?: boolean;
}

export class ScreenManager {
  public screen: blessed.Widgets.Screen;
  private isDestroyed = false;

  constructor(options: ScreenOptions = {}) {
    this.screen = blessed.screen({
      smartCSR: options.smartCSR ?? true,
      fullUnicode: options.fullUnicode ?? true,
      title: options.title ?? 'CDM - Claude Dev Manager',
      debug: false,
      warnings: false,
    });

    this.setupGlobalKeys();
  }

  private setupGlobalKeys(): void {
    this.screen.key(['C-c'], () => {
      this.destroy();
      process.exit(0);
    });

    this.screen.on('resize', () => {
      this.screen.render();
    });
  }

  render(): void {
    if (!this.isDestroyed) {
      this.screen.render();
    }
  }

  destroy(): void {
    if (!this.isDestroyed) {
      this.isDestroyed = true;
      this.screen.destroy();
    }
  }

  onKey(keys: string | string[], callback: () => void): void {
    this.screen.key(keys, callback);
  }

  get width(): number {
    return this.screen.width as number;
  }

  get height(): number {
    return this.screen.height as number;
  }
}

export function createScreen(options?: ScreenOptions): ScreenManager {
  return new ScreenManager(options);
}
