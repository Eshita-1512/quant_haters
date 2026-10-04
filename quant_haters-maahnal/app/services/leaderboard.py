import uuid
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    AdminAuditLog,
    EventState,
    LeaderboardSnapshot,
    LeaderboardSnapshotEntry,
    Round,
    Score,
    Submission,
    Team,
)
from app.schemas.leaderboard import AdminLeaderboardEntry, LeaderboardEntry, SnapshotResult


def _best_scores(round_id: int):
    return (
        select(Score.team_id, Score.score.label("best_score"), Score.details.label("details"))
        .distinct(Score.team_id)
        .where(Score.round_id == round_id, Score.is_valid.is_(True))
        .order_by(Score.team_id, Score.score.desc())
        .subquery()
    )


def _live_rows(db: Session) -> tuple[int | None, list[tuple[uuid.UUID, str, Decimal, int]]]:
    round_id = db.scalar(select(EventState.current_round_id).where(EventState.id == 1))
    if round_id is None:
        return None, []

    best_scores = _best_scores(round_id)
    submission_counts = (
        select(Submission.team_id, func.count(Submission.id).label("submission_count"))
        .where(Submission.round_id == round_id)
        .group_by(Submission.team_id)
        .subquery()
    )
    statement = (
        select(
            Team.id,
            Team.team_name,
            best_scores.c.best_score,
            func.coalesce(submission_counts.c.submission_count, 0),
        )
        .join(best_scores, best_scores.c.team_id == Team.id)
        .outerjoin(submission_counts, submission_counts.c.team_id == Team.id)
        .where(Team.is_active.is_(True))
        .order_by(best_scores.c.best_score.desc(), Team.team_name.asc())
    )
    return round_id, list(db.execute(statement).all())


def admin_leaderboard(db: Session, round_code: str | None = None) -> list[AdminLeaderboardEntry]:
    """Live best scores for one round; defaults to the current round."""
    if round_code is None:
        round_id = db.scalar(select(EventState.current_round_id).where(EventState.id == 1))
    else:
        round_id = db.scalar(select(Round.id).where(Round.round_code == round_code))
    if round_id is None:
        return []

    best_scores = _best_scores(round_id)
    submission_stats = (
        select(
            Submission.team_id,
            func.count(Submission.id).label("submission_count"),
            func.max(Submission.created_at).label("last_submission_at"),
        )
        .where(Submission.round_id == round_id)
        .group_by(Submission.team_id)
        .subquery()
    )
    statement = (
        select(
            Team.team_name,
            Team.team_code,
            best_scores.c.best_score,
            best_scores.c.details,
            func.coalesce(submission_stats.c.submission_count, 0),
            submission_stats.c.last_submission_at,
        )
        .join(best_scores, best_scores.c.team_id == Team.id)
        .outerjoin(submission_stats, submission_stats.c.team_id == Team.id)
        .where(Team.is_active.is_(True))
        .order_by(best_scores.c.best_score.desc(), Team.team_name.asc())
    )
    return [
        AdminLeaderboardEntry(
            rank=rank,
            team=team_name,
            team_code=team_code,
            score=score,
            submissions=submissions,
            last_submission_at=last_submission_at,
            private_score=Decimal(str(details.get("private_score"))) if details and "private_score" in details else None,
        )
        for rank, (team_name, team_code, score, details, submissions, last_submission_at) in enumerate(
            db.execute(statement).all(), start=1
        )
    ]


def public_leaderboard(db: Session) -> list[LeaderboardEntry]:
    snapshot_id = db.scalar(
        select(LeaderboardSnapshot.id)
        .order_by(LeaderboardSnapshot.created_at.desc(), LeaderboardSnapshot.id.desc())
        .limit(1)
    )
    if snapshot_id is None:
        return []
    rows = db.execute(
        select(LeaderboardSnapshotEntry)
        .where(LeaderboardSnapshotEntry.snapshot_id == snapshot_id)
        .order_by(LeaderboardSnapshotEntry.rank)
    ).scalars()
    return [
        LeaderboardEntry(
            rank=row.rank,
            team=row.team_name,
            score=row.score,
            submissions=row.submissions,
        )
        for row in rows
    ]


def publish_snapshot(db: Session, admin_id: uuid.UUID) -> SnapshotResult:
    round_id, rows = _live_rows(db)
    if round_id is None:
        raise HTTPException(status_code=409, detail="No active round is configured.")
    snapshot = LeaderboardSnapshot(
        round_id=round_id, published_by_admin_id=admin_id
    )
    db.add(snapshot)
    db.flush()
    db.add_all(
        [
            LeaderboardSnapshotEntry(
                snapshot_id=snapshot.id,
                rank=rank,
                team_id=team_id,
                team_name=team_name,
                score=score,
                submissions=submissions,
            )
            for rank, (team_id, team_name, score, submissions) in enumerate(rows, start=1)
        ]
    )
    db.add(
        AdminAuditLog(
            admin_id=admin_id,
            action="PUBLISH_LEADERBOARD_SNAPSHOT",
            details={"snapshot_id": str(snapshot.id), "round_id": round_id, "entries": len(rows)},
        )
    )
    db.commit()
    return SnapshotResult(snapshot_id=str(snapshot.id), entries=len(rows))
