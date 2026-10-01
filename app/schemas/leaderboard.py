from decimal import Decimal

from pydantic import BaseModel


class LeaderboardEntry(BaseModel):
    rank: int
    team: str
    score: Decimal
    submissions: int


class SnapshotResult(BaseModel):
    status: str = "success"
    snapshot_id: str
    entries: int
