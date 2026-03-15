/**
 * Logger for CDM with persona-based logging support.
 */

import winston from 'winston';
import chalk from 'chalk';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PERSONA_COLORS = [
  chalk.magenta,
  chalk.cyan,
  chalk.green,
  chalk.yellow,
  chalk.blue,
  chalk.red,
  chalk.white,
];

function getPersonaColor(personaId: string): (text: string) => string {
  let hash = 0;
  for (let i = 0; i < personaId.length; i++) {
    hash = (hash << 5) - hash + personaId.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % PERSONA_COLORS.length;
  return PERSONA_COLORS[idx]!;
}

const customFormat = winston.format.printf(({ level, message, timestamp, persona, step }) => {
  const ts = chalk.gray(`[${timestamp}]`);
  const personaTag = persona
    ? getPersonaColor(persona as string)(`[${persona}]`)
    : '';
  const stepTag = step ? chalk.dim(`[${step}] `) : '';
  return `${ts} ${level} ${stepTag}${personaTag} ${message}`;
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

export function personaLog(
  personaId: string,
  message: string,
  step?: string,
  level: string = 'info',
): void {
  logger.log({ level, message, persona: personaId, step });
}

export function stepLog(
  step: string,
  message: string,
  level: string = 'info',
): void {
  logger.log({ level, message, step });
}

export function executionLog(message: string, level: string = 'info'): void {
  logger.log({ level, message: chalk.bold(message) });
}

export default logger;
