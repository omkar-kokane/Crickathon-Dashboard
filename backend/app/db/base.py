from sqlmodel import SQLModel, create_engine, Session
from app.core.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
)


def get_session():
    """FastAPI dependency for a database session."""
    with Session(engine) as session:
        yield session


def create_db_and_tables():
    """Used only in local dev/testing. Production uses Alembic migrations."""
    SQLModel.metadata.create_all(engine)
