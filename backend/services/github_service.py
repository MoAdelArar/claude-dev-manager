import httpx
import structlog
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.config import settings
from backend.models.user import User
from backend.models.repository import Repository

logger = structlog.get_logger()

GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_API_URL = "https://api.github.com"


class GitHubService:

    @staticmethod
    def get_auth_url(state: str, redirect_uri: Optional[str] = None) -> str:
        params = {
            "client_id": settings.GITHUB_CLIENT_ID,
            "redirect_uri": redirect_uri or settings.GITHUB_REDIRECT_URI,
            "scope": "repo user read:org",
            "state": state,
        }
        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"{GITHUB_AUTH_URL}?{query}"

    @staticmethod
    async def exchange_code(code: str) -> dict:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                GITHUB_TOKEN_URL,
                json={
                    "client_id": settings.GITHUB_CLIENT_ID,
                    "client_secret": settings.GITHUB_CLIENT_SECRET,
                    "code": code,
                    "redirect_uri": settings.GITHUB_REDIRECT_URI,
                },
                headers={"Accept": "application/json"},
            )
            response.raise_for_status()
            data = response.json()
            if "error" in data:
                raise ValueError(f"GitHub OAuth error: {data['error_description']}")
            return data

    @staticmethod
    async def get_user_info(access_token: str) -> dict:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{GITHUB_API_URL}/user",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github.v3+json",
                },
            )
            response.raise_for_status()
            return response.json()

    @staticmethod
    async def get_user_repos(access_token: str, page: int = 1, per_page: int = 30) -> list[dict]:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{GITHUB_API_URL}/user/repos",
                params={
                    "sort": "updated",
                    "direction": "desc",
                    "per_page": per_page,
                    "page": page,
                    "type": "all",
                },
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github.v3+json",
                },
            )
            response.raise_for_status()
            return response.json()

    @staticmethod
    async def get_repo_details(access_token: str, full_name: str) -> dict:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{GITHUB_API_URL}/repos/{full_name}",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github.v3+json",
                },
            )
            response.raise_for_status()
            return response.json()

    @staticmethod
    async def get_repo_branches(access_token: str, full_name: str) -> list[dict]:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{GITHUB_API_URL}/repos/{full_name}/branches",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github.v3+json",
                },
            )
            response.raise_for_status()
            return response.json()

    @staticmethod
    async def get_repo_tree(access_token: str, full_name: str, branch: str = "main") -> dict:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{GITHUB_API_URL}/repos/{full_name}/git/trees/{branch}",
                params={"recursive": "1"},
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github.v3+json",
                },
            )
            response.raise_for_status()
            return response.json()

    @staticmethod
    async def create_or_update_user(db: AsyncSession, github_data: dict, access_token: str) -> User:
        result = await db.execute(
            select(User).where(User.github_id == github_data["id"])
        )
        user = result.scalar_one_or_none()

        if user:
            user.github_access_token = access_token
            user.github_username = github_data["login"]
            user.avatar_url = github_data.get("avatar_url")
            user.email = github_data.get("email")
            user.display_name = github_data.get("name")
        else:
            user = User(
                github_id=github_data["id"],
                github_username=github_data["login"],
                github_access_token=access_token,
                email=github_data.get("email"),
                avatar_url=github_data.get("avatar_url"),
                display_name=github_data.get("name"),
            )
            db.add(user)

        admin_usernames = [
            u.strip().lower()
            for u in settings.ADMIN_GITHUB_USERNAMES.split(",")
            if u.strip()
        ]
        if github_data["login"].lower() in admin_usernames:
            user.is_admin = True

        await db.flush()
        logger.info("user_authenticated", github_username=user.github_username, is_admin=user.is_admin)
        return user

    @staticmethod
    async def sync_repositories(db: AsyncSession, user: User) -> list[Repository]:
        repos_data = await GitHubService.get_user_repos(user.github_access_token)
        synced = []

        for repo_data in repos_data:
            result = await db.execute(
                select(Repository).where(
                    Repository.github_repo_id == repo_data["id"],
                    Repository.user_id == user.id,
                )
            )
            repo = result.scalar_one_or_none()

            if repo:
                repo.full_name = repo_data["full_name"]
                repo.name = repo_data["name"]
                repo.description = repo_data.get("description")
                repo.default_branch = repo_data.get("default_branch", "main")
                repo.language = repo_data.get("language")
                repo.is_private = repo_data.get("private", False)
                repo.clone_url = repo_data["clone_url"]
            else:
                repo = Repository(
                    user_id=user.id,
                    github_repo_id=repo_data["id"],
                    full_name=repo_data["full_name"],
                    name=repo_data["name"],
                    description=repo_data.get("description"),
                    default_branch=repo_data.get("default_branch", "main"),
                    language=repo_data.get("language"),
                    is_private=repo_data.get("private", False),
                    clone_url=repo_data["clone_url"],
                )
                db.add(repo)

            synced.append(repo)

        await db.flush()
        logger.info("repos_synced", user=user.github_username, count=len(synced))
        return synced
