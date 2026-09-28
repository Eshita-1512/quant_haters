from typing import Literal

from pydantic import BaseModel


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

