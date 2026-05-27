from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from backend.dependencies import get_db, CursorPagination
from backend.db.crud import alerts as alert_crud
from backend.exceptions import ApiError
from backend.schemas.alert import AlertCreate, AlertUpdate, AlertResponse

router = APIRouter(prefix="/api/v1/alerts", tags=["alerts"])

@router.post("", response_model=AlertResponse, status_code=201)
async def create_alert(body: AlertCreate, db: AsyncSession = Depends(get_db)):
    alert = await alert_crud.create(db, body.model_dump())
    await db.commit()
    await db.refresh(alert)
    return alert

@router.get("", response_model=list[AlertResponse])
async def list_alerts(pagination: CursorPagination = Depends(), db: AsyncSession = Depends(get_db)):
    return await alert_crud.list_active(db, cursor=pagination.cursor, limit=pagination.limit)

@router.get("/{alert_id}", response_model=AlertResponse)
async def get_alert(alert_id: int, db: AsyncSession = Depends(get_db)):
    alert = await alert_crud.get_by_id(db, alert_id)
    if not alert:
        raise ApiError(code="not_found", message="Alert not found", status=404)
    return alert

@router.patch("/{alert_id}", response_model=AlertResponse)
async def update_alert(alert_id: int, body: AlertUpdate, db: AsyncSession = Depends(get_db)):
    alert = await alert_crud.get_by_id(db, alert_id)
    if not alert:
        raise ApiError(code="not_found", message="Alert not found", status=404)
    alert = await alert_crud.update(db, alert, body.model_dump(exclude_none=True))
    await db.commit()
    await db.refresh(alert)
    return alert

@router.delete("/{alert_id}", status_code=204)
async def delete_alert(alert_id: int, db: AsyncSession = Depends(get_db)):
    alert = await alert_crud.get_by_id(db, alert_id)
    if not alert:
        raise ApiError(code="not_found", message="Alert not found", status=404)
    await alert_crud.delete(db, alert)
    await db.commit()
