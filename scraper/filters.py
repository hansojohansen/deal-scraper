def is_relevant(item: dict, config: dict | None = None) -> bool:
    """Pre-filter listings before AI enrichment. Fast rule-based check."""
    # Must have a URL and source_id
    if not item.get("url") or not item.get("source_id"):
        return False

    # Must have a price (unparseable prices are skipped)
    if item.get("price") is None:
        return False

    # Sanity bounds on price (under 1 kr or over 10M NOK is likely a parse error)
    price = item["price"]
    if price < 1 or price > 10_000_000:
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
