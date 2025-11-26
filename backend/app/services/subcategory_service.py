"""
Subcategory Service - Provides category display names and subcategory info.
"""

CATEGORY_DISPLAY_NAMES = {
    'winery': 'Wineries',
    'brewery': 'Breweries',
    'distillery': 'Distilleries',
    'cidery': 'Cideries',
    'restaurant': 'Restaurants',
    'farm': 'Farms',
    'campground': 'Campgrounds',
    'rv_park': 'RV Parks',
    'museum': 'Museums',
    'golf': 'Golf Courses',
    'marina': 'Marinas',
    'gas_station': 'Gas Stations',
    'hotel': 'Hotels',
    'attraction': 'Attractions',
    'store': 'Stores',
    'harvest_host': 'Harvest Hosts',
    'boondocking': 'Boondocking',
    'other': 'Other'
}


def get_subcategory(category: str, tags: dict = None) -> str:
    """Get subcategory for a POI based on category and tags."""
    return category


def get_category_display_name(category: str) -> str:
    """Get display name for a category."""
    return CATEGORY_DISPLAY_NAMES.get(category, category.replace('_', ' ').title())
