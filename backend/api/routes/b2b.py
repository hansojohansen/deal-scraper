"""
B2B endpoints:
  GET /api/v1/b2b/stream       — Server-Sent Events feed of new deals (pro/dealer only)
  GET /api/v1/b2b/lookup-reg   — Proxy Statens vegvesen reg lookup for Trade-In Calculator
"""
import asyncio
import json

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import Car, DealEvent, OutlierScore
from backend.db.session import session_factory
from backend.dependencies import get_current_user, get_db
from backend.exceptions import ApiError
from scraper.vegvesen import enrich_vegvesen

router = APIRouter(prefix="/api/v1/b2b", tags=["b2b"])

_PLAN_B2B = {"pro", "dealer"}
_POLL_INTERVAL = 30
_HEARTBEAT_INTERVAL = 25


async def _poll_events(last_id: int, min_discount: float, brand: str | None,
                       model: str | None, max_price: int | None,
                       quality_tier: str | None) -> list[dict]:
    async with session_factory() as db:
        q = select(DealEvent).where(DealEvent.id > last_id).order_by(DealEvent.id).limit(50)
        if brand:
            q = q.where(DealEvent.brand.ilike(brand))
        if model:
            q = q.where(DealEvent.model.ilike(model))
        if max_price:
            q = q.where(DealEvent.price <= max_price)
        if quality_tier:
            q = q.where(DealEvent.quality_tier == quality_tier)
        result = await db.execute(q)
        rows = list(result.scalars())

    events = []
    for e in rows:
        if min_discount > 0 and abs(e.score) < min_discount / 100:
            continue
        events.append({
            "id": e.id,
            "car_id": e.car_id,
            "score": round(e.score, 4),
            "quality_tier": e.quality_tier,
            "brand": e.brand,
            "model": e.model,
            "price": e.price,
            "image_url": e.image_url,
            "detected_at": e.detected_at.isoformat() if e.detected_at else None,
            "discount_pct": round(abs(e.score) * 100),
        })
    return events


@router.get("/stream")
async def stream_deals(
    request: Request,
    min_discount_pct: int = Query(0, ge=0, le=100),
    brand: str | None = None,
    model: str | None = None,
    max_price: int | None = None,
    quality_tier: str | None = None,
    current_user=Depends(get_current_user),
):
    """Server-Sent Events stream of newly detected deals. Requires pro or dealer plan."""
    if getattr(current_user, "plan", "free") not in _PLAN_B2B:
        raise ApiError(code="plan_required", message="Arbitrage Radar krever Pro eller Dealer-abonnement.", status=403)

    async def generate():
        last_id = 0
        tick = 0
        while True:
            if await request.is_disconnected():
                break
            try:
                events = await _poll_events(
                    last_id, min_discount_pct, brand, model, max_price, quality_tier
                )
                for ev in events:
                    last_id = ev["id"]
                    yield f"id: {last_id}\ndata: {json.dumps(ev)}\n\n"
            except Exception:
                pass

            tick += 1
            # Heartbeat every ~25 s (one tick = HEARTBEAT_INTERVAL, poll every POLL_INTERVAL)
            yield f"data: {json.dumps({'type': 'ping'})}\n\n"
            await asyncio.sleep(_POLL_INTERVAL)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/lookup-reg")
async def lookup_reg(
    reg: str = Query(..., description="Norwegian registration number, e.g. AB12345"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Proxy Statens vegvesen to fetch vehicle data by registration number."""
    reg_clean = reg.strip().upper().replace(" ", "")
    if not reg_clean:
        raise ApiError(code="invalid_reg", message="Registreringsnummer mangler.", status=400)

    data = await asyncio.to_thread(enrich_vegvesen, reg_clean)
    if not data:
        raise ApiError(code="not_found", message="Kjøretøy ikke funnet i Statens vegvesen.", status=404)

    return {"reg_number": reg_clean, **data}


class PortfolioRequest(BaseModel):
    car_ids: list[int]


class PortfolioItem(BaseModel):
    car_id: int
    title: str | None
    brand: str | None
    model: str | None
    year: int | None
    price: int | None
    fair_value: int | None
    score: float | None
    discount_pct: int | None
    quality_tier: str | None
    recommendation: str


@router.post("/portfolio", response_model=list[PortfolioItem])
async def portfolio_analysis(
    body: PortfolioRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Bulk fair-value analysis for a list of car_ids. Requires pro or dealer plan."""
    if getattr(current_user, "plan", "free") not in _PLAN_B2B:
        raise ApiError(code="plan_required", message="Portfolio-analyse krever Pro eller Dealer-abonnement.", status=403)
    if not body.car_ids:
        return []
    if len(body.car_ids) > 50:
        raise ApiError(code="too_many", message="Maks 50 biler per analyse.", status=400)

    cars = (await db.execute(
        select(Car).where(Car.id.in_(body.car_ids))
    )).scalars().all()

    scores = (await db.execute(
        select(OutlierScore).where(OutlierScore.car_id.in_(body.car_ids))
    )).scalars().all()
    score_map = {s.car_id: s for s in scores}

    results: list[PortfolioItem] = []
    for car in cars:
        s = score_map.get(car.id)
        fair_value = s.fair_value if s else None
        score = s.score if s else None
        discount_pct = round(abs(score) * 100) if score is not None else None
        quality_tier = s.quality_tier if s else None

        if score is None:
            recommendation = "Ingen data"
        elif score <= -0.25:
            recommendation = "Kjøp — sterkt underpriset"
        elif score <= -0.10:
            recommendation = "Interessant — under markedspris"
        elif score <= 0.05:
            recommendation = "Rettferdig priset"
        else:
            recommendation = "Overpriset — forhandle ned"

        results.append(PortfolioItem(
            car_id=car.id,
            title=car.title,
            brand=car.brand,
            model=car.model,
            year=car.year,
            price=car.price,
            fair_value=fair_value,
            score=score,
            discount_pct=discount_pct,
            quality_tier=quality_tier,
            recommendation=recommendation,
        ))

    return results
