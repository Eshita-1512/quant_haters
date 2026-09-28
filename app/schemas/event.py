from datetime import datetime

from pydantic import BaseModel


class StatusStock(BaseModel):
    code: str
    name: str


class EventStatus(BaseModel):
    state_version: int
    server_time: datetime
    current_round: str
    round_name: str
    round_phase: str
    round_ends_at: datetime
    time_remaining_seconds: int
    flash_crash_active: bool
    flash_crash_message: str | None
    assigned_stock: StatusStock
    download_available: bool

