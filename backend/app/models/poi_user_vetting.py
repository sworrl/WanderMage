"""
POI User Vetting Models

Models for user-submitted reports, corrections, and voting on POI accuracy

NOTE: These models use Base (main database) instead of POIBase because they have
foreign keys to the users table, which is in the main database.
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Text, JSON, ForeignKey, LargeBinary
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

from ..core.database import Base


class POIUserReport(Base):
    """User-submitted reports about POI accuracy, corrections, or issues"""
    __tablename__ = "poi_user_reports"

    id = Column(Integer, primary_key=True, index=True)

    # Which POI this report is about (no FK - cross-database reference to wandermage_pois.poi_master.id)
    poi_id = Column(Integer, nullable=False, index=True)

    # Who submitted the report
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)

    # Report type
    report_type = Column(String(50), nullable=False, index=True)
    # Types: 'accurate', 'inaccurate', 'closed', 'moved', 'wrong_category',
    #        'wrong_location', 'missing_data', 'incorrect_hours', 'other'

    # Report details
    title = Column(String(255))
    description = Column(Text)

    # Specific field corrections (JSON: {"field": "hours", "old_value": "...", "new_value": "..."})
    field_corrections = Column(JSON)

    # If suggesting new location
    suggested_latitude = Column(Float)
    suggested_longitude = Column(Float)

    # If suggesting new category
    suggested_category = Column(String(100))

    # Evidence (images, URLs, etc.)
    evidence_images = Column(JSON)  # Array of image data or URLs
    evidence_urls = Column(JSON)  # Array of evidence URLs
    evidence_notes = Column(Text)

    # Status of report
    status = Column(String(50), default='pending', index=True)
    # Status: 'pending', 'under_review', 'approved', 'rejected', 'implemented'

    # Admin review
    reviewed_by_user_id = Column(Integer, ForeignKey('users.id'))
    reviewed_at = Column(DateTime(timezone=True))
    review_notes = Column(Text)

    # Impact
    changes_applied = Column(Boolean, default=False)
    changes_applied_at = Column(DateTime(timezone=True))

    # Voting on report helpfulness
    helpful_votes = Column(Integer, default=0)
    not_helpful_votes = Column(Integer, default=0)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships (no POI relationship - cross-database)
    reporter = relationship("User", foreign_keys=[user_id])
    reviewer = relationship("User", foreign_keys=[reviewed_by_user_id])


class POIVerificationVote(Base):
    """Community voting on POI accuracy"""
    __tablename__ = "poi_verification_votes"

    id = Column(Integer, primary_key=True, index=True)

    # Which POI this vote is for (no FK - cross-database reference to wandermage_pois.poi_master.id)
    poi_id = Column(Integer, nullable=False, index=True)

    # Who voted
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)

    # Vote type
    vote_type = Column(String(50), nullable=False)
    # Types: 'accurate', 'inaccurate', 'visited_confirmed', 'needs_update'

    # Confidence in vote (1-5)
    confidence = Column(Integer)

    # Optional comments
    comment = Column(Text)

    # Visit date if user visited
    visit_date = Column(DateTime(timezone=True))

    # Evidence (photos from visit, etc.)
    evidence_images = Column(JSON)

    # Vote weight (based on user reputation)
    vote_weight = Column(Float, default=1.0)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    # Relationships (no POI relationship - cross-database)
    user = relationship("User")

    # Unique constraint: one vote per user per POI
    __table_args__ = (
        {'extend_existing': True},
    )


class POIUserContribution(Base):
    """Track user contributions to POI data (for reputation/gamification)"""
    __tablename__ = "poi_user_contributions"

    id = Column(Integer, primary_key=True, index=True)

    # User who made contribution
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)

    # POI affected (no FK - cross-database reference to wandermage_pois.poi_master.id)
    poi_id = Column(Integer, index=True)

    # Contribution type
    contribution_type = Column(String(50), nullable=False)
    # Types: 'report_submitted', 'vote_cast', 'correction_approved',
    #        'photo_added', 'hours_verified', 'amenity_confirmed'

    # Points earned (for gamification)
    points_earned = Column(Integer, default=0)

    # Quality score of contribution (0-100)
    quality_score = Column(Float)

    # Was contribution verified/approved?
    verified = Column(Boolean, default=False)
    verified_at = Column(DateTime(timezone=True))

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    # Relationships (no POI relationship - cross-database)
    user = relationship("User")


class POIImage(Base):
    """User-submitted POI images stored in database"""
    __tablename__ = "poi_images"

    id = Column(Integer, primary_key=True, index=True)

    # Which POI (no FK - cross-database reference to wandermage_pois.poi_master.id)
    poi_id = Column(Integer, nullable=False, index=True)

    # Who uploaded
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)

    # Image data
    image_data = Column(LargeBinary, nullable=False)  # Store actual image
    image_mime_type = Column(String(50), nullable=False)  # e.g., 'image/jpeg'
    image_size_bytes = Column(Integer)
    image_width = Column(Integer)
    image_height = Column(Integer)

    # Image metadata
    title = Column(String(255))
    description = Column(Text)
    caption = Column(String(500))

    # Image type
    image_type = Column(String(50))
    # Types: 'exterior', 'interior', 'amenity', 'sign', 'parking', 'entrance', 'other'

    # Verification
    is_verified = Column(Boolean, default=False)
    verified_by_user_id = Column(Integer, ForeignKey('users.id'))
    verified_at = Column(DateTime(timezone=True))

    # Is this the primary image for the POI?
    is_primary = Column(Boolean, default=False)

    # Display order
    display_order = Column(Integer, default=0)

    # Moderation
    is_approved = Column(Boolean, default=True)
    is_flagged = Column(Boolean, default=False)
    flag_reason = Column(String(255))

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    # Relationships (no POI relationship - cross-database)
    uploader = relationship("User", foreign_keys=[user_id])
    verifier = relationship("User", foreign_keys=[verified_by_user_id])
