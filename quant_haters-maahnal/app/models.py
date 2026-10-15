import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, Enum, ForeignKey, ForeignKeyConstraint, Index, Integer, Numeric, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RoundPhase(str, enum.Enum):
    SCHEDULED = "scheduled"
    LIVE = "live"
    FLASH_CRASH = "flash_crash"
    PAUSED = "paused"
    COMPLETED = "completed"


class SubmissionStatus(str, enum.Enum):
    UPLOADED = "uploaded"
    VALIDATING = "validating"
    INVALID = "invalid"
    SCORING = "scoring"
    SCORED = "scored"
    FAILED = "failed"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Team(TimestampMixin, Base):
    __tablename__ = "teams"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    team_code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    team_name: Mapped[str] = mapped_column(String(150))
    password_hash: Mapped[str] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class AuthSession(TimestampMixin, Base):
    __tablename__ = "auth_sessions"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Stock(TimestampMixin, Base):
    __tablename__ = "stocks"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    stock_code: Mapped[str] = mapped_column(String(50), unique=True)
    display_name: Mapped[str] = mapped_column(String(150))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Round(TimestampMixin, Base):
    __tablename__ = "rounds"
    id: Mapped[int] = mapped_column(primary_key=True)
    round_code: Mapped[str] = mapped_column(String(20), unique=True)
    round_name: Mapped[str] = mapped_column(String(100))
    submission_type: Mapped[str] = mapped_column(String(20))
    phase: Mapped[RoundPhase] = mapped_column(Enum(RoundPhase), default=RoundPhase.SCHEDULED)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    paused_remaining_seconds: Mapped[int | None] = mapped_column(Integer)
    max_submissions_per_team: Mapped[int] = mapped_column(Integer, default=10)


class TeamAssignment(TimestampMixin, Base):
    __tablename__ = "team_assignments"
    __table_args__ = (UniqueConstraint("team_id", "round_id"), UniqueConstraint("id", "round_id", name="uq_team_assignments_id_round_id"), CheckConstraint("train_end >= train_start"), CheckConstraint("predict_end >= predict_start"))
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id"))
    round_id: Mapped[int] = mapped_column(ForeignKey("rounds.id"))
    stock_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stocks.id"))
    train_start: Mapped[int] = mapped_column(Integer)
    train_end: Mapped[int] = mapped_column(Integer)
    predict_start: Mapped[int] = mapped_column(Integer)
    predict_end: Mapped[int] = mapped_column(Integer)


class DatasetRelease(TimestampMixin, Base):
    __tablename__ = "dataset_releases"
    __table_args__ = (
        ForeignKeyConstraint(
            ["assignment_id", "round_id"],
            ["team_assignments.id", "team_assignments.round_id"],
            name="fk_dataset_releases_assignment_round",
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    round_id: Mapped[int] = mapped_column(ForeignKey("rounds.id"))
    release_type: Mapped[str] = mapped_column(String(20))
    version: Mapped[int] = mapped_column(Integer, default=1)
    display_filename: Mapped[str] = mapped_column(String(255))
    storage_key: Mapped[str] = mapped_column(Text)
    sha256: Mapped[str] = mapped_column(String(64))
    file_size_bytes: Mapped[int] = mapped_column(Integer)
    row_count: Mapped[int | None] = mapped_column(Integer)
    available_from: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    available_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class DownloadEvent(TimestampMixin, Base):
    __tablename__ = "download_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id"))
    dataset_release_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("dataset_releases.id"))


class Submission(TimestampMixin, Base):
    __tablename__ = "submissions"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id"))
    round_id: Mapped[int] = mapped_column(ForeignKey("rounds.id"))
    stock_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stocks.id"))
    assignment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("team_assignments.id"))
    original_filename: Mapped[str] = mapped_column(String(255))
    file_hash: Mapped[str] = mapped_column(String(64))
    file_size_bytes: Mapped[int] = mapped_column(Integer)
    row_count: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[SubmissionStatus] = mapped_column(Enum(SubmissionStatus), default=SubmissionStatus.UPLOADED)
    validation_error: Mapped[str | None] = mapped_column(Text)


class PredictionRow(Base):
    __tablename__ = "prediction_rows"
    __table_args__ = (CheckConstraint("timestamp_index BETWEEN 1 AND 50"), CheckConstraint("prediction IN (0, 1)"), CheckConstraint("confidence BETWEEN 0 AND 1"))
    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id", ondelete="CASCADE"), primary_key=True)
    timestamp_index: Mapped[int] = mapped_column(Integer, primary_key=True)
    prediction: Mapped[int] = mapped_column(Integer)
    confidence: Mapped[Decimal] = mapped_column(Numeric(4, 3), default=Decimal("0.5"), server_default="0.5")


class SignalRow(Base):
    __tablename__ = "signal_rows"
    __table_args__ = (CheckConstraint("timestamp_index BETWEEN 1 AND 50"), CheckConstraint("signal BETWEEN -1 AND 1"))
    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id", ondelete="CASCADE"), primary_key=True)
    timestamp_index: Mapped[int] = mapped_column(Integer, primary_key=True)
    signal: Mapped[Decimal] = mapped_column(Numeric(5, 4))


class Score(TimestampMixin, Base):
    __tablename__ = "scores"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id"), unique=True)
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id"))
    round_id: Mapped[int] = mapped_column(ForeignKey("rounds.id"))
    stock_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stocks.id"))
    score: Mapped[Decimal] = mapped_column(Numeric(12, 6))
    is_valid: Mapped[bool] = mapped_column(Boolean, default=True)
    balanced_accuracy: Mapped[Decimal | None] = mapped_column(Numeric(8, 6))
    mcc: Mapped[Decimal | None] = mapped_column(Numeric(8, 6))
    scoring_version: Mapped[str] = mapped_column(String(100), default="v1")
    details: Mapped[dict | None] = mapped_column(JSONB)


class AdminUser(TimestampMixin, Base):
    __tablename__ = "admin_users"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(100), unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class AdminAuthSession(TimestampMixin, Base):
    __tablename__ = "admin_auth_sessions"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    admin_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("admin_users.id", ondelete="CASCADE")
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class EventState(Base):
    __tablename__ = "event_state"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    current_round_id: Mapped[int | None] = mapped_column(ForeignKey("rounds.id"))
    flash_crash_active: Mapped[bool] = mapped_column(Boolean, default=False)
    flash_crash_message: Mapped[str | None] = mapped_column(Text)
    flash_crash_triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    state_version: Mapped[int] = mapped_column(Integer, default=1)


class AdminAuditLog(TimestampMixin, Base):
    __tablename__ = "admin_audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    admin_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("admin_users.id"))
    action: Mapped[str] = mapped_column(String(100))
    details: Mapped[dict | None] = mapped_column(JSONB)


class LeaderboardSnapshot(TimestampMixin, Base):
    __tablename__ = "leaderboard_snapshots"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    round_id: Mapped[int] = mapped_column(ForeignKey("rounds.id"))
    published_by_admin_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("admin_users.id"))
    is_final: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")


class LeaderboardSnapshotEntry(Base):
    __tablename__ = "leaderboard_snapshot_entries"
    __table_args__ = (CheckConstraint("rank > 0"), CheckConstraint("submissions >= 0"))
    snapshot_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("leaderboard_snapshots.id", ondelete="CASCADE"), primary_key=True
    )
    rank: Mapped[int] = mapped_column(Integer, primary_key=True)
    team_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("teams.id"), nullable=True)
    team_name: Mapped[str] = mapped_column(String(150))
    score: Mapped[Decimal] = mapped_column(Numeric(12, 6))
    submissions: Mapped[int] = mapped_column(Integer)


class SubmissionRateLimit(Base):
    __tablename__ = "submission_rate_limits"
    team_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True
    )
    last_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class LookaheadResult(TimestampMixin, Base):
    """One row per submission per integrity check run. Read-only evidence, never a penalty."""

    __tablename__ = "lookahead_results"
    __table_args__ = (Index("ix_lookahead_results_round_created", "round_id", "created_at"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    check_run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id", ondelete="CASCADE"))
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id"))
    round_id: Mapped[int] = mapped_column(ForeignKey("rounds.id"))
    status: Mapped[str] = mapped_column(String(20))
    worst_rule: Mapped[str | None] = mapped_column(String(30))
    worst_agreement: Mapped[Decimal | None] = mapped_column(Numeric(5, 3))
    details: Mapped[dict | None] = mapped_column(JSONB)
    checked_by_admin_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("admin_users.id"))


class ScoreAdjustment(TimestampMixin, Base):
    """A point deduction. Penalties are applied at read time; the scores table is never changed."""

    __tablename__ = "score_adjustments"
    __table_args__ = (
        CheckConstraint("points > 0", name="ck_score_adjustments_points_positive"),
        CheckConstraint("kind IN ('lookahead', 'manual')", name="ck_score_adjustments_kind"),
        CheckConstraint("char_length(reason) <= 500", name="ck_score_adjustments_reason_length"),
        Index(
            "uq_score_adjustments_active_lookahead",
            "team_id",
            "round_id",
            unique=True,
            postgresql_where=text("kind = 'lookahead' AND revoked_at IS NULL"),
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id"))
    round_id: Mapped[int] = mapped_column(ForeignKey("rounds.id"))
    points: Mapped[Decimal] = mapped_column(Numeric(8, 2))
    kind: Mapped[str] = mapped_column(String(20))
    reason: Mapped[str] = mapped_column(Text)
    check_run_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_by_admin_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("admin_users.id"))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_by_admin_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("admin_users.id"))


class TeamNotice(TimestampMixin, Base):
    """A message shown to one team. The team sees the text only, never the reason or the points."""

    __tablename__ = "team_notices"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id"), index=True)
    round_id: Mapped[int | None] = mapped_column(ForeignKey("rounds.id"))
    message: Mapped[str] = mapped_column(Text)
    created_by_admin_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("admin_users.id"))
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
