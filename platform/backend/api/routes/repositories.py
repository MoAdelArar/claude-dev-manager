from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.config.database import get_db
from backend.middleware.auth import get_current_user
from backend.models.user import User
from backend.models.repository import Repository
from backend.services.github_service import GitHubService
from backend.api.schemas import RepositoryResponse

router = APIRouter(prefix="/repositories", tags=["repositories"])


@router.get("/", response_model=list[RepositoryResponse])
async def list_repositories(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Repository)
        .where(Repository.user_id == user.id)
        .order_by(Repository.updated_at.desc())
    )
    repos = list(result.scalars().all())
    return [RepositoryResponse.model_validate(r) for r in repos]


@router.post("/sync", response_model=list[RepositoryResponse])
async def sync_repositories(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repos = await GitHubService.sync_repositories(db, user)
    return [RepositoryResponse.model_validate(r) for r in repos]


@router.get("/{repo_id}", response_model=RepositoryResponse)
async def get_repository(
    repo_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Repository).where(
            Repository.id == repo_id,
            Repository.user_id == user.id,
        )
    )
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return RepositoryResponse.model_validate(repo)


@router.get("/{repo_id}/branches")
async def get_branches(
    repo_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Repository).where(
            Repository.id == repo_id,
            Repository.user_id == user.id,
        )
    )
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    branches = await GitHubService.get_repo_branches(user.github_access_token, repo.full_name)
    return [{"name": b["name"], "sha": b["commit"]["sha"]} for b in branches]


@router.get("/{repo_id}/tree")
async def get_tree(
    repo_id: str,
    branch: str = "main",
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Repository).where(
            Repository.id == repo_id,
            Repository.user_id == user.id,
        )
    )
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    tree = await GitHubService.get_repo_tree(user.github_access_token, repo.full_name, branch)
    return tree
