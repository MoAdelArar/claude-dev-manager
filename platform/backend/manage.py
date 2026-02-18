#!/usr/bin/env python3
"""
AdelBot CLI management tool.

Usage:
    python -m backend.manage promote-admin <github_username>
    python -m backend.manage demote-admin <github_username>
    python -m backend.manage list-users
    python -m backend.manage list-admins
    python -m backend.manage deactivate <github_username>
    python -m backend.manage activate <github_username>
    python -m backend.manage set-tier <github_username> <tier>
    python -m backend.manage stats
    python -m backend.manage reset-usage
"""
import asyncio
import sys

from sqlalchemy import select, func
from backend.config.database import AsyncSessionLocal
from backend.models.user import User
from backend.models.session import DevSession
from backend.models.billing import Subscription, SubscriptionTier, BillingRecord, BillingType


async def get_user_by_username(db, username: str) -> User | None:
    result = await db.execute(
        select(User).where(User.github_username == username)
    )
    return result.scalar_one_or_none()


async def promote_admin(username: str):
    async with AsyncSessionLocal() as db:
        user = await get_user_by_username(db, username)
        if not user:
            print(f"User '{username}' not found.")
            print("They must sign in via GitHub at least once before being promoted.")
            return
        user.is_admin = True
        await db.commit()
        print(f"'{username}' is now an admin.")


async def demote_admin(username: str):
    async with AsyncSessionLocal() as db:
        user = await get_user_by_username(db, username)
        if not user:
            print(f"User '{username}' not found.")
            return
        user.is_admin = False
        await db.commit()
        print(f"'{username}' is no longer an admin.")


async def list_users():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).order_by(User.created_at.desc()))
        users = list(result.scalars().all())

        if not users:
            print("No users found.")
            return

        print(f"{'Username':<25} {'Email':<30} {'Admin':<7} {'Active':<8} {'Joined'}")
        print("-" * 95)
        for u in users:
            print(
                f"{u.github_username:<25} "
                f"{(u.email or '—'):<30} "
                f"{'YES' if u.is_admin else 'no':<7} "
                f"{'YES' if u.is_active else 'NO':<8} "
                f"{u.created_at.strftime('%Y-%m-%d')}"
            )
        print(f"\nTotal: {len(users)} users")


async def list_admins():
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User).where(User.is_admin == True).order_by(User.created_at)
        )
        admins = list(result.scalars().all())

        if not admins:
            print("No admins found.")
            print("Promote one with: python -m backend.manage promote-admin <github_username>")
            return

        for u in admins:
            print(f"  @{u.github_username} ({u.email or 'no email'}) — since {u.created_at.strftime('%Y-%m-%d')}")
        print(f"\n{len(admins)} admin(s)")


async def deactivate_user(username: str):
    async with AsyncSessionLocal() as db:
        user = await get_user_by_username(db, username)
        if not user:
            print(f"User '{username}' not found.")
            return
        user.is_active = False
        await db.commit()
        print(f"'{username}' has been deactivated.")


async def activate_user(username: str):
    async with AsyncSessionLocal() as db:
        user = await get_user_by_username(db, username)
        if not user:
            print(f"User '{username}' not found.")
            return
        user.is_active = True
        await db.commit()
        print(f"'{username}' has been activated.")


async def set_tier(username: str, tier_name: str):
    valid = {t.value.lower(): t for t in SubscriptionTier}
    tier = valid.get(tier_name.lower())
    if not tier:
        print(f"Invalid tier '{tier_name}'. Choose from: {', '.join(valid.keys())}")
        return

    async with AsyncSessionLocal() as db:
        user = await get_user_by_username(db, username)
        if not user:
            print(f"User '{username}' not found.")
            return

        result = await db.execute(
            select(Subscription).where(Subscription.user_id == user.id)
        )
        sub = result.scalar_one_or_none()

        if sub:
            sub.tier = tier
        else:
            from datetime import datetime, timezone
            sub = Subscription(
                user_id=user.id,
                tier=tier,
                is_active=True,
                current_period_start=datetime.now(timezone.utc),
            )
            db.add(sub)

        await db.commit()
        print(f"'{username}' is now on the {tier.value} tier.")


async def show_stats():
    async with AsyncSessionLocal() as db:
        users = (await db.execute(select(func.count(User.id)))).scalar() or 0
        admins = (await db.execute(
            select(func.count(User.id)).where(User.is_admin == True)
        )).scalar() or 0
        sessions = (await db.execute(select(func.count(DevSession.id)))).scalar() or 0
        revenue = (await db.execute(
            select(func.sum(BillingRecord.amount_cents)).where(
                BillingRecord.billing_type == BillingType.SESSION_CHARGE
            )
        )).scalar() or 0

        print(f"Users:    {users} ({admins} admins)")
        print(f"Sessions: {sessions}")
        print(f"Revenue:  ${revenue / 100:.2f}")


async def reset_usage():
    from backend.services.billing_service import BillingService
    async with AsyncSessionLocal() as db:
        count = await BillingService.reset_period_usage(db)
        await db.commit()
        print(f"Reset usage for {count} subscriptions.")


COMMANDS = {
    "promote-admin": (promote_admin, 1, "<github_username>"),
    "demote-admin": (demote_admin, 1, "<github_username>"),
    "list-users": (list_users, 0, ""),
    "list-admins": (list_admins, 0, ""),
    "deactivate": (deactivate_user, 1, "<github_username>"),
    "activate": (activate_user, 1, "<github_username>"),
    "set-tier": (set_tier, 2, "<github_username> <free|pro|team|enterprise>"),
    "stats": (show_stats, 0, ""),
    "reset-usage": (reset_usage, 0, ""),
}


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print("AdelBot Management CLI\n")
        print("Usage: python -m backend.manage <command> [args]\n")
        print("Commands:")
        for name, (_, _, usage) in COMMANDS.items():
            print(f"  {name} {usage}")
        sys.exit(1)

    cmd_name = sys.argv[1]
    func, nargs, usage = COMMANDS[cmd_name]
    args = sys.argv[2:]

    if len(args) < nargs:
        print(f"Usage: python -m backend.manage {cmd_name} {usage}")
        sys.exit(1)

    asyncio.run(func(*args[:nargs]))


if __name__ == "__main__":
    main()
