from typing import Literal

from pydantic import BaseModel, Field, field_validator


class FlashCrashRequest(BaseModel):
    message: str | None = Field(default=None, max_length=500)

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


class AdminStatus(BaseModel):
    current_round: str | None
    flash_crash_active: bool
    state_version: int
    submissions_count: int
    time_remaining_seconds: int


class FinalBacktestEntry(BaseModel):
    rank: int
    team: str
    score: float


class FinalBacktestResult(BaseModel):
    status: Literal["success"] = "success"
    round: Literal["R3"] = "R3"
    rankings: list[FinalBacktestEntry]
