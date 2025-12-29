from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class APIKeyCreate(BaseModel):
    """Schema for creating an API key"""
    name: str
    description: Optional[str] = None
    scopes: str = "*"
    expires_at: Optional[datetime] = None


class APIKeyResponse(BaseModel):
    """Schema for API key response (without the full key)"""
    id: int
    user_id: int
    key_prefix: str
    name: str
    description: Optional[str] = None
    scopes: str = "*"
    is_active: bool = True
    last_used_at: Optional[datetime] = None
    usage_count: int = 0
    created_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class APIKeyCreated(BaseModel):
    """Schema returned when creating a new API key (includes the full key)"""
    id: int
    key: str  # The full key - only shown once at creation
    key_prefix: str
    name: str
    description: Optional[str] = None
    scopes: str = "*"
    is_active: bool = True
    created_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class APIKeyList(BaseModel):
    """Schema for listing API keys"""
    keys: List[APIKeyResponse]
    total: int
