#!/usr/bin/env node

import Pastel from 'pastel';
import * as path from 'node:path';
import * as fs from 'node:fs';

const packageJsonPath = path.join(import.meta.dirname, '..', '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

const app = new Pastel({
  importMeta: import.meta,
  name: 'cdm',
  version: packageJson.version,
  description: 'Claude Dev Manager — Multi-agent development management system powered by Claude Code',
});

await app.run();
