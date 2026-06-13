_DEFAULT_MAX_PRICE = 3_000_000


def is_relevant(item: dict, config: dict | None = None) -> bool:
    """Pre-filter listings before storage. Fast rule-based check."""
    if not item.get("url") or not item.get("source_id"):
        return False

    # Drop leasing and parts-car listings — leasing monthly prices are misread
    # as purchase prices; parts cars are not roadworthy and skew statistics.
    if item.get("listing_type") in ("lease", "parts"):
        return False

    if item.get("price") is None:
        return False

    price = item["price"]
    max_price = _DEFAULT_MAX_PRICE
    if config:
        max_price = config.get("max_price_nok", _DEFAULT_MAX_PRICE)

    # Hard sanity bounds — under 1 kr or over max is a parse error
    if price < 1 or price > max_price:
        return False

    if config:
        price_min = config.get("price_min")
        price_max = config.get("price_max")
        year_min = config.get("year_min")
        if price_min and price < price_min:
            return False
        if price_max and price > price_max:
            return False
        if year_min and item.get("year") and item["year"] < year_min:
            return False

    return True
