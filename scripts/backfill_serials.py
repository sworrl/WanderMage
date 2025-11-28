#!/usr/bin/env python3
"""Backfill serial numbers for POIs that don't have them."""
import sys
sys.path.insert(0, '/opt/wandermage/backend')

from dotenv import load_dotenv
load_dotenv('/opt/wandermage/backend/.env')

import os
import secrets
from datetime import datetime, timezone
from sqlalchemy import create_engine, text

def generate_serial():
    date_part = datetime.now(timezone.utc).strftime('%Y%m%d')
    random_part = secrets.token_hex(24)
    return f"POI-{date_part}-{random_part}"[:64]

engine = create_engine(os.environ['DATABASE_URL'])

with engine.connect() as conn:
    # Count POIs without serial
    result = conn.execute(text("SELECT COUNT(*) FROM pois WHERE serial IS NULL"))
    count = result.scalar()
    print(f"Found {count} POIs without serial numbers")

    if count > 0:
        # Get IDs of POIs without serial
        result = conn.execute(text("SELECT id FROM pois WHERE serial IS NULL"))
        ids = [row[0] for row in result]

        # Update each one with a unique serial
        updated = 0
        for poi_id in ids:
            serial = generate_serial()
            conn.execute(text("UPDATE pois SET serial = :serial WHERE id = :id"),
                        {"serial": serial, "id": poi_id})
            updated += 1
            if updated % 100 == 0:
                print(f"  Updated {updated}/{count}...")

        conn.commit()
        print(f"Done! Backfilled {updated} serial numbers")
