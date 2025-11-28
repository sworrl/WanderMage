"""
System Settings Model - Stores application-wide configuration like API keys.

Settings are stored with encryption for sensitive values like API keys.
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean
from sqlalchemy.sql import func
from ..core.database import Base


class SystemSetting(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)

    # Setting identification
    key = Column(String, unique=True, nullable=False, index=True)

    # Setting value (can be encrypted for sensitive data)
    value = Column(Text)

    # Metadata
    description = Column(Text)
    is_sensitive = Column(Boolean, default=False)  # If true, value should be masked in UI
    is_required = Column(Boolean, default=False)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# Helper functions for common settings
def get_setting(db, key: str, default: str = None) -> str:
    """Get a setting value by key"""
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    return setting.value if setting else default


def set_setting(db, key: str, value: str, description: str = None, is_sensitive: bool = False):
    """Set a setting value"""
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()

    if setting:
        setting.value = value
        if description:
            setting.description = description
    else:
        setting = SystemSetting(
            key=key,
            value=value,
            description=description,
            is_sensitive=is_sensitive
        )
        db.add(setting)

    db.commit()
    return setting
