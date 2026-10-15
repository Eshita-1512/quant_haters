from datetime import datetime

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    team_id: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=256)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    expires_in_seconds: int


class AdminLoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=256)
