from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..core.database import get_db
from .auth import get_current_user
from ..models.user import User
from ..models.achievement import AchievementDefinition, UserAchievement
from ..schemas.achievement import (
    AchievementDefinition as AchievementDefinitionSchema,
    UserAchievement as UserAchievementSchema,
    AchievementProgress
)
from ..services.achievement_service import (
    get_user_achievements,
    check_and_award_achievements,
    get_achievement_progress,
    get_user_metrics
)

router = APIRouter()


@router.get("/", response_model=List[UserAchievementSchema])
async def get_my_achievements(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all achievements earned by the current user"""
    achievements = get_user_achievements(db, current_user.id)

    # Eagerly load the achievement definitions
    result = []
    for ua in achievements:
        achievement_def = db.query(AchievementDefinition).filter(
            AchievementDefinition.id == ua.achievement_id
        ).first()
        ua.achievement = achievement_def
        result.append(ua)

    return result


@router.get("/definitions", response_model=List[AchievementDefinitionSchema])
async def get_all_achievement_definitions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all achievement definitions (hidden ones only if earned)"""
    # Get user's earned achievement IDs
    earned_ids = set(
        ua.achievement_id for ua in
        db.query(UserAchievement).filter(UserAchievement.user_id == current_user.id).all()
    )

    # Get all achievements, but filter hidden ones unless earned
    all_achievements = db.query(AchievementDefinition).filter(
        AchievementDefinition.is_active == True
    ).order_by(AchievementDefinition.sort_order).all()

    # Only return non-hidden or earned achievements
    return [a for a in all_achievements if not a.is_hidden or a.id in earned_ids]


@router.get("/progress")
async def get_my_achievement_progress(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get progress towards all achievements (hidden ones only if earned)"""
    progress = get_achievement_progress(db, current_user.id)

    # Convert to serializable format, respecting hidden flag
    result = []
    for p in progress:
        # Skip hidden achievements unless earned
        if p['achievement'].is_hidden and not p['is_earned']:
            continue

        result.append({
            'achievement': {
                'id': p['achievement'].id,
                'code': p['achievement'].code,
                'name': p['achievement'].name,
                'description': p['achievement'].description,
                'icon': p['achievement'].icon,
                'category': p['achievement'].category,
                'achievement_type': p['achievement'].achievement_type,
                'points': p['achievement'].points,
                'rarity': p['achievement'].rarity,
            },
            'current_value': p['current_value'],
            'target_value': p['target_value'],
            'progress_percent': p['progress_percent'],
            'is_earned': p['is_earned']
        })

    return result


@router.post("/check")
async def check_achievements(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Check and award any newly earned achievements"""
    newly_earned = check_and_award_achievements(db, current_user.id)

    result = []
    for ua in newly_earned:
        achievement_def = db.query(AchievementDefinition).filter(
            AchievementDefinition.id == ua.achievement_id
        ).first()
        result.append({
            'id': ua.id,
            'achievement': {
                'id': achievement_def.id,
                'code': achievement_def.code,
                'name': achievement_def.name,
                'description': achievement_def.description,
                'icon': achievement_def.icon,
                'category': achievement_def.category,
                'points': achievement_def.points,
                'rarity': achievement_def.rarity,
            },
            'earned_at': ua.earned_at.isoformat(),
            'trigger_value': ua.trigger_value
        })

    return {
        'newly_earned': result,
        'count': len(result)
    }


@router.get("/summary")
async def get_achievement_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a summary of user's achievement status"""

    # Get all definitions
    all_achievements = db.query(AchievementDefinition).filter(
        AchievementDefinition.is_active == True
    ).all()

    # Get user's earned achievements
    earned = get_user_achievements(db, current_user.id)
    earned_ids = set(ua.achievement_id for ua in earned)

    # Calculate stats
    total_points = 0
    by_category = {}
    by_rarity = {'common': 0, 'uncommon': 0, 'rare': 0, 'epic': 0, 'legendary': 0}

    for ua in earned:
        achievement = next((a for a in all_achievements if a.id == ua.achievement_id), None)
        if achievement:
            total_points += achievement.points

            if achievement.category not in by_category:
                by_category[achievement.category] = {'earned': 0, 'total': 0}
            by_category[achievement.category]['earned'] += 1

            if achievement.rarity in by_rarity:
                by_rarity[achievement.rarity] += 1

    # Count totals by category
    for achievement in all_achievements:
        if achievement.category not in by_category:
            by_category[achievement.category] = {'earned': 0, 'total': 0}
        by_category[achievement.category]['total'] += 1

    # Recent achievements (last 5)
    recent = []
    for ua in earned[:5]:
        achievement_def = db.query(AchievementDefinition).filter(
            AchievementDefinition.id == ua.achievement_id
        ).first()
        if achievement_def:
            recent.append({
                'id': ua.id,
                'earned_at': ua.earned_at.isoformat(),
                'achievement': {
                    'id': achievement_def.id,
                    'code': achievement_def.code,
                    'name': achievement_def.name,
                    'description': achievement_def.description,
                    'icon': achievement_def.icon,
                    'category': achievement_def.category,
                    'points': achievement_def.points,
                    'rarity': achievement_def.rarity,
                }
            })

    return {
        'total_earned': len(earned),
        'total_available': len(all_achievements),
        'total_points': total_points,
        'by_category': by_category,
        'by_rarity': by_rarity,
        'recent': recent
    }


@router.get("/metrics")
async def get_my_metrics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's current metrics used for achievement calculations"""
    return get_user_metrics(db, current_user.id)


@router.patch("/{achievement_id}/favorite")
async def toggle_achievement_favorite(
    achievement_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Toggle favorite status on an earned achievement"""
    ua = db.query(UserAchievement).filter(
        UserAchievement.user_id == current_user.id,
        UserAchievement.achievement_id == achievement_id
    ).first()

    if not ua:
        raise HTTPException(status_code=404, detail="Achievement not found or not earned")

    ua.is_favorite = not ua.is_favorite
    db.commit()

    return {'is_favorite': ua.is_favorite}
