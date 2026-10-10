from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class LeaderboardEntry(BaseModel):
    rank: int
    team: str
    score: Decimal
    submissions: int


class AdminLeaderboardEntry(LeaderboardEntry):
    team_code: str
    last_submission_at: datetime | None
    private_score: Decimal | None = None


class SnapshotResult(BaseModel):
    status: str = "success"
    snapshot_id: str
    entries: int
