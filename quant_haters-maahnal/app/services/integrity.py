"""Admin integrity workflow: store look-ahead checks, apply deductions and send team notices.

Nothing here changes the scores table. Deductions are rows in score_adjustments and are
subtracted when leaderboards are computed (see app/services/leaderboard.py).
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, aliased

from app.models import (
    AdminAuditLog,
    AdminUser,
    LookaheadResult,
    Round,
    ScoreAdjustment,
    Team,
    TeamNotice,
)
from app.schemas.integrity import (
    AdjustmentCreate,
    AdjustmentOut,
    ApplyItem,
    ApplyResponse,
    CheckResponse,
    CurrentAdjustment,
    NoticeCreate,
    NoticeOut,
    RunRequest,
    SubmissionCheck,
    TeamCheck,
    Thresholds,
)
from app.services.lookahead import LookaheadError, run_lookahead_check, summarize_by_team

MAX_POINTS = Decimal("100")
MAX_MESSAGE_LENGTH = 1000
MAX_REASON_LENGTH = 500


def _check_round(code: str) -> str:
    if code == "R3":
        raise HTTPException(status_code=400, detail="Round 3 is not checked")
    if code not in ("R1", "R2"):
        raise HTTPException(status_code=400, detail="Round must be R1 or R2")
    return code


def _round_by_code(db: Session, code: str) -> Round:
    round_ = db.scalar(select(Round).where(Round.round_code == code))
    if round_ is None:
        raise HTTPException(status_code=400, detail=f"Round {code} is not configured.")
    return round_


def _team_by_code(db: Session, team_code: str) -> Team:
    team = db.scalar(select(Team).where(Team.team_code == team_code.strip()))
    if team is None:
        raise HTTPException(status_code=404, detail=f"Team {team_code} not found.")
    return team


def _points(value: float) -> Decimal:
    try:
        points = Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail="Points must be a number.") from None
    if not (Decimal("0") <= points <= MAX_POINTS):
        raise HTTPException(status_code=400, detail="Points must be between 0 and 100.")
    return points


def _text(value: str, *, label: str, limit: int) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail=f"{label} is required.")
    if len(cleaned) > limit:
        raise HTTPException(status_code=400, detail=f"{label} must be {limit} characters or less.")
    return cleaned


def _pct(value: float | None) -> str:
    return "n/a" if value is None else f"{round(value * 100)}%"


def _audit(db: Session, admin_id: uuid.UUID, action: str, details: dict) -> None:
    db.add(AdminAuditLog(admin_id=admin_id, action=action, details=details))


def _latest_check_rows(db: Session, round_id: int, team_id: uuid.UUID | None = None) -> list[LookaheadResult]:
    """Rows of the newest check run for the round (optionally for one team)."""
    latest_run = db.scalar(
        select(LookaheadResult.check_run_id)
        .where(LookaheadResult.round_id == round_id)
        .order_by(LookaheadResult.created_at.desc(), LookaheadResult.id.desc())
        .limit(1)
    )
    if latest_run is None:
        return []
    statement = select(LookaheadResult).where(LookaheadResult.check_run_id == latest_run)
    if team_id is not None:
        statement = statement.where(LookaheadResult.team_id == team_id)
    return list(db.scalars(statement.order_by(LookaheadResult.id)).all())


def _active_lookahead(db: Session, team_id: uuid.UUID, round_id: int) -> ScoreAdjustment | None:
    return db.scalar(
        select(ScoreAdjustment).where(
            ScoreAdjustment.team_id == team_id,
            ScoreAdjustment.round_id == round_id,
            ScoreAdjustment.kind == "lookahead",
            ScoreAdjustment.revoked_at.is_(None),
        )
    )


def _entry_from_row(row: LookaheadResult, team_code: str, team_name: str) -> dict:
    details = dict(row.details or {})
    return {
        **details,
        "submission_id": str(row.submission_id),
        "team_id": row.team_id,
        "team_code": team_code,
        "team_name": team_name,
        "status": row.status,
        "worst_rule": row.worst_rule,
        "worst_agreement": None if row.worst_agreement is None else float(row.worst_agreement),
    }


def _build_response(
    db: Session,
    round_code: str,
    check_run_id: uuid.UUID | None,
    checked_at: datetime | None,
    thresholds: dict | None,
    entries: list[dict],
) -> CheckResponse:
    round_ = _round_by_code(db, round_code)
    team_ids = {entry["team_id"] for entry in entries}

    adjustments = {
        row.team_id: row
        for row in db.scalars(
            select(ScoreAdjustment).where(
                ScoreAdjustment.round_id == round_.id,
                ScoreAdjustment.kind == "lookahead",
                ScoreAdjustment.revoked_at.is_(None),
            )
        ).all()
        if row.team_id in team_ids
    }
    last_notice = {
        team_id: last_at
        for team_id, last_at in db.execute(
            select(TeamNotice.team_id, func.max(TeamNotice.created_at))
            .group_by(TeamNotice.team_id)
        ).all()
    }

    teams = []
    for row in summarize_by_team(entries):
        team_id = row["team_id"]
        adjustment = adjustments.get(team_id)
        teams.append(
            TeamCheck(
                team_id=str(team_id),
                team_code=row["team_code"],
                team_name=row["team_name"],
                status=row["status"],
                submission_count=row["submission_count"],
                submission_no=row["submission_no"],
                worst_submission_id=str(row["worst_submission_id"]),
                worst_rule=row["worst_rule"],
                worst_agreement=row["worst_agreement"],
                public_score=row["public_score"],
                private_score=row["private_score"],
                suggested_points=row["suggested_points"],
                suggested_message_key=row["suggested_message_key"],
                current_adjustment=None
                if adjustment is None
                else CurrentAdjustment(id=str(adjustment.id), points=float(adjustment.points), created_at=adjustment.created_at),
                last_notice_at=last_notice.get(team_id),
            )
        )

    submissions = [
        SubmissionCheck(
            submission_id=str(entry["submission_id"]),
            team_id=str(entry["team_id"]),
            team_code=entry["team_code"],
            team_name=entry["team_name"],
            stock=entry["stock"],
            submission_no=entry["submission_no"],
            submitted_at=entry["submitted_at"],
            public_score=entry["public_score"],
            private_score=entry["private_score"],
            status=entry["status"],
            worst_rule=entry["worst_rule"],
            worst_agreement=entry["worst_agreement"],
            note=entry["note"],
            rules=entry["rules"],
        )
        for entry in entries
    ]
    submissions.sort(key=lambda s: (s.team_code, s.submission_no))

    return CheckResponse(
        round=round_code,
        check_run_id=None if check_run_id is None else str(check_run_id),
        checked_at=checked_at,
        thresholds=None if thresholds is None else Thresholds(**thresholds),
        submissions=submissions,
        teams=teams,
    )


def run_check(db: Session, admin_id: uuid.UUID, payload: RunRequest) -> CheckResponse:
    round_code = _check_round(payload.round)
    if not (0 < payload.rule_min <= 1 and 0 < payload.review <= payload.flag <= 1):
        raise HTTPException(status_code=400, detail="Thresholds must be between 0 and 1, with review at or below flag.")

    try:
        entries = run_lookahead_check(
            db,
            int(round_code[1:]),
            flag=payload.flag,
            review=payload.review,
            rule_min=payload.rule_min,
        )
    except LookaheadError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    round_ = _round_by_code(db, round_code)
    check_run_id = uuid.uuid4()
    checked_at = datetime.now(UTC)
    thresholds = {"flag": payload.flag, "review": payload.review, "rule_min": payload.rule_min}

    for entry in entries:
        db.add(
            LookaheadResult(
                check_run_id=check_run_id,
                submission_id=entry["submission_id"],
                team_id=entry["team_id"],
                round_id=round_.id,
                status=entry["status"],
                worst_rule=entry["worst_rule"],
                worst_agreement=None if entry["worst_agreement"] is None else round(entry["worst_agreement"], 3),
                details={
                    "thresholds": thresholds,
                    "team_code": entry["team_code"],
                    "team_name": entry["team_name"],
                    "stock": entry["stock"],
                    "submission_no": entry["submission_no"],
                    "submitted_at": entry["submitted_at"],
                    "public_score": entry["public_score"],
                    "private_score": entry["private_score"],
                    "note": entry["note"],
                    "rules": entry["rules"],
                },
                checked_by_admin_id=admin_id,
            )
        )
    _audit(
        db,
        admin_id,
        "RUN_LOOKAHEAD_CHECK",
        {"round": round_code, "check_run_id": str(check_run_id), "submissions": len(entries), **thresholds},
    )
    db.commit()

    return _build_response(db, round_code, check_run_id, checked_at, thresholds, entries)


def latest_results(db: Session, round_code: str) -> CheckResponse:
    round_code = _check_round(round_code)
    round_ = _round_by_code(db, round_code)
    rows = _latest_check_rows(db, round_.id)
    if not rows:
        return CheckResponse(round=round_code)

    teams = {team.id: team for team in db.scalars(select(Team).where(Team.id.in_(list({r.team_id for r in rows})))).all()}
    entries = [_entry_from_row(row, teams[row.team_id].team_code, teams[row.team_id].team_name) for row in rows]
    thresholds = (rows[0].details or {}).get("thresholds")
    return _build_response(db, round_code, rows[0].check_run_id, rows[0].created_at, thresholds, entries)


def apply_actions(db: Session, admin_id: uuid.UUID, round_code: str, items: list[ApplyItem]) -> ApplyResponse:
    round_code = _check_round(round_code)
    if not items:
        raise HTTPException(status_code=400, detail="No actions to apply.")
    round_ = _round_by_code(db, round_code)

    # Validate every item before the first write, so a bad item changes nothing.
    prepared = []
    for item in items:
        team = _team_by_code(db, item.team_code)
        points = _points(item.points)
        message = _text(item.message, label="Message", limit=MAX_MESSAGE_LENGTH)
        latest = next(iter(_latest_check_rows(db, round_.id, team.id)), None)
        if latest is not None:
            reason = f"Look-ahead check: {latest.status} {_pct(None if latest.worst_agreement is None else float(latest.worst_agreement))}"
            kind = "lookahead"
            check_run_id = latest.check_run_id
        else:
            reason = f"Custom deduction: {message[:100]}"
            kind = "manual"
            check_run_id = None
        prepared.append((team, points, message, latest, reason, kind, check_run_id))

    now = datetime.now(UTC)
    try:
        adjustments: list[uuid.UUID] = []
        notices: list[uuid.UUID] = []
        for team, points, message, latest, reason, kind, check_run_id in prepared:
            replaced = _active_lookahead(db, team.id, round_.id)
            replaced_id = None
            if replaced is not None:
                replaced.revoked_at = now
                replaced.revoked_by_admin_id = admin_id
                db.flush()
                replaced_id = str(replaced.id)

            adj_id = None
            if points > 0:
                adjustment = ScoreAdjustment(
                    team_id=team.id,
                    round_id=round_.id,
                    points=points,
                    kind=kind,
                    reason=reason,
                    check_run_id=check_run_id,
                    created_by_admin_id=admin_id,
                    created_at=now,
                )
                db.add(adjustment)
                db.flush()
                adjustments.append(adjustment.id)
                adj_id = str(adjustment.id)

            notice = TeamNotice(
                team_id=team.id,
                round_id=round_.id,
                message=message,
                created_by_admin_id=admin_id,
                created_at=now,
            )
            db.add(notice)
            db.flush()

            _audit(
                db,
                admin_id,
                "APPLY_LOOKAHEAD_ACTION",
                {
                    "round": round_code,
                    "team_code": team.team_code,
                    "points": str(points),
                    "adjustment_id": adj_id,
                    "replaced_adjustment_id": replaced_id,
                    "notice_id": str(notice.id),
                },
            )
            notices.append(notice.id)
        db.commit()
    except Exception:
        db.rollback()
        raise

    return ApplyResponse(
        adjustments=[_adjustment_out(db, adjustment_id) for adjustment_id in adjustments],
        notices=[_notice_out(db, notice_id) for notice_id in notices],
    )


def _adjustment_query():
    creator = aliased(AdminUser)
    revoker = aliased(AdminUser)
    statement = (
        select(ScoreAdjustment, Team, Round, creator.username, revoker.username)
        .join(Team, Team.id == ScoreAdjustment.team_id)
        .join(Round, Round.id == ScoreAdjustment.round_id)
        .join(creator, creator.id == ScoreAdjustment.created_by_admin_id)
        .outerjoin(revoker, revoker.id == ScoreAdjustment.revoked_by_admin_id)
    )
    return statement


def _adjustment_row_out(row) -> AdjustmentOut:
    adjustment, team, round_, created_by, revoked_by = row
    return AdjustmentOut(
        id=str(adjustment.id),
        team_code=team.team_code,
        team_name=team.team_name,
        round=round_.round_code,
        kind=adjustment.kind,
        points=float(adjustment.points),
        reason=adjustment.reason,
        created_by=created_by,
        created_at=adjustment.created_at,
        revoked_at=adjustment.revoked_at,
        revoked_by=revoked_by,
    )


def _adjustment_out(db: Session, adjustment_id: uuid.UUID) -> AdjustmentOut:
    row = db.execute(_adjustment_query().where(ScoreAdjustment.id == adjustment_id)).one()
    return _adjustment_row_out(row)


def list_adjustments(db: Session, round_code: str | None) -> list[AdjustmentOut]:
    statement = _adjustment_query().order_by(ScoreAdjustment.created_at.desc(), ScoreAdjustment.id.desc())
    if round_code is not None:
        statement = statement.where(Round.round_code == round_code)
    return [_adjustment_row_out(row) for row in db.execute(statement).all()]


def add_adjustment(db: Session, admin_id: uuid.UUID, payload: AdjustmentCreate) -> AdjustmentOut:
    if payload.round not in ("R1", "R2", "R3"):
        raise HTTPException(status_code=400, detail="Round must be R1, R2 or R3.")
    team = _team_by_code(db, payload.team_code)
    round_ = _round_by_code(db, payload.round)
    points = _points(payload.points)
    reason = _text(payload.reason, label="Reason", limit=MAX_REASON_LENGTH)

    adjustment = ScoreAdjustment(
        team_id=team.id,
        round_id=round_.id,
        points=points,
        kind="manual",
        reason=reason,
        created_by_admin_id=admin_id,
    )
    db.add(adjustment)
    db.flush()
    _audit(
        db,
        admin_id,
        "ADD_SCORE_ADJUSTMENT",
        {"team_code": team.team_code, "round": payload.round, "points": str(points), "adjustment_id": str(adjustment.id)},
    )
    db.commit()
    return _adjustment_out(db, adjustment.id)


def revoke_adjustment(db: Session, admin_id: uuid.UUID, adjustment_id: uuid.UUID) -> AdjustmentOut:
    adjustment = db.scalar(select(ScoreAdjustment).where(ScoreAdjustment.id == adjustment_id).with_for_update())
    if adjustment is None:
        raise HTTPException(status_code=404, detail="Deduction not found.")
    if adjustment.revoked_at is not None:
        raise HTTPException(status_code=400, detail="This deduction has already been revoked.")
    adjustment.revoked_at = datetime.now(UTC)
    adjustment.revoked_by_admin_id = admin_id
    _audit(db, admin_id, "REVOKE_SCORE_ADJUSTMENT", {"adjustment_id": str(adjustment.id), "kind": adjustment.kind})
    db.commit()
    return _adjustment_out(db, adjustment.id)


def _notice_query():
    creator = aliased(AdminUser)
    return (
        select(TeamNotice, Team, Round, creator.username)
        .join(Team, Team.id == TeamNotice.team_id)
        .outerjoin(Round, Round.id == TeamNotice.round_id)
        .join(creator, creator.id == TeamNotice.created_by_admin_id)
    )


def _notice_row_out(row) -> NoticeOut:
    notice, team, round_, created_by = row
    return NoticeOut(
        id=str(notice.id),
        team_code=team.team_code,
        team_name=team.team_name,
        round=None if round_ is None else round_.round_code,
        message=notice.message,
        created_by=created_by,
        created_at=notice.created_at,
        acknowledged_at=notice.acknowledged_at,
    )


def _notice_out(db: Session, notice_id: uuid.UUID) -> NoticeOut:
    return _notice_row_out(db.execute(_notice_query().where(TeamNotice.id == notice_id)).one())


def list_notices(db: Session, team_code: str | None) -> list[NoticeOut]:
    statement = _notice_query().order_by(TeamNotice.created_at.desc(), TeamNotice.id.desc())
    if team_code:
        statement = statement.where(Team.team_code == team_code.strip())
    return [_notice_row_out(row) for row in db.execute(statement).all()]


def create_notice(db: Session, admin_id: uuid.UUID, payload: NoticeCreate) -> NoticeOut:
    team = _team_by_code(db, payload.team_code)
    message = _text(payload.message, label="Message", limit=MAX_MESSAGE_LENGTH)
    notice = TeamNotice(team_id=team.id, round_id=None, message=message, created_by_admin_id=admin_id)
    db.add(notice)
    db.flush()
    _audit(db, admin_id, "SEND_TEAM_NOTICE", {"team_code": team.team_code, "notice_id": str(notice.id)})
    db.commit()
    return _notice_out(db, notice.id)

