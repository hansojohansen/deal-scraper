import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import CrmLead


async def list_leads(db: AsyncSession, user_id: uuid.UUID) -> list[CrmLead]:
    result = await db.execute(
        select(CrmLead)
        .where(CrmLead.user_id == user_id)
        .order_by(CrmLead.created_at.desc())
    )
    return list(result.scalars())


async def create_lead(db: AsyncSession, user_id: uuid.UUID, **kwargs) -> CrmLead:
    lead = CrmLead(user_id=user_id, **kwargs)
    db.add(lead)
    await db.flush()
    return lead


async def get_lead(db: AsyncSession, lead_id: int, user_id: uuid.UUID) -> CrmLead | None:
    result = await db.execute(
        select(CrmLead).where(CrmLead.id == lead_id, CrmLead.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def update_lead(db: AsyncSession, lead: CrmLead, **kwargs) -> CrmLead:
    for k, v in kwargs.items():
        setattr(lead, k, v)
    return lead


async def delete_lead(db: AsyncSession, lead: CrmLead) -> None:
    await db.delete(lead)
