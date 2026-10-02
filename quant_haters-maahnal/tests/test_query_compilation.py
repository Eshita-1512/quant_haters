import uuid

from sqlalchemy.dialects import postgresql

from app.dependencies import team_profile_statement
from app.services.submissions import submission_context_statement


def _compile(statement) -> str:
    return str(statement.compile(dialect=postgresql.dialect()))


def test_submission_context_query_compiles_for_postgresql() -> None:
    sql = _compile(submission_context_statement(uuid.uuid4(), 1))
    assert "FROM teams JOIN event_state" in sql
    assert "FOR UPDATE" in sql


def test_team_profile_query_compiles_for_postgresql() -> None:
    sql = _compile(team_profile_statement(uuid.uuid4()))
    assert "FROM teams JOIN event_state" in sql
