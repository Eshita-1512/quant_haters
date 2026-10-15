from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


MAX_ROUND_SECONDS = 24 * 60 * 60


class FlashCrashRequest(BaseModel):
    active: bool = True
    message: str | None = Field(default=None, max_length=500)
    duration_seconds: int | None = Field(default=None, gt=0, le=MAX_ROUND_SECONDS)

    @field_validator("message")
    @classmethod
    def validate_message(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Flash Crash message cannot be empty.")
        return cleaned


class FlashCrashResult(BaseModel):
    status: Literal["success"] = "success"
    current_round: str
    flash_crash_active: bool
    state_version: int


class AdminRoundInfo(BaseModel):
    code: str
    name: str
    submission_type: str
    phase: str
    duration_seconds: int
    ends_at: datetime | None


class AdminStatus(BaseModel):
    current_round: str | None
    flash_crash_active: bool
    state_version: int
    submissions_count: int
    time_remaining_seconds: int
    server_time: datetime
    round_name: str | None
    round_phase: str | None
    round_ends_at: datetime | None
    flash_crash_message: str | None
    flash_crash_triggered_at: datetime | None
    rounds: list[AdminRoundInfo]
    teams_total: int


class TimerRequest(BaseModel):
    action: Literal["pause", "resume", "extend", "set", "end"]
    seconds: int | None = Field(default=None, ge=-MAX_ROUND_SECONDS, le=MAX_ROUND_SECONDS)


class StartRoundRequest(BaseModel):
    round: Literal["R1", "R2", "R3"]
    duration_seconds: int = Field(gt=0, le=MAX_ROUND_SECONDS)


class FinalBacktestEntry(BaseModel):
    rank: int
    team: str
    score: float
    cumulative_score: float | None = None
    r1_score: float | None = None
    r2_score: float | None = None
    r3_score: float | None = None
    submissions: int = 0


class FinalBacktestResult(BaseModel):
    status: Literal["success"] = "success"
    round: Literal["R3"] = "R3"
    rankings: list[FinalBacktestEntry]
