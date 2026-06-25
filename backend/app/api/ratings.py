from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from ..core.database import get_db
from ..models.user import User as UserModel
from ..models.poi_rating import POIRating, dimensions_for
from ..schemas.rating import RatingCreate, RatingOut, RatingSummary, DimensionDef
from .auth import get_current_user
from ..services.review_federation import push_rating, fetch_master, node_id

router = APIRouter()


@router.get("/dimensions/{category}")
def get_dimensions(category: str):
    """Return the RV rating dimensions a given POI category should collect."""
    return {"category": category, "dimensions": dimensions_for(category)}


@router.post("", response_model=RatingOut)
async def create_rating(
    body: RatingCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    rec = POIRating(
        poi_serial=body.poi_serial,
        category=body.category,
        user_id=current_user.id,
        username=getattr(current_user, "username", None),
        overall=body.overall,
        dimensions=body.dimensions or {},
        comment=body.comment,
        origin="local",
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)

    # Best-effort federation up to the master review service.
    await push_rating({
        "poi_serial": rec.poi_serial,
        "category": rec.category,
        "overall": rec.overall,
        "dimensions": rec.dimensions,
        "comment": rec.comment,
        "username": rec.username,
        "origin": node_id(),
        "external_id": f"{node_id()}:{rec.id}",
    })
    return rec


@router.get("/{poi_serial}", response_model=RatingSummary)
async def get_ratings(poi_serial: str, db: Session = Depends(get_db)):
    local = (
        db.query(POIRating)
        .filter(POIRating.poi_serial == poi_serial)
        .order_by(POIRating.created_at.desc())
        .all()
    )
    master = await fetch_master(poi_serial)

    category = local[0].category if local else None
    dims = dimensions_for(category)

    overalls: List[float] = [r.overall for r in local if r.overall is not None]
    overalls += [m["overall"] for m in master if m.get("overall") is not None]
    count = len(overalls)
    overall_avg = round(sum(overalls) / count, 2) if count else None

    dim_avgs = {}
    for d in dims:
        vals = []
        for r in local:
            if r.dimensions and r.dimensions.get(d["key"]):
                vals.append(r.dimensions[d["key"]])
        for m in master:
            md = m.get("dimensions") or {}
            if md.get(d["key"]):
                vals.append(md[d["key"]])
        if vals:
            dim_avgs[d["key"]] = round(sum(vals) / len(vals), 2)

    reviews = [RatingOut.model_validate(r) for r in local]
    for m in master:
        reviews.append(RatingOut(
            id=0,
            poi_serial=poi_serial,
            category=m.get("category"),
            username=m.get("username") or "traveler",
            overall=m.get("overall", 0),
            dimensions=m.get("dimensions"),
            comment=m.get("comment"),
            origin=m.get("origin", "master"),
        ))

    return RatingSummary(
        poi_serial=poi_serial,
        count=count,
        overall_avg=overall_avg,
        dimension_avgs=dim_avgs,
        dimensions=[DimensionDef(**d) for d in dims],
        reviews=reviews,
    )
