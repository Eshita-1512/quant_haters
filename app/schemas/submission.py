from typing import Literal

from pydantic import BaseModel


class SubmissionResult(BaseModel):
    status: Literal["success"] = "success"
    team_id: str
    round: int
    submission_number: int
    submissions_remaining: int


class SubmissionError(BaseModel):
    status: Literal["error"] = "error"
    code: int = 400
    message: str
