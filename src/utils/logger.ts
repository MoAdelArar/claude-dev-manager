import winston from 'winston';
import chalk from 'chalk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AgentRole, PipelineStage } from '../types';

const AGENT_COLORS: Record<AgentRole, (text: string) => string> = {
  [AgentRole.PRODUCT_MANAGER]: chalk.magenta,
  [AgentRole.ENGINEERING_MANAGER]: chalk.blue,
  [AgentRole.SYSTEM_ARCHITECT]: chalk.cyan,
  [AgentRole.UI_DESIGNER]: chalk.yellow,
  [AgentRole.SENIOR_DEVELOPER]: chalk.green,
  [AgentRole.JUNIOR_DEVELOPER]: chalk.greenBright,
  [AgentRole.CODE_REVIEWER]: chalk.red,
  [AgentRole.QA_ENGINEER]: chalk.yellowBright,
  [AgentRole.SECURITY_ENGINEER]: chalk.redBright,
  [AgentRole.DEVOPS_ENGINEER]: chalk.blueBright,
  [AgentRole.DOCUMENTATION_WRITER]: chalk.white,
};

const STAGE_ICONS: Record<PipelineStage, string> = {
  [PipelineStage.REQUIREMENTS_GATHERING]: '📋',
  [PipelineStage.ARCHITECTURE_DESIGN]: '🏗️',
  [PipelineStage.UI_UX_DESIGN]: '🎨',
  [PipelineStage.TASK_BREAKDOWN]: '📝',
  [PipelineStage.IMPLEMENTATION]: '💻',
  [PipelineStage.CODE_REVIEW]: '🔍',
  [PipelineStage.TESTING]: '🧪',
  [PipelineStage.SECURITY_REVIEW]: '🔒',
  [PipelineStage.DOCUMENTATION]: '📚',
  [PipelineStage.DEPLOYMENT]: '🚀',
  [PipelineStage.COMPLETED]: '✅',
};

const customFormat = winston.format.printf(({ level, message, timestamp, agent, stage }) => {
  const ts = chalk.gray(`[${timestamp}]`);
  const agentTag = agent
    ? AGENT_COLORS[agent as AgentRole]?.(`[${agent}]`) ?? `[${agent}]`
    : '';
  const stageTag = stage
    ? `${STAGE_ICONS[stage as PipelineStage] ?? ''} `
    : '';
  return `${ts} ${level} ${stageTag}${agentTag} ${message}`;
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
  stage?: PipelineStage,
  level: string = 'info',
): void {
  logger.log({ level, message, agent: role, stage });
}

export function stageLog(
  stage: PipelineStage,
  message: string,
  level: string = 'info',
): void {
  logger.log({ level, message, stage });
}

export function pipelineLog(message: string, level: string = 'info'): void {
  logger.log({ level, message: chalk.bold(message) });
}

export default logger;
