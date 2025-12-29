"""
Permission system for role-based access control.
"""
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, List
from functools import wraps


class Permissions:
    """Available permission keys"""
    MANAGE_USERS = "manage_users"
    MANAGE_ROLES = "manage_roles"
    MANAGE_CUSTOM_ROLES = "manage_custom_roles"
    VIEW_USERS = "view_users"
    CREATE_USERS = "create_users"
    EDIT_USERS = "edit_users"
    DELETE_USERS = "delete_users"
    MANAGE_TRIPS = "manage_trips"
    VIEW_TRIPS = "view_trips"
    MANAGE_RV_PROFILES = "manage_rv_profiles"
    VIEW_CRAWL_STATUS = "view_crawl_status"
    MANAGE_CRAWLERS = "manage_crawlers"


# Default permissions for system roles
SYSTEM_ROLE_PERMISSIONS = {
    "owner": {
        Permissions.MANAGE_USERS: True,
        Permissions.MANAGE_ROLES: True,
        Permissions.MANAGE_CUSTOM_ROLES: True,
        Permissions.VIEW_USERS: True,
        Permissions.CREATE_USERS: True,
        Permissions.EDIT_USERS: True,
        Permissions.DELETE_USERS: True,
        Permissions.MANAGE_TRIPS: True,
        Permissions.VIEW_TRIPS: True,
        Permissions.MANAGE_RV_PROFILES: True,
        Permissions.VIEW_CRAWL_STATUS: True,
        Permissions.MANAGE_CRAWLERS: True,
    },
    "admin": {
        Permissions.MANAGE_USERS: True,
        Permissions.MANAGE_ROLES: False,
        Permissions.MANAGE_CUSTOM_ROLES: False,
        Permissions.VIEW_USERS: True,
        Permissions.CREATE_USERS: True,
        Permissions.EDIT_USERS: True,
        Permissions.DELETE_USERS: False,
        Permissions.MANAGE_TRIPS: True,
        Permissions.VIEW_TRIPS: True,
        Permissions.MANAGE_RV_PROFILES: True,
        Permissions.VIEW_CRAWL_STATUS: True,
        Permissions.MANAGE_CRAWLERS: True,
    },
    "user": {
        Permissions.MANAGE_USERS: False,
        Permissions.MANAGE_ROLES: False,
        Permissions.MANAGE_CUSTOM_ROLES: False,
        Permissions.VIEW_USERS: False,
        Permissions.CREATE_USERS: False,
        Permissions.EDIT_USERS: False,
        Permissions.DELETE_USERS: False,
        Permissions.MANAGE_TRIPS: True,
        Permissions.VIEW_TRIPS: True,
        Permissions.MANAGE_RV_PROFILES: True,
        Permissions.VIEW_CRAWL_STATUS: True,
        Permissions.MANAGE_CRAWLERS: False,
    },
}


def get_user_permissions(db: Session, user) -> Dict[str, bool]:
    """
    Get all permissions for a user based on their role.
    Returns a dict of permission_key -> bool.
    """
    role = getattr(user, 'role', 'user') or 'user'

    # Check system roles first
    if role in SYSTEM_ROLE_PERMISSIONS:
        return SYSTEM_ROLE_PERMISSIONS[role].copy()

    # For custom roles, query the database
    from ..models.custom_role import RolePermission
    permissions = {}

    role_perms = db.query(RolePermission).filter(RolePermission.role_name == role).all()
    for perm in role_perms:
        permissions[perm.permission_key] = perm.permission_value

    return permissions


def has_permission(db: Session, user, permission_key: str) -> bool:
    """Check if a user has a specific permission."""
    permissions = get_user_permissions(db, user)
    return permissions.get(permission_key, False)


def can_modify_user_role(current_user, target_user) -> bool:
    """
    Check if current_user can modify target_user's role.
    Owner (user ID 1) cannot have their role changed.
    """
    # Cannot modify owner (first user)
    if target_user.id == 1:
        return False

    # Only owner can modify roles
    if getattr(current_user, 'role', 'user') != 'owner':
        return False

    return True


def require_owner():
    """
    Dependency that requires the current user to be the owner.
    Use as: current_user: User = Depends(require_owner())
    """
    from ..api.auth import get_current_user

    async def _require_owner(current_user = Depends(get_current_user)):
        if getattr(current_user, 'role', 'user') != 'owner' and current_user.id != 1:
            raise HTTPException(
                status_code=403,
                detail="Only the owner can perform this action"
            )
        return current_user

    return _require_owner


def require_permission(permission_key: str):
    """
    Dependency that requires the current user to have a specific permission.
    Use as: current_user: User = Depends(require_permission(Permissions.MANAGE_USERS))
    """
    from ..api.auth import get_current_user
    from ..core.database import get_db

    async def _require_permission(
        current_user = Depends(get_current_user),
        db: Session = Depends(get_db)
    ):
        if not has_permission(db, current_user, permission_key):
            raise HTTPException(
                status_code=403,
                detail=f"Permission denied: {permission_key}"
            )
        return current_user

    return _require_permission
