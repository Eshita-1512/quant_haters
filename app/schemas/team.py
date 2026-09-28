from pydantic import BaseModel


class StockInfo(BaseModel):
    code: str
    name: str


class TeamProfile(BaseModel):
    team_id: str
    team_name: str
    assigned_stock: StockInfo
    train_start: int
    train_end: int
    predict_start: int
    predict_end: int

