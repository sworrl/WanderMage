from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..core.database import Base
import secrets
import hashlib


class APIKey(Base):
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Store hashed key, not plaintext
    key_hash = Column(String(64), unique=True, nullable=False, index=True)
    key_prefix = Column(String(8), nullable=False)  # First 8 chars for identification

    name = Column(String(100), nullable=False)  # User-friendly name for the key
    description = Column(String(500))

    # Permissions
    scopes = Column(String(500), default="*")  # Comma-separated scopes or * for all

    # Status
    is_active = Column(Boolean, default=True)

    # Usage tracking
    last_used_at = Column(DateTime(timezone=True))
    usage_count = Column(Integer, default=0)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True))  # Optional expiration

    # Relationships
    user = relationship("User", back_populates="api_keys")

    @staticmethod
    def generate_key():
        """Generate a new API key with prefix"""
        # Generate 32-byte random key
        key = secrets.token_urlsafe(32)
        prefix = key[:8]
        return key, prefix

    @staticmethod
    def hash_key(key: str) -> str:
        """Hash an API key for storage"""
        return hashlib.sha256(key.encode()).hexdigest()

    def verify_key(self, key: str) -> bool:
        """Verify a key against this API key's hash"""
        return self.key_hash == self.hash_key(key)
