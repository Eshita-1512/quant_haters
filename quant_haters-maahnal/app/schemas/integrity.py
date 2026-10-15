from datetime import datetime

from pydantic import BaseModel


class Thresholds(BaseModel):
    flag: float
    review: float
    rule_min: float


class RuleResult(BaseModel):
    rule_acc: float | None = None
    agreement: float | None = None


class SubmissionCheck(BaseModel):
    submission_id: str
    team_id: str
    team_code: str
    team_name: str
    stock: str
    submission_no: int
    submitted_at: str
    public_score: float
    private_score: float | None
    status: str
    worst_rule: str | None
    worst_agreement: float | None
    note: str
    rules: dict[str, RuleResult]


class CurrentAdjustment(BaseModel):
    id: str
    points: float
    created_at: datetime


class TeamCheck(BaseModel):
    team_id: str
    team_code: str
    team_name: str
    status: str
    submission_count: int
    submission_no: int
    worst_submission_id: str
    worst_rule: str | None
    worst_agreement: float | None
    public_score: float
    private_score: float | None
    suggested_points: int
    suggested_message_key: str | None
    current_adjustment: CurrentAdjustment | None = None
    last_notice_at: datetime | None = None


class CheckResponse(BaseModel):
    round: str
    check_run_id: str | None = None
    checked_at: datetime | None = None
    thresholds: Thresholds | None = None
    submissions: list[SubmissionCheck] = []
    teams: list[TeamCheck] = []


class RunRequest(BaseModel):
    round: str
    flag: float = 0.70
    review: float = 0.60
    rule_min: float = 0.70


class ApplyItem(BaseModel):
    team_code: str
    points: float
    message: str


class ApplyRequest(BaseModel):
    round: str
    items: list[ApplyItem]


class AdjustmentOut(BaseModel):
    id: str
    team_code: str
    team_name: str
    round: str
    kind: str
    points: float
    reason: str
    created_by: str
    created_at: datetime
    revoked_at: datetime | None = None
    revoked_by: str | None = None


class AdjustmentCreate(BaseModel):
    team_code: str
    round: str
    points: float
    reason: str


class NoticeOut(BaseModel):
    id: str
    team_code: str
    team_name: str
    round: str | None = None
    message: str
    created_by: str
    created_at: datetime
    acknowledged_at: datetime | None = None


class NoticeCreate(BaseModel):
    team_code: str
    message: str


class ApplyResponse(BaseModel):
    adjustments: list[AdjustmentOut]
    notices: list[NoticeOut]
