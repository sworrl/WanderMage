-- Create crawl_status table for tracking POI crawl progress

CREATE TABLE IF NOT EXISTS crawl_status (
    id SERIAL PRIMARY KEY,

    -- Crawl identification
    crawl_type VARCHAR(50) NOT NULL,
    target_region VARCHAR(100),

    -- Status tracking
    status VARCHAR(20) NOT NULL,
    current_state VARCHAR(2),
    current_cell INTEGER DEFAULT 0,
    total_cells INTEGER DEFAULT 0,

    -- Progress metrics
    states_completed INTEGER DEFAULT 0,
    total_states INTEGER DEFAULT 0,
    pois_fetched INTEGER DEFAULT 0,
    pois_saved INTEGER DEFAULT 0,

    -- Performance metrics
    start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    end_time TIMESTAMP WITH TIME ZONE,
    last_update TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    estimated_completion TIMESTAMP WITH TIME ZONE,

    -- Error tracking
    errors_count INTEGER DEFAULT 0,
    last_error TEXT,
    rate_limit_hits INTEGER DEFAULT 0,

    -- Additional info
    categories TEXT,
    notes TEXT
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_crawl_status_status ON crawl_status(status);
CREATE INDEX IF NOT EXISTS idx_crawl_status_last_update ON crawl_status(last_update DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_status_start_time ON crawl_status(start_time DESC);

-- Add a trigger to automatically update last_update timestamp
CREATE OR REPLACE FUNCTION update_crawl_status_last_update()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_update = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_crawl_status_last_update
    BEFORE UPDATE ON crawl_status
    FOR EACH ROW
    EXECUTE FUNCTION update_crawl_status_last_update();

COMMENT ON TABLE crawl_status IS 'Tracks real-time POI crawl progress for display on web interface';
COMMENT ON COLUMN crawl_status.crawl_type IS 'Type of crawl: state, full_us, test';
COMMENT ON COLUMN crawl_status.status IS 'Current status: running, completed, failed, paused';
COMMENT ON COLUMN crawl_status.current_state IS 'Current US state being processed (2-letter code)';
COMMENT ON COLUMN crawl_status.rate_limit_hits IS 'Number of times Overpass API rate limit was hit';
