from decimal import Decimal

from pydantic import BaseModel


class LeaderboardEntry(BaseModel):
    team: str
    score: Decimal

