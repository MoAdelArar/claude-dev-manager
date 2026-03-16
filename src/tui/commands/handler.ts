import { SlashCommand, CommandCallbacks, createCommandRegistry } from './registry.js';

export class CommandHandler {
  private commands: SlashCommand[];
  private projectPath: string;

  constructor(projectPath: string, callbacks: CommandCallbacks) {
    this.projectPath = projectPath;
    this.commands = createCommandRegistry(callbacks);
  }

  isCommand(input: string): boolean {
    return input.trim().startsWith('/');
  }

  parseCommand(input: string): { name: string; args: string[] } | null {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) return null;

    const parts = trimmed.slice(1).split(/\s+/);
    const name = parts[0]?.toLowerCase() ?? '';
    const args = parts.slice(1);

    return { name, args };
  }

  async execute(input: string): Promise<string> {
    const parsed = this.parseCommand(input);
    if (!parsed) return 'Invalid command';

    const command = this.commands.find((c) => c.name === parsed.name);
    if (!command) {
      return `Unknown command: /${parsed.name}. Type /help for available commands.`;
    }

    return command.handler(parsed.args, this.projectPath);
  }

  getCompletions(partial: string): string[] {
    const trimmed = partial.trim();
    if (!trimmed.startsWith('/')) return [];
    const search = trimmed.slice(1).toLowerCase().trim();
    return this.commands
      .filter((c) => c.name.startsWith(search))
      .map((c) => `/${c.name}`);
  }

  getCommands(): SlashCommand[] {
    return this.commands;
  }
}

export function createCommandHandler(
  projectPath: string,
  callbacks: CommandCallbacks,
): CommandHandler {
  return new CommandHandler(projectPath, callbacks);
}
