import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_admin_id
from app.schemas.integrity import (
    AdjustmentCreate,
    AdjustmentOut,
    ApplyRequest,
    ApplyResponse,
    CheckResponse,
    NoticeCreate,
    NoticeOut,
    RunRequest,
)
from app.services.integrity import (
    add_adjustment,
    apply_actions,
    create_notice,
    latest_results,
    list_adjustments,
    list_notices,
    revoke_adjustment,
    run_check,
)


router = APIRouter(prefix="/admin/integrity", tags=["integrity"])


@router.post("/run", response_model=CheckResponse)
def run_integrity_check(
    payload: RunRequest,
    admin_id: uuid.UUID = Depends(get_current_admin_id),
    db: Session = Depends(get_db),
) -> CheckResponse:
    return run_check(db, admin_id, payload)


@router.get("/results", response_model=CheckResponse)
def get_integrity_results(
    round_code: str = Query(alias="round"),
    _admin_id: uuid.UUID = Depends(get_current_admin_id),
    db: Session = Depends(get_db),
) -> CheckResponse:
    return latest_results(db, round_code)


@router.post("/apply", response_model=ApplyResponse)
def apply_integrity_actions(
    payload: ApplyRequest,
    admin_id: uuid.UUID = Depends(get_current_admin_id),
    db: Session = Depends(get_db),
) -> ApplyResponse:
    return apply_actions(db, admin_id, payload.round, payload.items)


@router.post("/adjustments", response_model=AdjustmentOut)
def create_adjustment(
    payload: AdjustmentCreate,
    admin_id: uuid.UUID = Depends(get_current_admin_id),
    db: Session = Depends(get_db),
) -> AdjustmentOut:
    return add_adjustment(db, admin_id, payload)


@router.get("/adjustments", response_model=list[AdjustmentOut])
def get_adjustments(
    round_code: str | None = Query(default=None, alias="round"),
    _admin_id: uuid.UUID = Depends(get_current_admin_id),
    db: Session = Depends(get_db),
) -> list[AdjustmentOut]:
    return list_adjustments(db, round_code)


@router.post("/adjustments/{adjustment_id}/revoke", response_model=AdjustmentOut)
def revoke_integrity_adjustment(
    adjustment_id: uuid.UUID,
    admin_id: uuid.UUID = Depends(get_current_admin_id),
    db: Session = Depends(get_db),
) -> AdjustmentOut:
    return revoke_adjustment(db, admin_id, adjustment_id)


@router.post("/notices", response_model=NoticeOut)
def send_notice(
    payload: NoticeCreate,
    admin_id: uuid.UUID = Depends(get_current_admin_id),
    db: Session = Depends(get_db),
) -> NoticeOut:
    return create_notice(db, admin_id, payload)


@router.get("/notices", response_model=list[NoticeOut])
def get_notices(
    team_code: str | None = Query(default=None),
    _admin_id: uuid.UUID = Depends(get_current_admin_id),
    db: Session = Depends(get_db),
) -> list[NoticeOut]:
    return list_notices(db, team_code)
