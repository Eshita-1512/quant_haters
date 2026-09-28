import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.csv_validation import SubmissionValidationError
from app.database import get_db
from app.dependencies import get_current_team_id
from app.schemas.submission import SubmissionResult
from app.services.submissions import process_submission


router = APIRouter(prefix="/submit", tags=["submissions"])


@router.post("/round/{round_num}", response_model=SubmissionResult)
async def submit_round(round_num: int, file: UploadFile = File(...), team_id: uuid.UUID = Depends(get_current_team_id), db: Session = Depends(get_db)) -> SubmissionResult | JSONResponse:
    try:
        return await process_submission(file=file, round_number=round_num, team_id=team_id, db=db)
    except SubmissionValidationError as exc:
        db.rollback()
        return JSONResponse(
            status_code=400,
            content={"status": "error", "code": 400, "message": str(exc)},
        )
