import json
import asyncio
import structlog
from typing import Optional
from datetime import datetime, timezone

from backend.config import settings
from backend.services.container_service import container_service

logger = structlog.get_logger()


class ClaudeCodeAgent:
    """Runs Claude Code CLI inside a dev container to perform coding tasks."""

    async def run_task(
        self,
        container_id: str,
        task_description: str,
        session_id: str,
        on_event: Optional[callable] = None,
    ) -> dict:
        if on_event:
            await on_event("agent_message", "Launching Claude Code agent...")

        claude_cmd = self._build_claude_command(task_description)

        if on_event:
            await on_event("agent_action", f"$ {' '.join(claude_cmd)}")

        exit_code = 0
        total_cost = 0.0
        total_input_tokens = 0
        total_output_tokens = 0
        result_text = ""
        num_tool_uses = 0

        try:
            async for line in container_service.exec_streaming(
                container_id=container_id,
                command=claude_cmd,
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
                        preview = output[:800]
                        await on_event("command_output", preview)

                elif msg_type == "result":
                    result_text = self._extract_text(parsed) or result_text
                    cost_info = parsed.get("cost_usd") or parsed.get("cost", 0)
                    total_cost = float(cost_info) if cost_info else 0
                    total_input_tokens = parsed.get("input_tokens", 0)
                    total_output_tokens = parsed.get("output_tokens", 0)
                    if on_event:
                        summary_parts = []
                        if total_cost > 0:
                            summary_parts.append(f"Cost: ${total_cost:.4f}")
                        if total_input_tokens or total_output_tokens:
                            summary_parts.append(
                                f"Tokens: {total_input_tokens + total_output_tokens}"
                            )
                        if summary_parts:
                            await on_event("agent_message", f"Session stats: {', '.join(summary_parts)}")

                elif msg_type == "error":
                    error_msg = parsed.get("error", parsed.get("message", str(parsed)))
                    if on_event:
                        await on_event("error", error_msg)

                elif msg_type == "system":
                    content = parsed.get("message", parsed.get("content", ""))
                    if content and on_event:
                        await on_event("agent_message", f"[system] {content}")

                else:
                    # other streaming types (e.g. progress): forward as-is
                    raw = parsed.get("content", parsed.get("message", ""))
                    if raw and on_event:
                        await on_event("agent_message", str(raw)[:500])

        except Exception as e:
            logger.error("claude_code_error", error=str(e), session_id=session_id)
            if on_event:
                await on_event("error", f"Claude Code error: {str(e)}")
            return {
                "success": False,
                "summary": str(e),
                "tokens_used": total_input_tokens + total_output_tokens,
                "exit_code": -1,
            }

        success = exit_code == 0

        if on_event:
            status = "completed successfully" if success else f"exited with code {exit_code}"
            await on_event(
                "agent_message",
                f"Claude Code {status}. Tool calls: {num_tool_uses}",
            )

        return {
            "success": success,
            "summary": result_text[:500] if result_text else ("Task completed" if success else "Task failed"),
            "tokens_used": total_input_tokens + total_output_tokens,
            "exit_code": exit_code,
            "cost_usd": total_cost,
            "tool_uses": num_tool_uses,
        }

    def _build_claude_command(self, task_description: str) -> list[str]:
        cmd = [
            "claude",
            "-p",                              # print mode (non-interactive)
            "--output-format", "stream-json",   # structured streaming JSON
            "--verbose",
            "--dangerously-skip-permissions",   # no interactive permission prompts
        ]

        if settings.CLAUDE_CODE_MAX_TURNS > 0:
            cmd.extend(["--max-turns", str(settings.CLAUDE_CODE_MAX_TURNS)])

        if settings.CLAUDE_CODE_MODEL:
            cmd.extend(["--model", settings.CLAUDE_CODE_MODEL])

        system_prompt = (
            "You are working inside an AdelBot dev container. "
            "The repository is cloned at /workspace. "
            "Complete the task thoroughly: read the codebase, make changes, "
            "install dependencies if needed, run tests if they exist, "
            "and make sure everything works. "
            "After finishing, do a final check that nothing is broken."
        )
        cmd.extend(["--system-prompt", system_prompt])

        cmd.append(task_description)

        return cmd

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
        if "message" in parsed:
            return str(parsed["message"])
        if "text" in parsed:
            return str(parsed["text"])
        return ""

    def _summarize_tool_input(self, parsed: dict) -> str:
        tool_input = parsed.get("input", parsed.get("tool_input", {}))
        if isinstance(tool_input, str):
            return tool_input[:200]
        if isinstance(tool_input, dict):
            if "command" in tool_input:
                return tool_input["command"][:200]
            if "file_path" in tool_input:
                action = "Write" if "content" in tool_input else "Read"
                return f"{action}: {tool_input['file_path']}"
            if "path" in tool_input:
                return f"Path: {tool_input['path']}"
            if "pattern" in tool_input:
                return f"Search: {tool_input['pattern']}"
            return json.dumps(tool_input, default=str)[:200]
        return str(tool_input)[:200]

    def _extract_tool_output(self, parsed: dict) -> str:
        output = parsed.get("output", parsed.get("content", ""))
        if isinstance(output, str):
            return output
        if isinstance(output, list):
            parts = []
            for block in output:
                if isinstance(block, dict):
                    parts.append(block.get("text", block.get("content", str(block))))
                else:
                    parts.append(str(block))
            return "\n".join(parts)
        return str(output)


agent_service = ClaudeCodeAgent()
