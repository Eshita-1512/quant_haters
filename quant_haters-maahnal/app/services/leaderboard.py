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
from app.schemas.leaderboard import (
    AdminLeaderboardEntry,
    CumulativeLeaderboardEntry,
    FinalResultsEntry,
    LeaderboardEntry,
    PublicFinalResults,
    SnapshotResult,
)

# Cumulative score weights (must sum to 1.0)
W_R1 = 0.20
W_R2 = 0.35
W_R3 = 0.45


def _best_scores(round_id: int):
    return (
        select(Score.team_id, Score.score.label("best_score"), Score.details.label("details"))
        .select_from(Score)
        .join(Submission, Score.submission_id == Submission.id)
        .distinct(Score.team_id)
        .where(Score.round_id == round_id, Score.is_valid.is_(True))
        .order_by(Score.team_id, Submission.created_at.desc())
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


def cumulative_leaderboard(db: Session) -> list[CumulativeLeaderboardEntry]:
    """Compute weighted cumulative score across R1, R2, R3 for every active team."""
    final_res = public_final_results(db)
    if final_res.status == "success" and final_res.rankings:
        return [
            CumulativeLeaderboardEntry(
                rank=r.rank,
                team=r.team,
                cumulative_score=r.score,
                r1_score=Decimal(str(r.r1_score)) if r.r1_score is not None else None,
                r2_score=Decimal(str(r.r2_score)) if r.r2_score is not None else None,
                r3_score=Decimal(str(r.r3_score)) if r.r3_score is not None else None,
                submissions=r.submissions,
            )
            for r in final_res.rankings
        ]

    rounds = {
        row.round_code: row.id
        for row in db.scalars(select(Round)).all()
    }

    # Collect best score per team per round
    scores_by_team: dict[uuid.UUID, dict[str, Decimal]] = {}
    subs_by_team: dict[uuid.UUID, int] = {}
    names_by_team: dict[uuid.UUID, str] = {}

    for round_code, round_id in rounds.items():
        best = _best_scores(round_id)
        rows = db.execute(
            select(Team.id, Team.team_name, best.c.best_score)
            .join(best, best.c.team_id == Team.id)
            .where(Team.is_active.is_(True))
        ).all()
        for team_id, team_name, score in rows:
            names_by_team[team_id] = team_name
            scores_by_team.setdefault(team_id, {})[round_code] = score

    # Count total submissions across all rounds
    all_subs = db.execute(
        select(Submission.team_id, func.count(Submission.id))
        .where(Team.is_active.is_(True))
        .join(Team, Team.id == Submission.team_id)
        .group_by(Submission.team_id)
    ).all()
    for team_id, count in all_subs:
        subs_by_team[team_id] = count

    # Compute cumulative scores: R1: 20%, R2: 35%, R3: 45%
    entries: list[tuple[str, float, Decimal | None, Decimal | None, Decimal | None, int]] = []
    for team_id, name in names_by_team.items():
        team_scores = scores_by_team[team_id]
        r1 = team_scores.get("R1")
        r2 = team_scores.get("R2")
        r3 = team_scores.get("R3")
        cum = (
            float(r1 or 0) * W_R1
            + float(r2 or 0) * W_R2
            + float(r3 or 0) * W_R3
        )
        subs = subs_by_team.get(team_id, 0)
        entries.append((name, cum, r1, r2, r3, subs))

    entries.sort(key=lambda x: (-x[1], x[0]))
    result: list[CumulativeLeaderboardEntry] = []
    rank = 0
    prev_score: float | None = None
    for pos, (name, cum, r1, r2, r3, subs) in enumerate(entries, start=1):
        if prev_score is None or cum != prev_score:
            rank = pos
        prev_score = cum
        result.append(
            CumulativeLeaderboardEntry(
                rank=rank,
                team=name,
                cumulative_score=round(cum, 2),
                r1_score=r1,
                r2_score=r2,
                r3_score=r3,
                submissions=subs,
            )
        )
    return result


def public_final_results(db: Session) -> PublicFinalResults:
    """Return the most recently stored public final backtest results."""
    # Check AdminAuditLog for rich breakdown first
    latest_audit = db.execute(
        select(AdminAuditLog)
        .where(AdminAuditLog.action == "RUN_FINAL_BACKTEST")
        .order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc())
        .limit(1)
    ).scalar_one_or_none()

    if latest_audit and latest_audit.details and "rankings" in latest_audit.details:
        rankings = [
            FinalResultsEntry(
                rank=r["rank"],
                team=r["team"],
                score=float(r.get("score") if r.get("score") is not None else r.get("cumulative_score", 0.0)),
                r1_score=float(r["r1_score"]) if r.get("r1_score") is not None else None,
                r2_score=float(r["r2_score"]) if r.get("r2_score") is not None else None,
                r3_score=float(r["r3_score"]) if r.get("r3_score") is not None else None,
                submissions=int(r.get("submissions", 0)),
            )
            for r in latest_audit.details["rankings"]
        ]
        return PublicFinalResults(status="success", rankings=rankings)

    # Fallback to LeaderboardSnapshot with is_final=True
    snapshot_id = db.scalar(
        select(LeaderboardSnapshot.id)
        .where(LeaderboardSnapshot.is_final.is_(True))
        .order_by(LeaderboardSnapshot.created_at.desc())
        .limit(1)
    )
    if snapshot_id is None:
        return PublicFinalResults(status="pending", rankings=[])

    rows = list(db.execute(
        select(LeaderboardSnapshotEntry)
        .where(LeaderboardSnapshotEntry.snapshot_id == snapshot_id)
        .order_by(LeaderboardSnapshotEntry.rank)
    ).scalars())
    return PublicFinalResults(
        status="success",
        rankings=[
            FinalResultsEntry(
                rank=row.rank,
                team=row.team_name,
                score=float(row.score),
                submissions=row.submissions,
            )
            for row in rows
        ],
    )


def public_leaderboard(db: Session) -> list[LeaderboardEntry]:
    snapshot_id = db.scalar(
        select(LeaderboardSnapshot.id)
        .where(LeaderboardSnapshot.is_final.is_(False))
        .order_by(LeaderboardSnapshot.created_at.desc(), LeaderboardSnapshot.id.desc())
        .limit(1)
    )
    if snapshot_id is None:
        # Fallback: no is_final column distinction yet, use latest non-final
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
        round_id=round_id, published_by_admin_id=admin_id, is_final=False
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


def publish_final_results(db: Session, admin_id: uuid.UUID, rankings: list[dict]) -> None:
    """Store final backtest and cumulative rankings as a special 'is_final=True' snapshot."""
    r3_id = db.scalar(select(Round.id).where(Round.round_code == "R3"))
    if r3_id is None:
        r3_id = db.scalar(select(Round.id).order_by(Round.id.desc()))

    snapshot = LeaderboardSnapshot(
        round_id=r3_id, published_by_admin_id=admin_id, is_final=True
    )
    db.add(snapshot)
    db.flush()
    db.add_all(
        [
            LeaderboardSnapshotEntry(
                snapshot_id=snapshot.id,
                rank=position,
                team_id=entry["team_id"],
                team_name=entry["team"],
                score=Decimal(str(entry.get("cumulative_score", entry.get("score", 0.0)))),
                submissions=entry.get("submissions", 0),
            )
            for position, entry in enumerate(rankings, start=1)
        ]
    )
    db.commit()
