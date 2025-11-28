"""
Role Management API Endpoints

Allows the Owner to create and manage custom roles and permissions.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..core.database import get_db
from ..models.user import User as UserModel
from ..models.custom_role import CustomRole as CustomRoleModel, RolePermission as RolePermissionModel
from ..schemas.role import (
    CustomRole, CustomRoleCreate, CustomRoleUpdate,
    RolePermission, RolePermissionCreate, UserRoleUpdate, PermissionCheck
)
from ..core.permissions import require_owner, get_user_permissions, can_modify_user_role, Permissions
from ..api.auth import get_current_user

router = APIRouter()


@router.get("/", response_model=List[CustomRole])
def list_roles(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    List all available roles (system and custom).
    Any authenticated user can view roles.
    """
    roles = db.query(CustomRoleModel).all()
    return roles


@router.get("/{role_name}", response_model=CustomRole)
def get_role(
    role_name: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Get details of a specific role including its permissions.
    """
    role = db.query(CustomRoleModel).filter(CustomRoleModel.name == role_name).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


@router.post("/", response_model=CustomRole)
def create_custom_role(
    role_data: CustomRoleCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_owner())
):
    """
    Create a new custom role with permissions.
    Only the Owner can create custom roles.
    """
    # Check if role name already exists
    existing = db.query(CustomRoleModel).filter(CustomRoleModel.name == role_data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Role name already exists")

    # Cannot create system role names
    if role_data.name.lower() in ['owner', 'admin', 'user']:
        raise HTTPException(status_code=400, detail="Cannot use system role names")

    # Create the role
    new_role = CustomRoleModel(
        name=role_data.name,
        display_name=role_data.display_name,
        description=role_data.description,
        is_system_role=False,
        created_by_user_id=current_user.id
    )
    db.add(new_role)
    db.flush()

    # Add permissions
    if role_data.permissions:
        for perm in role_data.permissions:
            role_perm = RolePermissionModel(
                role_name=new_role.name,
                permission_key=perm.permission_key,
                permission_value=perm.permission_value
            )
            db.add(role_perm)

    db.commit()
    db.refresh(new_role)
    return new_role


@router.put("/{role_name}", response_model=CustomRole)
def update_custom_role(
    role_name: str,
    role_update: CustomRoleUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_owner())
):
    """
    Update a custom role's details and permissions.
    Only the Owner can update roles.
    System roles (owner, admin, user) cannot be modified.
    """
    role = db.query(CustomRoleModel).filter(CustomRoleModel.name == role_name).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    # Cannot modify system roles
    if role.is_system_role:
        raise HTTPException(status_code=403, detail="Cannot modify system roles")

    # Update basic info
    if role_update.display_name is not None:
        role.display_name = role_update.display_name
    if role_update.description is not None:
        role.description = role_update.description

    # Update permissions if provided
    if role_update.permissions is not None:
        # Delete existing permissions
        db.query(RolePermissionModel).filter(RolePermissionModel.role_name == role_name).delete()

        # Add new permissions
        for perm in role_update.permissions:
            role_perm = RolePermissionModel(
                role_name=role.name,
                permission_key=perm.permission_key,
                permission_value=perm.permission_value
            )
            db.add(role_perm)

    db.commit()
    db.refresh(role)
    return role


@router.delete("/{role_name}")
def delete_custom_role(
    role_name: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_owner())
):
    """
    Delete a custom role.
    Only the Owner can delete roles.
    System roles cannot be deleted.
    Cannot delete a role if users are assigned to it.
    """
    role = db.query(CustomRoleModel).filter(CustomRoleModel.name == role_name).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    # Cannot delete system roles
    if role.is_system_role:
        raise HTTPException(status_code=403, detail="Cannot delete system roles")

    # Check if any users have this role
    users_with_role = db.query(UserModel).filter(UserModel.role == role_name).count()
    if users_with_role > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete role: {users_with_role} user(s) still have this role"
        )

    db.delete(role)
    db.commit()

    return {"message": f"Role '{role_name}' deleted successfully"}


@router.put("/users/{user_id}/role", response_model=dict)
def update_user_role(
    user_id: int,
    role_update: UserRoleUpdate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_owner())
):
    """
    Update a user's role.
    Only the Owner can change user roles.
    The Owner (user ID 1) cannot have their role changed.
    """
    target_user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Cannot modify Owner's role
    if not can_modify_user_role(current_user, target_user):
        raise HTTPException(
            status_code=403,
            detail="Cannot modify the Owner's role"
        )

    # Verify role exists
    role = db.query(CustomRoleModel).filter(CustomRoleModel.name == role_update.role).first()
    if not role:
        raise HTTPException(status_code=400, detail="Invalid role")

    # Update role
    old_role = target_user.role
    target_user.role = role_update.role

    # Update is_admin flag for convenience (backward compatibility)
    target_user.is_admin = role_update.role in ['owner', 'admin']

    db.commit()

    return {
        "message": f"User role updated from '{old_role}' to '{role_update.role}'",
        "user_id": user_id,
        "new_role": role_update.role
    }


@router.get("/users/{user_id}/permissions", response_model=dict)
def get_user_permissions_endpoint(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Get all permissions for a specific user.
    Users can only view their own permissions unless they're an owner.
    """
    # Only owner can view other users' permissions
    if current_user.id != user_id and current_user.role != 'owner':
        raise HTTPException(status_code=403, detail="Can only view your own permissions")

    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    permissions = get_user_permissions(db, user)

    return {
        "user_id": user_id,
        "role": user.role,
        "permissions": permissions
    }


@router.get("/available-permissions", response_model=List[dict])
def list_available_permissions(
    current_user: UserModel = Depends(require_owner())
):
    """
    List all available permission keys that can be assigned.
    Only Owner can view this for role creation.
    """
    available_permissions = [
        {"key": Permissions.MANAGE_USERS, "description": "Manage user accounts"},
        {"key": Permissions.MANAGE_ROLES, "description": "Manage role assignments"},
        {"key": Permissions.MANAGE_CUSTOM_ROLES, "description": "Create and edit custom roles (Owner only)"},
        {"key": Permissions.VIEW_USERS, "description": "View user list and details"},
        {"key": Permissions.CREATE_USERS, "description": "Create new user accounts"},
        {"key": Permissions.EDIT_USERS, "description": "Edit user account details"},
        {"key": Permissions.DELETE_USERS, "description": "Delete user accounts"},
        {"key": Permissions.MANAGE_TRIPS, "description": "Create, edit, delete trips"},
        {"key": Permissions.VIEW_TRIPS, "description": "View trip data"},
        {"key": Permissions.MANAGE_RV_PROFILES, "description": "Manage RV profiles"},
        {"key": Permissions.VIEW_CRAWL_STATUS, "description": "View POI crawler status"},
        {"key": Permissions.MANAGE_CRAWLERS, "description": "Control POI crawlers"},
    ]

    return available_permissions
