"""Review federation client.

Each WanderMage node (FOSS or hosted) can forward its locally-created ratings up to a
central master review service and pull aggregated reviews back for display. The master
endpoint is configured via MASTER_REVIEWS_URL; when unset, federation is simply off and
the node works fully standalone. This client is FOSS — the master aggregator it talks to
is a separate (proprietary) service.
"""
import logging
import httpx

from ..core.config import settings

logger = logging.getLogger(__name__)

_UA = "WanderMage-Node/1.0"


def _master_base() -> str:
    return (getattr(settings, "MASTER_REVIEWS_URL", "") or "").rstrip("/")


def node_id() -> str:
    return getattr(settings, "NODE_ID", "foss-node") or "foss-node"


async def push_rating(payload: dict) -> None:
    """Forward a locally-created rating to the master (best-effort; never raises)."""
    base = _master_base()
    if not base:
        return
    try:
        async with httpx.AsyncClient(timeout=10, headers={"User-Agent": _UA}) as client:
            await client.post(f"{base}/api/master-reviews", json=payload)
    except Exception as e:  # noqa: BLE001 - federation is optional
        logger.info("federation push skipped: %s", e)


async def fetch_master(poi_serial: str) -> list:
    """Fetch aggregated master reviews for a POI (best-effort; [] on any failure)."""
    base = _master_base()
    if not base:
        return []
    try:
        async with httpx.AsyncClient(timeout=10, headers={"User-Agent": _UA}) as client:
            r = await client.get(f"{base}/api/master-reviews/{poi_serial}")
            if r.status_code == 200:
                return r.json().get("reviews", []) or []
    except Exception as e:  # noqa: BLE001
        logger.info("federation fetch skipped: %s", e)
    return []
