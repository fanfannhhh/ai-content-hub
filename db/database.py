"""SQLAlchemy 引擎与会话。"""

from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_DB_PATH = _DATA_DIR / "documents.db"
DATABASE_URL = f"sqlite:///{_DB_PATH.as_posix()}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def _migrate_documents_created_at() -> None:
    """为已有 SQLite 表补充 created_at，并用 updated_at 回填。"""
    with engine.begin() as conn:
        rows = conn.execute(text("PRAGMA table_info(documents)")).fetchall()
        if not rows:
            return
        col_names = {row[1] for row in rows}
        if "created_at" not in col_names:
            conn.execute(
                text("ALTER TABLE documents ADD COLUMN created_at DATETIME")
            )
            conn.execute(
                text(
                    "UPDATE documents SET created_at = updated_at "
                    "WHERE created_at IS NULL"
                )
            )


def init_db() -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    from db import models  # noqa: F401 — register models

    Base.metadata.create_all(bind=engine)
    _migrate_documents_created_at()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
