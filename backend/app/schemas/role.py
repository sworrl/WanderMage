from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class RolePermissionCreate(BaseModel):
    """Schema for creating a role permission"""
    permission_key: str
    permission_value: bool = True


class RolePermission(BaseModel):
    """Schema for role permissions"""
    id: int
    role_name: str
    permission_key: str
    permission_value: bool = True
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CustomRoleCreate(BaseModel):
    """Schema for creating a custom role"""
    name: str
    display_name: str
    description: Optional[str] = None
    permissions: List[RolePermissionCreate] = []


class CustomRoleUpdate(BaseModel):
    """Schema for updating a custom role"""
    display_name: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[List[RolePermissionCreate]] = None


class CustomRole(BaseModel):
    """Schema for custom roles"""
    id: int
    name: str
    display_name: str
    description: Optional[str] = None
    is_system_role: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by_user_id: Optional[int] = None
    permissions: List[RolePermission] = []

    class Config:
        from_attributes = True


class UserRoleUpdate(BaseModel):
    """Schema for updating a user's role"""
    role: str


class PermissionCheck(BaseModel):
    """Schema for checking permissions"""
    permission_key: str
    has_permission: bool = False
