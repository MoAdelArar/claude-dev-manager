import winston from 'winston';
import chalk from 'chalk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AgentRole } from '../types';

const AGENT_COLORS: Record<AgentRole, (text: string) => string> = {
  [AgentRole.PLANNER]: chalk.magenta,
  [AgentRole.ARCHITECT]: chalk.cyan,
  [AgentRole.DEVELOPER]: chalk.green,
  [AgentRole.REVIEWER]: chalk.yellow,
  [AgentRole.OPERATOR]: chalk.blue,
};

const customFormat = winston.format.printf(({ level, message, timestamp, agent, step }) => {
  const ts = chalk.gray(`[${timestamp}]`);
  const agentTag = agent
    ? AGENT_COLORS[agent as AgentRole]?.(`[${agent}]`) ?? `[${agent}]`
    : '';
  const stepTag = step ? chalk.dim(`[${step}] `) : '';
  return `${ts} ${level} ${stepTag}${agentTag} ${message}`;
});

const logger = winston.createLogger({
  level: process.env.CDM_LOG_LEVEL ?? 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.colorize(),
    customFormat,
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

export function addFileTransport(projectPath: string): void {
  const logDir = path.join(projectPath, '.cdm', 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  logger.add(
    new winston.transports.File({
      filename: path.join(logDir, 'cdm-error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
    }),
  );
  logger.add(
    new winston.transports.File({
      filename: path.join(logDir, 'cdm-combined.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
    }),
  );
}

export function agentLog(
  role: AgentRole,
  message: string,
  step?: string,
  level: string = 'info',
): void {
  logger.log({ level, message, agent: role, step });
}

export function stepLog(
  step: string,
  message: string,
  level: string = 'info',
): void {
  logger.log({ level, message, step });
}

export function pipelineLog(message: string, level: string = 'info'): void {
  logger.log({ level, message: chalk.bold(message) });
}

export default logger;
