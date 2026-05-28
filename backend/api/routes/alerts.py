from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.crud import alerts as alert_crud
from backend.dependencies import CursorPagination, get_current_user, get_db
from backend.exceptions import ApiError
from backend.sanitize import sanitize_str
from backend.schemas.alert import AlertCreate, AlertResponse, AlertUpdate

router = APIRouter(prefix="/api/v1/alerts", tags=["alerts"])


@router.post("", response_model=AlertResponse, status_code=201)
async def create_alert(
    body: AlertCreate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = body.model_dump()
    data["brand"] = sanitize_str(data.get("brand"))
    data["model"] = sanitize_str(data.get("model"))
    data["fuel_type"] = sanitize_str(data.get("fuel_type"))
    alert = await alert_crud.create(db, data, user_id=current_user.id, notify_email=current_user.email)
    await db.commit()
    await db.refresh(alert)
    return alert


@router.get("", response_model=list[AlertResponse])
async def list_alerts(
    pagination: CursorPagination = Depends(),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await alert_crud.list_active(
        db, user_id=current_user.id, cursor=pagination.cursor, limit=pagination.limit
    )


@router.get("/{alert_id}", response_model=AlertResponse)
async def get_alert(
    alert_id: int,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    alert = await alert_crud.get_by_id(db, alert_id)
    if not alert:
        raise ApiError(code="not_found", message="Alert not found", status=404)
    if alert.user_id != current_user.id:
        raise ApiError(code="forbidden", message="Forbidden", status=403)
    return alert


@router.patch("/{alert_id}", response_model=AlertResponse)
async def update_alert(
    alert_id: int,
    body: AlertUpdate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    alert = await alert_crud.get_by_id(db, alert_id)
    if not alert:
        raise ApiError(code="not_found", message="Alert not found", status=404)
    if alert.user_id != current_user.id:
        raise ApiError(code="forbidden", message="Forbidden", status=403)
    alert = await alert_crud.update(db, alert, body.model_dump(exclude_none=True))
    await db.commit()
    await db.refresh(alert)
    return alert


@router.delete("/{alert_id}", status_code=204)
async def delete_alert(
    alert_id: int,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    alert = await alert_crud.get_by_id(db, alert_id)
    if not alert:
        raise ApiError(code="not_found", message="Alert not found", status=404)
    if alert.user_id != current_user.id:
        raise ApiError(code="forbidden", message="Forbidden", status=403)
    await alert_crud.delete(db, alert)
    await db.commit()
