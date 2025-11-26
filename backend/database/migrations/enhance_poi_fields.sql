-- Add additional fields to POI table for comprehensive data capture

-- Operating hours (JSON string like: {"monday": "9:00-17:00", "tuesday": "9:00-17:00", ...})
ALTER TABLE pois ADD COLUMN IF NOT EXISTS hours TEXT;

-- Image URLs (JSON array of image URLs from OSM or other sources)
ALTER TABLE pois ADD COLUMN IF NOT EXISTS image_urls TEXT;

-- Opening/closing dates for seasonal locations
ALTER TABLE pois ADD COLUMN IF NOT EXISTS opening_date DATE;
ALTER TABLE pois ADD COLUMN IF NOT EXISTS closing_date DATE;

-- Additional contact information
ALTER TABLE pois ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE pois ADD COLUMN IF NOT EXISTS facebook VARCHAR(255);
ALTER TABLE pois ADD COLUMN IF NOT EXISTS instagram VARCHAR(255);

-- Operator/owner information
ALTER TABLE pois ADD COLUMN IF NOT EXISTS operator VARCHAR(255);
ALTER TABLE pois ADD COLUMN IF NOT EXISTS brand VARCHAR(255);

-- Accessibility
ALTER TABLE pois ADD COLUMN IF NOT EXISTS wheelchair_accessible BOOLEAN;

-- Payment methods (JSON array like: ["cash", "credit_card", "debit_card"])
ALTER TABLE pois ADD COLUMN IF NOT EXISTS payment_methods TEXT;

-- Fee information
ALTER TABLE pois ADD COLUMN IF NOT EXISTS fee BOOLEAN;
ALTER TABLE pois ADD COLUMN IF NOT EXISTS fee_amount DECIMAL(10,2);

-- Capacity (for campgrounds, etc.)
ALTER TABLE pois ADD COLUMN IF NOT EXISTS capacity INTEGER;

-- WiFi availability
ALTER TABLE pois ADD COLUMN IF NOT EXISTS internet_access VARCHAR(50);
ALTER TABLE pois ADD COLUMN IF NOT EXISTS wifi BOOLEAN;

-- Utilities (for campgrounds)
ALTER TABLE pois ADD COLUMN IF NOT EXISTS electricity BOOLEAN;
ALTER TABLE pois ADD COLUMN IF NOT EXISTS water BOOLEAN;
ALTER TABLE pois ADD COLUMN IF NOT EXISTS sewer BOOLEAN;

-- Fuel types (for gas stations)
ALTER TABLE pois ADD COLUMN IF NOT EXISTS fuel_types TEXT; -- JSON array like ["diesel", "gasoline", "e85"]

-- Restaurant/amenity specific
ALTER TABLE pois ADD COLUMN IF NOT EXISTS cuisine VARCHAR(255);
ALTER TABLE pois ADD COLUMN IF NOT EXISTS outdoor_seating BOOLEAN;
ALTER TABLE pois ADD COLUMN IF NOT EXISTS takeaway BOOLEAN;
ALTER TABLE pois ADD COLUMN IF NOT EXISTS delivery BOOLEAN;

-- Add indexes for commonly queried fields
CREATE INDEX IF NOT EXISTS idx_pois_operator ON pois(operator);
CREATE INDEX IF NOT EXISTS idx_pois_brand ON pois(brand);
CREATE INDEX IF NOT EXISTS idx_pois_fee ON pois(fee);
CREATE INDEX IF NOT EXISTS idx_pois_wifi ON pois(wifi);
CREATE INDEX IF NOT EXISTS idx_pois_wheelchair ON pois(wheelchair_accessible);

COMMENT ON COLUMN pois.hours IS 'Operating hours as JSON object with days as keys';
COMMENT ON COLUMN pois.image_urls IS 'Array of image URLs as JSON';
COMMENT ON COLUMN pois.payment_methods IS 'Accepted payment methods as JSON array';
COMMENT ON COLUMN pois.fuel_types IS 'Available fuel types as JSON array';
