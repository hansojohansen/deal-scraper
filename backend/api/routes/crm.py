"""CRM Kanban routes — dealer-only lead management."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.crud import crm as crm_crud
from backend.dependencies import get_current_user, get_db
from backend.exceptions import ApiError

router = APIRouter(prefix="/api/v1/crm", tags=["crm"])

_PLAN_CRM = {"pro", "dealer"}
_STAGES = {"lead", "contact", "negotiation", "done", "lost"}


def _require_plan(user) -> None:
    if getattr(user, "plan", "free") not in _PLAN_CRM:
        raise ApiError(code="plan_required", message="CRM krever Pro eller Dealer-abonnement.", status=403)


class LeadOut(BaseModel):
    id: int
    car_id: int | None
    stage: str
    title: str | None
    brand: str | None
    model: str | None
    year: int | None
    price: int | None
    notes: str | None
    contact_name: str | None
    contact_phone: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LeadCreate(BaseModel):
    car_id: int | None = None
    stage: str = "lead"
    title: str | None = None
    brand: str | None = None
    model: str | None = None
    year: int | None = None
    price: int | None = None
    notes: str | None = None
    contact_name: str | None = None
    contact_phone: str | None = None


class LeadUpdate(BaseModel):
    stage: str | None = None
    title: str | None = None
    notes: str | None = None
    contact_name: str | None = None
    contact_phone: str | None = None
    price: int | None = None


@router.get("/leads", response_model=list[LeadOut])
async def list_leads(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_plan(current_user)
    return await crm_crud.list_leads(db, current_user.id)


@router.post("/leads", response_model=LeadOut, status_code=201)
async def create_lead(
    body: LeadCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_plan(current_user)
    if body.stage not in _STAGES:
        raise ApiError(code="invalid_stage", message=f"Ugyldig stage. Velg mellom: {', '.join(_STAGES)}", status=400)
    lead = await crm_crud.create_lead(db, current_user.id, **body.model_dump())
    await db.commit()
    await db.refresh(lead)
    return lead


@router.patch("/leads/{lead_id}", response_model=LeadOut)
async def update_lead(
    lead_id: int,
    body: LeadUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_plan(current_user)
    lead = await crm_crud.get_lead(db, lead_id, current_user.id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead ikke funnet.")
    if body.stage is not None and body.stage not in _STAGES:
        raise ApiError(code="invalid_stage", message=f"Ugyldig stage.", status=400)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    await crm_crud.update_lead(db, lead, **updates)
    await db.commit()
    await db.refresh(lead)
    return lead


@router.delete("/leads/{lead_id}", status_code=204)
async def delete_lead(
    lead_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_plan(current_user)
    lead = await crm_crud.get_lead(db, lead_id, current_user.id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead ikke funnet.")
    await crm_crud.delete_lead(db, lead)
    await db.commit()
