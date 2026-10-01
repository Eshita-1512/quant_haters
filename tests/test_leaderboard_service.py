import uuid
from decimal import Decimal

from app.models import LeaderboardSnapshot, LeaderboardSnapshotEntry
from app.services import leaderboard as service


class FakeSnapshotDatabase:
    def __init__(self) -> None:
        self.added = []
        self.added_many = []
        self.commits = 0

    def add(self, value) -> None:
        self.added.append(value)

    def flush(self) -> None:
        snapshot = next(value for value in self.added if isinstance(value, LeaderboardSnapshot))
        snapshot.id = uuid.uuid4()

    def add_all(self, values) -> None:
        self.added_many.extend(values)

    def commit(self) -> None:
        self.commits += 1


def test_snapshot_publication_freezes_all_entries_before_one_commit(monkeypatch) -> None:
    admin_id = uuid.uuid4()
    rows = [
        (uuid.uuid4(), "Team A", Decimal("0.8"), 3),
        (uuid.uuid4(), "Team B", Decimal("0.7"), 2),
    ]
    monkeypatch.setattr(service, "_live_rows", lambda _db: (1, rows))
    db = FakeSnapshotDatabase()

    result = service.publish_snapshot(db, admin_id)  # type: ignore[arg-type]

    entries = [value for value in db.added_many if isinstance(value, LeaderboardSnapshotEntry)]
    assert [entry.rank for entry in entries] == [1, 2]
    assert [entry.submissions for entry in entries] == [3, 2]
    assert db.commits == 1
    assert result.entries == 2
