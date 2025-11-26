"""
Stop Categorizer Service

Automatically detects stop categories based on name and source,
and provides icons and colors for each category.
"""

from typing import Optional

# Category definitions with keywords for detection
CATEGORY_KEYWORDS = {
    'winery': ['winery', 'vineyard', 'wine'],
    'brewery': ['brewery', 'brewing', 'beer', 'ale'],
    'distillery': ['distillery', 'spirits', 'whiskey', 'bourbon'],
    'cidery': ['cidery', 'cider'],
    'restaurant': ['restaurant', 'cafe', 'diner', 'eatery', 'grill', 'bistro', 'kitchen'],
    'farm': ['farm', 'ranch', 'orchard', 'dairy'],
    'campground': ['campground', 'camping', 'camp'],
    'rv_park': ['rv park', 'rv resort', 'rv village', 'motorhome'],
    'museum': ['museum', 'gallery', 'exhibit'],
    'golf': ['golf', 'country club'],
    'marina': ['marina', 'harbor', 'yacht', 'boat'],
    'gas_station': ['gas station', 'fuel', 'truck stop', 'travel center', 'pilot', 'flying j', 'loves'],
    'hotel': ['hotel', 'motel', 'inn', 'lodge', 'resort'],
    'attraction': ['attraction', 'park', 'zoo', 'aquarium', 'theme'],
    'store': ['store', 'shop', 'market', 'mall'],
    'harvest_host': ['harvest host'],
    'boondocking': ['boondocking', 'dispersed', 'blm', 'national forest'],
}

# Icons for each category (Material Icons names)
CATEGORY_ICONS = {
    'winery': 'wine_bar',
    'brewery': 'sports_bar',
    'distillery': 'liquor',
    'cidery': 'local_bar',
    'restaurant': 'restaurant',
    'farm': 'agriculture',
    'campground': 'camping',
    'rv_park': 'rv_hookup',
    'museum': 'museum',
    'golf': 'golf_course',
    'marina': 'sailing',
    'gas_station': 'local_gas_station',
    'hotel': 'hotel',
    'attraction': 'attractions',
    'store': 'store',
    'harvest_host': 'volunteer_activism',
    'boondocking': 'nature',
    'other': 'place',
}

# Colors for each category (hex colors)
CATEGORY_COLORS = {
    'winery': '#722F37',      # Wine red
    'brewery': '#F59E0B',     # Amber
    'distillery': '#92400E',  # Brown
    'cidery': '#84CC16',      # Lime
    'restaurant': '#EF4444',  # Red
    'farm': '#22C55E',        # Green
    'campground': '#10B981',  # Emerald
    'rv_park': '#3B82F6',     # Blue
    'museum': '#8B5CF6',      # Purple
    'golf': '#16A34A',        # Green
    'marina': '#0EA5E9',      # Sky blue
    'gas_station': '#6B7280', # Gray
    'hotel': '#EC4899',       # Pink
    'attraction': '#F97316',  # Orange
    'store': '#6366F1',       # Indigo
    'harvest_host': '#14B8A6', # Teal
    'boondocking': '#65A30D', # Lime green
    'other': '#9CA3AF',       # Gray
}


def detect_category(
    name: str,
    source: Optional[str] = None,
    description: Optional[str] = None
) -> str:
    """
    Detect the category of a stop based on its name and source.

    Args:
        name: The stop name
        source: The data source (e.g., 'harvest_hosts', 'campendium')
        description: Optional description text

    Returns:
        Category string
    """
    # Combine searchable text
    search_text = name.lower()
    if description:
        search_text += " " + description.lower()

    # Check source first for quick categorization
    if source:
        source_lower = source.lower()
        if 'harvest' in source_lower:
            return 'harvest_host'
        elif 'campendium' in source_lower or 'freecampsites' in source_lower:
            # Further analyze name for campendium sources
            pass

    # Search for keywords in each category
    for category, keywords in CATEGORY_KEYWORDS.items():
        for keyword in keywords:
            if keyword in search_text:
                return category

    return 'other'


def get_category_icon(category: str) -> str:
    """
    Get the Material Icon name for a category.

    Args:
        category: The category string

    Returns:
        Material Icon name
    """
    return CATEGORY_ICONS.get(category, CATEGORY_ICONS['other'])


def get_category_color(category: str) -> str:
    """
    Get the hex color for a category.

    Args:
        category: The category string

    Returns:
        Hex color string
    """
    return CATEGORY_COLORS.get(category, CATEGORY_COLORS['other'])


def get_all_categories() -> list:
    """
    Get list of all available categories.

    Returns:
        List of category strings
    """
    return list(CATEGORY_ICONS.keys())
