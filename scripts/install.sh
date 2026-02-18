#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Claude Dev Manager — Claude Code Plugin Installer ==="
echo ""

# 1. Install dependencies and build
echo "[1/3] Installing dependencies and building..."
cd "$PROJECT_DIR"
npm install
npm run build

# 2. Register the MCP server with Claude Code
echo "[2/3] Registering MCP server with Claude Code..."
CLAUDE_CONFIG_DIR="$HOME/.claude"
MCP_CONFIG="$CLAUDE_CONFIG_DIR/mcp_servers.json"
mkdir -p "$CLAUDE_CONFIG_DIR"

SERVER_PATH="$PROJECT_DIR/dist/mcp-server.js"

if [ -f "$MCP_CONFIG" ]; then
  node -e "
    const fs = require('fs');
    const config = JSON.parse(fs.readFileSync('$MCP_CONFIG', 'utf-8'));
    config['claude-dev-manager'] = { command: 'node', args: ['$SERVER_PATH'] };
    fs.writeFileSync('$MCP_CONFIG', JSON.stringify(config, null, 2));
  "
else
  cat > "$MCP_CONFIG" << MCPEOF
{
  "claude-dev-manager": {
    "command": "node",
    "args": ["$SERVER_PATH"]
  }
}
MCPEOF
fi
echo "  Registered at: $MCP_CONFIG"

# 3. Install slash commands
echo "[3/3] Installing slash commands..."
COMMANDS_DEST="$CLAUDE_CONFIG_DIR/commands"
mkdir -p "$COMMANDS_DEST"

for cmd_file in "$PROJECT_DIR/commands"/*.md; do
  cmd_name="$(basename "$cmd_file")"
  cp "$cmd_file" "$COMMANDS_DEST/$cmd_name"
  echo "  Installed /${cmd_name%.md}"
done

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Two ways to use CDM:"
echo ""
echo "  1. CLI (terminal):"
echo "     cdm init && cdm start \"your feature\""
echo ""
echo "  2. Claude Code (slash commands):"
echo "     /cdm-init"
echo "     /cdm-start Add user authentication"
echo "     /cdm-status"
echo ""
echo "Restart Claude Code to activate the plugin."
