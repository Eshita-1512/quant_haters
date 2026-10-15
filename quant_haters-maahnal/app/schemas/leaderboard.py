from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel


class LeaderboardEntry(BaseModel):
    rank: int
    team: str
    score: Decimal
    submissions: int


class CumulativeLeaderboardEntry(BaseModel):
    rank: int
    team: str
    cumulative_score: float
    r1_score: Decimal | None = None
    r2_score: Decimal | None = None
    r3_score: Decimal | None = None
    submissions: int


class FinalResultsEntry(BaseModel):
    rank: int
    team: str
    score: float
    r1_score: float | None = None
    r2_score: float | None = None
    r3_score: float | None = None
    submissions: int = 0


class PublicFinalResults(BaseModel):
    status: Literal["success", "pending"] = "pending"
    rankings: list[FinalResultsEntry] = []


class AdminLeaderboardEntry(LeaderboardEntry):
    team_code: str
    last_submission_at: datetime | None
    private_score: Decimal | None = None
    penalty: Decimal = Decimal(0)
    adjusted_score: Decimal
    private_adjusted_score: Decimal | None = None


class SnapshotResult(BaseModel):
    status: str = "success"
    snapshot_id: str
    entries: int
