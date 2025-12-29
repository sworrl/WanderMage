from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


class AchievementDefinition(BaseModel):
    """Schema for achievement definitions"""
    id: int
    code: str
    name: str
    description: str
    icon: str
    category: str
    achievement_type: str = 'personal'
    metric_name: Optional[str] = None
    metric_threshold: Optional[float] = None
    metric_operator: str = '>='
    custom_check: Optional[str] = None
    sort_order: int = 0
    is_hidden: bool = False
    is_active: bool = True
    points: int = 10
    rarity: str = 'common'

    class Config:
        from_attributes = True


class UserAchievement(BaseModel):
    """Schema for user achievements"""
    id: int
    user_id: int
    achievement_id: int
    earned_at: datetime
    trigger_value: Optional[float] = None
    trigger_context: Optional[str] = None
    earned_latitude: Optional[float] = None
    earned_longitude: Optional[float] = None
    earned_location: Optional[str] = None
    trip_id: Optional[int] = None
    rv_profile_id: Optional[int] = None
    notified: bool = False
    notified_at: Optional[datetime] = None
    is_favorite: bool = False
    is_hidden: bool = False

    # Include the achievement definition
    achievement: Optional[AchievementDefinition] = None

    class Config:
        from_attributes = True


class AchievementProgress(BaseModel):
    """Schema for achievement progress tracking"""
    achievements: List[UserAchievement] = []
    progress: Dict[str, Any] = {}
    metrics: Dict[str, Any] = {}
