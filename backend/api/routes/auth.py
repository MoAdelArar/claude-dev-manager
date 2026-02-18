import secrets
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config.database import get_db
from backend.services.github_service import GitHubService
from backend.middleware.auth import create_access_token, get_current_user
from backend.api.schemas import GitHubAuthRequest, TokenResponse, UserResponse
from backend.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/github/url")
async def get_github_auth_url(redirect_uri: str | None = None):
    state = secrets.token_urlsafe(32)
    url = GitHubService.get_auth_url(state, redirect_uri=redirect_uri)
    return {"url": url, "state": state}


@router.post("/github/callback", response_model=TokenResponse)
async def github_callback(
    request: GitHubAuthRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        token_data = await GitHubService.exchange_code(request.code)
        access_token = token_data["access_token"]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to authenticate with GitHub: {str(e)}",
        )

    try:
        github_user = await GitHubService.get_user_info(access_token)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to fetch GitHub user info: {str(e)}",
        )

    user = await GitHubService.create_or_update_user(db, github_user, access_token)
    jwt_token = create_access_token(user.id)

    return TokenResponse(
        access_token=jwt_token,
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return UserResponse.model_validate(user)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(user: User = Depends(get_current_user)):
    new_token = create_access_token(user.id)
    return TokenResponse(
        access_token=new_token,
        user=UserResponse.model_validate(user),
    )
