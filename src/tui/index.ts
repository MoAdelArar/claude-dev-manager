#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { createCommandHandler } from './commands/handler.js';
import { createStore } from './state/store.js';
import { createExecutionEngine } from './state/execution.js';

// ANSI codes
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  inverse: '\x1b[7m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  orange: '\x1b[38;5;215m',
  bgBlue: '\x1b[44m',
  bgGray: '\x1b[48;5;238m',
};

const esc = {
  clear: '\x1b[2J\x1b[H',
  clearLine: '\x1b[2K',
  clearToEnd: '\x1b[K',
  saveCursor: '\x1b7',
  restoreCursor: '\x1b8',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  moveUp: (n: number) => `\x1b[${n}A`,
  moveDown: (n: number) => `\x1b[${n}B`,
  moveToColumn: (n: number) => `\x1b[${n}G`,
};

class CDM {
  private projectPath: string;
  private projectName: string = '';
  private isInitialized: boolean = false;
  private commandHandler: ReturnType<typeof createCommandHandler>;
  private store: ReturnType<typeof createStore>;
  private executionEngine: ReturnType<typeof createExecutionEngine>;
  private messages: Array<{ role: string; content: string; time: string }> = [];
  
  // Input state
  private input: string = '';
  private cursorPos: number = 0;
  private history: string[] = [];
  private historyIndex: number = -1;
  private tempInput: string = '';
  
  // Completion state
  private completions: string[] = [];
  private completionIndex: number = -1;
  private showingCompletions: boolean = false;
  private originalInput: string = '';

  constructor() {
    this.projectPath = process.cwd();
    this.store = createStore(this.projectPath);
    this.executionEngine = createExecutionEngine(this.store, this.projectPath);
    this.commandHandler = createCommandHandler(this.projectPath, {
      onClear: () => {
        this.messages = [];
        this.render();
      },
      onExit: () => this.exit(),
    });
    this.checkInit();
  }

  private checkInit(): void {
    const cdmDir = path.join(this.projectPath, '.cdm');
    this.isInitialized = fs.existsSync(cdmDir);
    if (this.isInitialized) {
      try {
        const ctxPath = path.join(cdmDir, 'context', 'project.json');
        if (fs.existsSync(ctxPath)) {
          const data = JSON.parse(fs.readFileSync(ctxPath, 'utf-8'));
          this.projectName = data.name || path.basename(this.projectPath);
        }
      } catch {
        this.projectName = path.basename(this.projectPath);
      }
    }
    if (!this.projectName) {
      this.projectName = path.basename(this.projectPath);
    }
  }

  private setupInput(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    process.stdin.on('data', (key: string) => this.handleKey(key));
  }

  private handleKey(key: string): void {
    // Ctrl+C - exit
    if (key === '\x03') {
      this.exit();
      return;
    }
    
    // Ctrl+L - clear
    if (key === '\x0c') {
      this.messages = [];
      this.render();
      return;
    }

    // Tab - completion
    if (key === '\t') {
      this.handleTab();
      return;
    }

    // Enter - submit or select completion
    if (key === '\r' || key === '\n') {
      if (this.showingCompletions && this.completionIndex >= 0) {
        this.selectCompletion();
      } else {
        this.hideCompletions();
        this.submit();
      }
      return;
    }

    // Escape - cancel completion
    if (key === '\x1b' && !key.startsWith('\x1b[')) {
      if (this.showingCompletions) {
        this.input = this.originalInput;
        this.cursorPos = this.input.length;
        this.hideCompletions();
        this.renderPrompt();
      }
      return;
    }

    // Arrow keys
    if (key === '\x1b[A') { // Up
      if (this.showingCompletions) {
        this.navigateCompletion(-1);
      } else {
        this.historyUp();
      }
      return;
    }
    if (key === '\x1b[B') { // Down
      if (this.showingCompletions) {
        this.navigateCompletion(1);
      } else {
        this.historyDown();
      }
      return;
    }
    // Right arrow - All platforms
    if (key === '\x1b[C' || key === '\x1bOC') {
      if (this.cursorPos < this.input.length) {
        this.cursorPos++;
        this.renderPrompt();
      }
      return;
    }
    
    // Left arrow - All platforms
    if (key === '\x1b[D' || key === '\x1bOD') {
      if (this.cursorPos > 0) {
        this.cursorPos--;
        this.renderPrompt();
      }
      return;
    }
    
    // Move word forward:
    // - Mac: Option+Right = \x1b[1;3C, \x1bf
    // - Linux/Windows: Ctrl+Right = \x1b[1;5C
    // - All: Alt+F = \x1bf
    if (key === '\x1b[1;3C' || key === '\x1bf' || key === '\x1b[1;5C') {
      this.moveWordForward();
      return;
    }
    
    // Move word backward:
    // - Mac: Option+Left = \x1b[1;3D, \x1bb
    // - Linux/Windows: Ctrl+Left = \x1b[1;5D
    // - All: Alt+B = \x1bb
    if (key === '\x1b[1;3D' || key === '\x1bb' || key === '\x1b[1;5D') {
      this.moveWordBackward();
      return;
    }

    // Home - All platforms: \x1b[H, \x1b[1~, \x1bOH, Ctrl+A = \x01
    if (key === '\x1b[H' || key === '\x1b[1~' || key === '\x1bOH' || key === '\x01') {
      this.cursorPos = 0;
      this.renderPrompt();
      return;
    }
    
    // End - All platforms: \x1b[F, \x1b[4~, \x1bOF, Ctrl+E = \x05
    if (key === '\x1b[F' || key === '\x1b[4~' || key === '\x1bOF' || key === '\x05') {
      this.cursorPos = this.input.length;
      this.renderPrompt();
      return;
    }
    
    // Ctrl+U - Clear line (Unix standard)
    if (key === '\x15') {
      this.input = '';
      this.cursorPos = 0;
      this.hideCompletions();
      this.renderPrompt();
      return;
    }
    
    // Ctrl+K - Kill to end of line (Unix standard)  
    if (key === '\x0b') {
      this.input = this.input.slice(0, this.cursorPos);
      this.hideCompletions();
      this.renderPrompt();
      return;
    }

    // Backspace - Mac: \x7f, Windows/Linux: \b or \x7f
    if (key === '\x7f' || key === '\b') {
      if (this.cursorPos > 0) {
        this.input = this.input.slice(0, this.cursorPos - 1) + this.input.slice(this.cursorPos);
        this.cursorPos--;
        this.hideCompletions();
        this.renderPrompt();
      }
      return;
    }

    // Delete word backwards:
    // - Mac: Option+Backspace = \x1b\x7f
    // - Linux/Windows: Ctrl+Backspace = \x08 or \x1b\x08
    // - All: Ctrl+W = \x17
    if (key === '\x1b\x7f' || key === '\x17' || key === '\x1b\x08' || key === '\x08') {
      this.deleteWordBackward();
      return;
    }

    // Delete single char forward - All platforms: \x1b[3~
    if (key === '\x1b[3~') {
      if (this.cursorPos < this.input.length) {
        this.input = this.input.slice(0, this.cursorPos) + this.input.slice(this.cursorPos + 1);
        this.hideCompletions();
        this.renderPrompt();
      }
      return;
    }

    // Delete word forwards:
    // - Mac: Option+Delete = \x1b[3;3~, \x1bd
    // - Linux/Windows: Ctrl+Delete = \x1b[3;5~
    // - All: Alt+D = \x1bd
    if (key === '\x1b[3;3~' || key === '\x1bd' || key === '\x1b[3;5~') {
      this.deleteWordForward();
      return;
    }

    // Regular character
    if (key.length === 1 && key >= ' ') {
      this.input = this.input.slice(0, this.cursorPos) + key + this.input.slice(this.cursorPos);
      this.cursorPos++;
      this.hideCompletions();
      this.renderPrompt();
    }
  }

  private deleteWordBackward(): void {
    if (this.cursorPos > 0) {
      const before = this.input.slice(0, this.cursorPos);
      const after = this.input.slice(this.cursorPos);
      let pos = before.length;
      // Skip trailing spaces
      while (pos > 0 && before[pos - 1] === ' ') pos--;
      // Delete to previous space/start
      while (pos > 0 && before[pos - 1] !== ' ') pos--;
      this.input = before.slice(0, pos) + after;
      this.cursorPos = pos;
      this.hideCompletions();
      this.renderPrompt();
    }
  }

  private deleteWordForward(): void {
    if (this.cursorPos < this.input.length) {
      const before = this.input.slice(0, this.cursorPos);
      const after = this.input.slice(this.cursorPos);
      let pos = 0;
      // Skip leading spaces
      while (pos < after.length && after[pos] === ' ') pos++;
      // Delete to next space/end
      while (pos < after.length && after[pos] !== ' ') pos++;
      this.input = before + after.slice(pos);
      this.hideCompletions();
      this.renderPrompt();
    }
  }

  private moveWordForward(): void {
    // Skip current word
    while (this.cursorPos < this.input.length && this.input[this.cursorPos] !== ' ') {
      this.cursorPos++;
    }
    // Skip spaces
    while (this.cursorPos < this.input.length && this.input[this.cursorPos] === ' ') {
      this.cursorPos++;
    }
    this.renderPrompt();
  }

  private moveWordBackward(): void {
    // Skip spaces
    while (this.cursorPos > 0 && this.input[this.cursorPos - 1] === ' ') {
      this.cursorPos--;
    }
    // Skip word
    while (this.cursorPos > 0 && this.input[this.cursorPos - 1] !== ' ') {
      this.cursorPos--;
    }
    this.renderPrompt();
  }

  private handleTab(): void {
    const trimmed = this.input.trim();
    
    if (!trimmed.startsWith('/')) {
      // Not a command, do nothing
      return;
    }

    const newCompletions = this.commandHandler.getCompletions(trimmed);
    
    if (newCompletions.length === 0) {
      return;
    }

    if (newCompletions.length === 1) {
      // Single match - complete immediately
      this.input = newCompletions[0] + ' ';
      this.cursorPos = this.input.length;
      this.hideCompletions();
      this.renderPrompt();
      return;
    }

    // Multiple matches
    if (!this.showingCompletions) {
      // First Tab - show completions and select first
      this.originalInput = trimmed;
      this.completions = newCompletions;
      this.completionIndex = 0;
      this.showingCompletions = true;
      this.input = this.completions[0];
      this.cursorPos = this.input.length;
    } else {
      // Subsequent Tab - cycle through
      this.completionIndex = (this.completionIndex + 1) % this.completions.length;
      this.input = this.completions[this.completionIndex];
      this.cursorPos = this.input.length;
    }
    
    this.renderPrompt();
    this.renderCompletions();
  }

  private navigateCompletion(direction: number): void {
    if (!this.showingCompletions || this.completions.length === 0) return;
    
    this.completionIndex += direction;
    if (this.completionIndex < 0) this.completionIndex = this.completions.length - 1;
    if (this.completionIndex >= this.completions.length) this.completionIndex = 0;
    
    this.input = this.completions[this.completionIndex];
    this.cursorPos = this.input.length;
    
    this.renderPrompt();
    this.renderCompletions();
  }

  private selectCompletion(): void {
    if (this.completionIndex >= 0 && this.completionIndex < this.completions.length) {
      this.input = this.completions[this.completionIndex] + ' ';
      this.cursorPos = this.input.length;
    }
    this.hideCompletions();
    this.renderPrompt();
  }

  private hideCompletions(): void {
    if (this.showingCompletions) {
      this.showingCompletions = false;
      this.completions = [];
      this.completionIndex = -1;
      // Clear completion line
      process.stdout.write('\n' + esc.clearLine + esc.moveUp(1));
    }
  }

  private renderCompletions(): void {
    if (!this.showingCompletions) return;
    
    const items = this.completions.map((comp, i) => {
      if (i === this.completionIndex) {
        return `${c.bgBlue}${c.bold} ${comp} ${c.reset}`;
      }
      return `${c.gray} ${comp} ${c.reset}`;
    });
    
    process.stdout.write('\n' + esc.clearLine + items.join('  ') + esc.moveUp(1) + esc.moveToColumn(this.cursorPos + 3));
  }

  private historyUp(): void {
    if (this.history.length === 0) return;
    if (this.historyIndex === -1) {
      this.tempInput = this.input;
      this.historyIndex = this.history.length - 1;
    } else if (this.historyIndex > 0) {
      this.historyIndex--;
    }
    this.input = this.history[this.historyIndex];
    this.cursorPos = this.input.length;
    this.renderPrompt();
  }

  private historyDown(): void {
    if (this.historyIndex === -1) return;
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.input = this.history[this.historyIndex];
    } else {
      this.historyIndex = -1;
      this.input = this.tempInput;
    }
    this.cursorPos = this.input.length;
    this.renderPrompt();
  }

  private async submit(): Promise<void> {
    const line = this.input.trim();
    
    // Add newline after input
    process.stdout.write('\n');
    
    if (!line) {
      this.renderPrompt();
      return;
    }

    // Save to history
    if (this.history[this.history.length - 1] !== line) {
      this.history.push(line);
    }
    this.historyIndex = -1;
    this.input = '';
    this.cursorPos = 0;

    // Handle commands
    if (line.startsWith('/')) {
      this.addMessage('user', line);
      this.render();
      this.showStatus('Executing...');

      try {
        const result = await this.commandHandler.execute(line);
        this.addMessage('system', result);
        if (line === '/init') this.checkInit();
      } catch (err) {
        this.addMessage('error', err instanceof Error ? err.message : String(err));
      }

      this.render();
      return;
    }

    // Regular input
    if (!this.isInitialized) {
      this.addMessage('system', 'Project not initialized. Run /init first.');
      this.render();
      return;
    }

    this.addMessage('user', line);
    this.render();
    this.showStatus('Processing...');

    try {
      const result = await this.executionEngine.execute(line, () => {});
      this.addMessage('assistant', result.output);
    } catch (err) {
      this.addMessage('error', err instanceof Error ? err.message : String(err));
    }

    this.render();
  }

  private addMessage(role: string, content: string): void {
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    this.messages.push({ role, content, time });
  }

  private showStatus(msg: string): void {
    process.stdout.write(`\r${esc.clearLine}${c.yellow}⏳ ${msg}${c.reset}`);
  }

  private render(): void {
    process.stdout.write(esc.clear);
    
    // Header
    const w = process.stdout.columns || 80;
    const project = this.isInitialized 
      ? `${c.green}●${c.reset} ${this.projectName}` 
      : `${c.yellow}○${c.reset} Not initialized`;
    const model = `${c.gray}claude-sonnet${c.reset}`;
    const pLen = this.stripAnsi(project).length;
    const mLen = this.stripAnsi(model).length;
    const pad = Math.max(2, w - pLen - mLen - 2);
    
    console.log(`${c.gray}${'─'.repeat(w)}${c.reset}`);
    console.log(`${project}${' '.repeat(pad)}${model}`);
    console.log(`${c.gray}${'─'.repeat(w)}${c.reset}\n`);

    // Content
    if (this.messages.length === 0) {
      console.log(`${c.orange}${c.bold}  CDM - Claude Dev Manager${c.reset}\n`);
      console.log(`${c.gray}  Commands:${c.reset}`);
      console.log(`    ${c.orange}/help${c.reset}     Show all commands`);
      console.log(`    ${c.orange}/init${c.reset}     Initialize project`);
      console.log(`    ${c.orange}/status${c.reset}   Show project status`);
      console.log(`    ${c.orange}/clear${c.reset}    Clear screen\n`);
      console.log(`${c.gray}  Tab${c.reset}: completions  ${c.gray}↑↓${c.reset}: history  ${c.gray}Enter${c.reset}: submit  ${c.gray}Esc${c.reset}: cancel`);
      console.log(`${c.gray}  Ctrl/⌥+←/→${c.reset}: word jump  ${c.gray}Ctrl/⌥+⌫${c.reset}: delete word`);
      console.log(`${c.gray}  Ctrl+A/E${c.reset}: start/end  ${c.gray}Ctrl+U${c.reset}: clear line  ${c.gray}Ctrl+C${c.reset}: exit\n`);
    } else {
      for (const msg of this.messages) {
        this.printMessage(msg);
      }
    }

    this.renderPrompt();
  }

  private printMessage(msg: { role: string; content: string; time: string }): void {
    const colors: Record<string, string> = {
      user: c.blue,
      assistant: c.green,
      system: c.yellow,
      error: c.red,
    };
    const labels: Record<string, string> = {
      user: 'You',
      assistant: 'Assistant', 
      system: 'System',
      error: 'Error',
    };
    const col = colors[msg.role] || c.gray;
    const label = labels[msg.role] || msg.role;

    console.log(`${col}┌─ ${label} ${c.gray}${msg.time}${c.reset}`);
    for (const line of msg.content.split('\n')) {
      console.log(`${col}│${c.reset} ${line}`);
    }
    console.log(`${col}└${c.reset}\n`);
  }

  private renderPrompt(): void {
    const prompt = `${c.orange}❯${c.reset} `;
    process.stdout.write(`\r${esc.clearLine}${prompt}${this.input}${esc.moveToColumn(this.cursorPos + 3)}`);
  }

  private stripAnsi(str: string): string {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  }

  private exit(): void {
    process.stdout.write(esc.clear + esc.showCursor);
    console.log(`\n${c.gray}Goodbye!${c.reset}\n`);
    process.exit(0);
  }

  run(): void {
    this.setupInput();
    this.render();
  }
}

new CDM().run();
