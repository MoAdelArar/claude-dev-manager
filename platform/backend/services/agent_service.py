import json
import asyncio
import structlog
from typing import Optional
from datetime import datetime, timezone

from backend.config import settings
from backend.services.container_service import container_service

logger = structlog.get_logger()

EXECUTION_MODE_CLAUDE = "claude"
EXECUTION_MODE_CDM = "cdm"


class AgentService:
    """
    Runs either Claude Code CLI or CDM (Claude Dev Manager) pipeline
    inside a dev container to perform coding tasks.

    Modes:
      - "claude": Quick single-agent mode. Runs `claude -p` for fast tasks.
      - "cdm":    Full 18-agent pipeline. Runs `cdm start` for comprehensive
                  development (requirements → architecture → implementation →
                  code review → testing → security → docs → deployment).
    """

    async def run_task(
        self,
        container_id: str,
        task_description: str,
        session_id: str,
        execution_mode: str = EXECUTION_MODE_CLAUDE,
        on_event: Optional[callable] = None,
    ) -> dict:
        if execution_mode == EXECUTION_MODE_CDM:
            return await self._run_cdm_pipeline(
                container_id, task_description, session_id, on_event
            )
        return await self._run_claude_code(
            container_id, task_description, session_id, on_event
        )

    # ─── Claude Code (quick mode) ─────────────────────────────────

    async def _run_claude_code(
        self,
        container_id: str,
        task_description: str,
        session_id: str,
        on_event: Optional[callable] = None,
    ) -> dict:
        if on_event:
            await on_event("agent_message", "Launching Claude Code agent...")

        cmd = self._build_claude_command(task_description)

        if on_event:
            await on_event("agent_action", f"$ {' '.join(cmd)}")

        return await self._stream_command(container_id, cmd, session_id, on_event)

    def _build_claude_command(self, task_description: str) -> list[str]:
        cmd = [
            "claude", "-p",
            "--output-format", "stream-json",
            "--verbose",
            "--dangerously-skip-permissions",
        ]
        if settings.CLAUDE_CODE_MAX_TURNS > 0:
            cmd.extend(["--max-turns", str(settings.CLAUDE_CODE_MAX_TURNS)])
        if settings.CLAUDE_CODE_MODEL:
            cmd.extend(["--model", settings.CLAUDE_CODE_MODEL])

        cmd.extend([
            "--system-prompt",
            "You are working inside an AdelBot dev container. "
            "The repository is cloned at /workspace. "
            "Complete the task thoroughly: read the codebase, make changes, "
            "install dependencies if needed, run tests if they exist, "
            "and make sure everything works.",
        ])
        cmd.append(task_description)
        return cmd

    # ─── CDM Pipeline (full mode) ─────────────────────────────────

    async def _run_cdm_pipeline(
        self,
        container_id: str,
        task_description: str,
        session_id: str,
        on_event: Optional[callable] = None,
    ) -> dict:
        if on_event:
            await on_event("agent_message", "Launching CDM 18-agent pipeline...")

        cdm_available = await self._check_cdm_available(container_id)
        if not cdm_available:
            if on_event:
                await on_event("agent_message", "CDM not found, installing from GitHub...")
            install_result = await container_service.exec_command(
                container_id,
                "cd /opt/cdm 2>/dev/null && npm link 2>/dev/null || "
                "(git clone --depth 1 https://github.com/MoAdelArar/claude-dev-manager.git /opt/cdm && "
                "cd /opt/cdm && npm install && npm run build && npm link)",
            )
            if install_result["exit_code"] != 0:
                if on_event:
                    await on_event("error", f"CDM install failed: {install_result['output'][:300]}")
                if on_event:
                    await on_event("agent_message", "Falling back to Claude Code quick mode...")
                return await self._run_claude_code(
                    container_id, task_description, session_id, on_event
                )

        init_result = await container_service.exec_command(container_id, "cdm init --non-interactive")
        if on_event and init_result["exit_code"] == 0:
            await on_event("agent_action", "[CDM] Project initialized")

        cmd = self._build_cdm_command(task_description)

        if on_event:
            await on_event("agent_action", f"$ {' '.join(cmd)}")

        return await self._stream_command(container_id, cmd, session_id, on_event)

    async def _check_cdm_available(self, container_id: str) -> bool:
        result = await container_service.exec_command(container_id, "which cdm")
        return result["exit_code"] == 0

    def _build_cdm_command(self, task_description: str) -> list[str]:
        cmd = [
            "cdm", "start",
            "--name", task_description[:80],
            "--description", task_description,
            "--priority", "high",
            "--mode", "claude-cli",
            "--non-interactive",
        ]
        return cmd

    # ─── Shared streaming logic ───────────────────────────────────

    async def _stream_command(
        self,
        container_id: str,
        cmd: list[str],
        session_id: str,
        on_event: Optional[callable] = None,
    ) -> dict:
        exit_code = 0
        total_input_tokens = 0
        total_output_tokens = 0
        result_text = ""
        num_tool_uses = 0

        try:
            async for line in container_service.exec_streaming(
                container_id=container_id,
                command=cmd,
                workdir="/workspace",
            ):
                if line.startswith("__EXIT_CODE__:"):
                    exit_code = int(line.split(":", 1)[1])
                    continue
                if line.startswith("__EXEC_ERROR__:"):
                    error_msg = line.split(":", 1)[1]
                    if on_event:
                        await on_event("error", f"Execution error: {error_msg}")
                    return {
                        "success": False,
                        "summary": f"Execution error: {error_msg}",
                        "tokens_used": 0,
                        "exit_code": -1,
                    }

                parsed = self._parse_stream_line(line)
                if parsed is None:
                    continue

                msg_type = parsed.get("type", "")

                if msg_type == "assistant":
                    content = self._extract_text(parsed)
                    if content and on_event:
                        await on_event("agent_message", content)
                    result_text = content or result_text

                elif msg_type == "tool_use":
                    num_tool_uses += 1
                    tool_name = parsed.get("tool", parsed.get("name", "unknown"))
                    tool_input_summary = self._summarize_tool_input(parsed)
                    if on_event:
                        await on_event("agent_action", f"[{tool_name}] {tool_input_summary}")

                elif msg_type == "tool_result":
                    output = self._extract_tool_output(parsed)
                    if output and on_event:
                        await on_event("command_output", output[:800])

                elif msg_type == "result":
                    result_text = self._extract_text(parsed) or result_text
                    total_input_tokens = parsed.get("input_tokens", 0)
                    total_output_tokens = parsed.get("output_tokens", 0)
                    if on_event:
                        parts = []
                        cost = parsed.get("cost_usd") or parsed.get("cost", 0)
                        if cost:
                            parts.append(f"Cost: ${float(cost):.4f}")
                        if total_input_tokens or total_output_tokens:
                            parts.append(f"Tokens: {total_input_tokens + total_output_tokens}")
                        if parts:
                            await on_event("agent_message", f"Stats: {', '.join(parts)}")

                elif msg_type == "error":
                    if on_event:
                        await on_event("error", parsed.get("error", parsed.get("message", str(parsed))))

                else:
                    raw = parsed.get("content", parsed.get("message", ""))
                    if raw and on_event:
                        await on_event("agent_message", str(raw)[:500])

        except Exception as e:
            logger.error("agent_error", error=str(e), session_id=session_id)
            if on_event:
                await on_event("error", f"Agent error: {str(e)}")
            return {
                "success": False,
                "summary": str(e),
                "tokens_used": total_input_tokens + total_output_tokens,
                "exit_code": -1,
            }

        success = exit_code == 0

        if on_event:
            status = "completed successfully" if success else f"exited with code {exit_code}"
            await on_event("agent_message", f"Agent {status}. Tool calls: {num_tool_uses}")

        return {
            "success": success,
            "summary": result_text[:500] if result_text else ("Task completed" if success else "Task failed"),
            "tokens_used": total_input_tokens + total_output_tokens,
            "exit_code": exit_code,
            "tool_uses": num_tool_uses,
        }

    def _parse_stream_line(self, line: str) -> Optional[dict]:
        line = line.strip()
        if not line:
            return None
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            if line and not line.startswith("{"):
                return {"type": "assistant", "content": line}
            return None

    def _extract_text(self, parsed: dict) -> str:
        if "content" in parsed:
            content = parsed["content"]
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                parts = []
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        parts.append(block.get("text", ""))
                    elif isinstance(block, str):
                        parts.append(block)
                return "\n".join(parts)
        for key in ("message", "text"):
            if key in parsed:
                return str(parsed[key])
        return ""

    def _summarize_tool_input(self, parsed: dict) -> str:
        tool_input = parsed.get("input", parsed.get("tool_input", {}))
        if isinstance(tool_input, str):
            return tool_input[:200]
        if isinstance(tool_input, dict):
            for key in ("command", "file_path", "path", "pattern"):
                if key in tool_input:
                    prefix = {"command": "", "file_path": "File: ", "path": "Path: ", "pattern": "Search: "}.get(key, "")
                    return f"{prefix}{tool_input[key]}"[:200]
            return json.dumps(tool_input, default=str)[:200]
        return str(tool_input)[:200]

    def _extract_tool_output(self, parsed: dict) -> str:
        output = parsed.get("output", parsed.get("content", ""))
        if isinstance(output, str):
            return output
        if isinstance(output, list):
            return "\n".join(
                b.get("text", b.get("content", str(b))) if isinstance(b, dict) else str(b)
                for b in output
            )
        return str(output)


agent_service = AgentService()
