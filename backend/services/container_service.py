import asyncio
import docker
import docker.errors
import structlog
from typing import Optional, AsyncGenerator
from datetime import datetime, timezone

from backend.config import settings

logger = structlog.get_logger()


class ContainerService:
    def __init__(self):
        self._client: Optional[docker.DockerClient] = None
        self._api_client: Optional[docker.APIClient] = None

    @property
    def client(self) -> docker.DockerClient:
        if self._client is None:
            self._client = docker.DockerClient(base_url=settings.DOCKER_HOST)
        return self._client

    @property
    def api(self) -> docker.APIClient:
        if self._api_client is None:
            self._api_client = docker.APIClient(base_url=settings.DOCKER_HOST)
        return self._api_client

    def _ensure_network(self):
        try:
            self.client.networks.get(settings.CONTAINER_NETWORK)
        except docker.errors.NotFound:
            self.client.networks.create(settings.CONTAINER_NETWORK, driver="bridge")
            logger.info("network_created", network=settings.CONTAINER_NETWORK)

    async def create_dev_container(
        self,
        session_id: str,
        repo_clone_url: str,
        branch: str,
        github_token: str,
        anthropic_api_key: str,
        language: Optional[str] = None,
    ) -> dict:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self._create_dev_container_sync,
            session_id, repo_clone_url, branch, github_token, anthropic_api_key, language,
        )

    def _create_dev_container_sync(
        self,
        session_id: str,
        repo_clone_url: str,
        branch: str,
        github_token: str,
        anthropic_api_key: str,
        language: Optional[str] = None,
    ) -> dict:
        self._ensure_network()

        image = self._select_image(language)
        container_name = f"adelbot-dev-{session_id[:12]}"

        authenticated_url = repo_clone_url.replace(
            "https://", f"https://x-access-token:{github_token}@"
        )

        env = {
            "SESSION_ID": session_id,
            "REPO_URL": authenticated_url,
            "BRANCH": branch,
            "GITHUB_TOKEN": github_token,
            "ANTHROPIC_API_KEY": anthropic_api_key,
            "WORKSPACE_DIR": "/workspace",
            "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
        }

        container = self.client.containers.run(
            image,
            name=container_name,
            detach=True,
            environment=env,
            working_dir="/workspace",
            mem_limit=settings.CONTAINER_MEMORY_LIMIT,
            nano_cpus=int(settings.CONTAINER_CPU_LIMIT * 1e9),
            network=settings.CONTAINER_NETWORK,
            labels={
                "adelbot.session_id": session_id,
                "adelbot.created_at": datetime.now(timezone.utc).isoformat(),
            },
            command="sleep infinity",
        )

        self._clone_repo_in_container(container, authenticated_url, branch)

        logger.info(
            "container_created",
            container_id=container.id[:12],
            session_id=session_id,
            image=image,
        )

        return {
            "container_id": container.id,
            "container_name": container_name,
            "image": image,
            "status": "running",
        }

    def _clone_repo_in_container(self, container, repo_url: str, branch: str):
        exit_code, output = container.exec_run(
            f"git clone --branch {branch} --single-branch {repo_url} /workspace",
            workdir="/",
        )
        if exit_code != 0:
            logger.error("clone_failed", output=output.decode())
            raise RuntimeError(f"Failed to clone repository: {output.decode()}")

        container.exec_run("git config user.email 'adelbot@adelbot.dev'", workdir="/workspace")
        container.exec_run("git config user.name 'AdelBot (Claude Code)'", workdir="/workspace")

    def _select_image(self, language: Optional[str]) -> str:
        language_images = {
            "python": f"{settings.CONTAINER_IMAGE_PREFIX}-python:latest",
            "javascript": f"{settings.CONTAINER_IMAGE_PREFIX}-node:latest",
            "typescript": f"{settings.CONTAINER_IMAGE_PREFIX}-node:latest",
            "java": f"{settings.CONTAINER_IMAGE_PREFIX}-java:latest",
            "go": f"{settings.CONTAINER_IMAGE_PREFIX}-go:latest",
            "rust": f"{settings.CONTAINER_IMAGE_PREFIX}-rust:latest",
            "ruby": f"{settings.CONTAINER_IMAGE_PREFIX}-ruby:latest",
        }
        return language_images.get(
            (language or "").lower(),
            f"{settings.CONTAINER_IMAGE_PREFIX}-universal:latest",
        )

    async def exec_command(
        self, container_id: str, command: str, workdir: str = "/workspace"
    ) -> dict:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self._exec_command_sync, container_id, command, workdir
        )

    def _exec_command_sync(self, container_id: str, command: str, workdir: str) -> dict:
        container = self.client.containers.get(container_id)
        exit_code, output = container.exec_run(
            ["bash", "-c", command],
            workdir=workdir,
        )
        decoded = output.decode("utf-8", errors="replace")
        return {"exit_code": exit_code, "output": decoded}

    async def exec_streaming(
        self,
        container_id: str,
        command: list[str],
        workdir: str = "/workspace",
        env: Optional[dict] = None,
    ) -> AsyncGenerator[str, None]:
        """Execute a command and yield output lines as they arrive."""
        loop = asyncio.get_event_loop()
        queue: asyncio.Queue[Optional[str]] = asyncio.Queue()

        def _run_streaming():
            try:
                exec_id = self.api.exec_create(
                    container_id,
                    command,
                    workdir=workdir,
                    environment=env,
                    stdout=True,
                    stderr=True,
                )
                stream = self.api.exec_start(exec_id, stream=True, demux=False)
                buffer = ""
                for chunk in stream:
                    text = chunk.decode("utf-8", errors="replace")
                    buffer += text
                    while "\n" in buffer:
                        line, buffer = buffer.split("\n", 1)
                        loop.call_soon_threadsafe(queue.put_nowait, line)
                if buffer:
                    loop.call_soon_threadsafe(queue.put_nowait, buffer)

                exit_info = self.api.exec_inspect(exec_id)
                exit_code = exit_info.get("ExitCode", -1)
                loop.call_soon_threadsafe(
                    queue.put_nowait, f"__EXIT_CODE__:{exit_code}"
                )
            except Exception as e:
                loop.call_soon_threadsafe(
                    queue.put_nowait, f"__EXEC_ERROR__:{str(e)}"
                )
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, None)

        asyncio.get_event_loop().run_in_executor(None, _run_streaming)

        while True:
            line = await queue.get()
            if line is None:
                break
            yield line

    async def git_commit_and_push(
        self,
        container_id: str,
        commit_message: str,
        branch: str,
    ) -> dict:
        add_result = await self.exec_command(container_id, "git add -A")
        if add_result["exit_code"] != 0:
            raise RuntimeError(f"Git add failed: {add_result['output']}")

        diff_result = await self.exec_command(container_id, "git diff --cached --stat")
        files_changed = len([
            l for l in diff_result["output"].strip().split("\n")
            if l.strip() and "|" in l
        ])

        commit_result = await self.exec_command(
            container_id, f'git commit -m "{commit_message}"'
        )
        if commit_result["exit_code"] != 0 and "nothing to commit" not in commit_result["output"]:
            raise RuntimeError(f"Git commit failed: {commit_result['output']}")

        push_result = await self.exec_command(container_id, f"git push origin {branch}")
        if push_result["exit_code"] != 0:
            raise RuntimeError(f"Git push failed: {push_result['output']}")

        sha_result = await self.exec_command(container_id, "git rev-parse HEAD")

        return {
            "commit_sha": sha_result["output"].strip(),
            "diff_stat": diff_result["output"],
            "push_output": push_result["output"],
            "files_changed": files_changed,
        }

    async def destroy_container(self, container_id: str) -> None:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._destroy_container_sync, container_id)

    def _destroy_container_sync(self, container_id: str) -> None:
        try:
            container = self.client.containers.get(container_id)
            container.stop(timeout=10)
            container.remove(force=True)
            logger.info("container_destroyed", container_id=container_id[:12])
        except docker.errors.NotFound:
            logger.warning("container_not_found", container_id=container_id[:12])
        except Exception as e:
            logger.error("container_destroy_failed", error=str(e))

    async def get_container_status(self, container_id: str) -> dict:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._get_status_sync, container_id)

    def _get_status_sync(self, container_id: str) -> dict:
        try:
            container = self.client.containers.get(container_id)
            return {"id": container.id, "status": container.status, "name": container.name}
        except docker.errors.NotFound:
            return {"id": container_id, "status": "not_found", "name": ""}

    async def cleanup_expired_containers(self) -> int:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._cleanup_expired_sync)

    def _cleanup_expired_sync(self) -> int:
        cleaned = 0
        containers = self.client.containers.list(filters={"label": "adelbot.session_id"})
        now = datetime.now(timezone.utc)

        for container in containers:
            created_str = container.labels.get("adelbot.created_at", "")
            if not created_str:
                continue
            try:
                created = datetime.fromisoformat(created_str)
                hours_alive = (now - created).total_seconds() / 3600
                if hours_alive > settings.CONTAINER_MAX_LIFETIME_HOURS:
                    container.stop(timeout=10)
                    container.remove(force=True)
                    cleaned += 1
                    logger.info("expired_container_cleaned", container=container.name)
            except Exception as e:
                logger.error("cleanup_error", container=container.name, error=str(e))

        return cleaned


container_service = ContainerService()
