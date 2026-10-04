import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.csv_validation import SubmissionValidationError
from app.database import get_db
from app.dependencies import get_current_team_id
from app.schemas.submission import SubmissionResult
from app.services.submissions import (
    SubmissionRateLimitError,
    ValidationDataError,
    process_submission,
)


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
    except SubmissionRateLimitError as exc:
        return JSONResponse(
            status_code=429,
            headers={"Retry-After": str(exc.retry_after_seconds)},
            content={
                "status": "error",
                "code": 429,
                "message": str(exc),
                "retry_after_seconds": exc.retry_after_seconds,
            },
        )
    except ValidationDataError as exc:
        db.rollback()
        return JSONResponse(
            status_code=503,
            content={
                "status": "error",
                "code": 503,
                "message": str(exc),
            },
        )
    except Exception as exc:
        db.rollback()
        import traceback
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": str(exc), "traceback": traceback.format_exc()},
        )
