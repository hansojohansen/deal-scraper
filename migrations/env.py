import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from backend.db.models import Base  # noqa: E402

config = context.config
fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    from dotenv import load_dotenv
    load_dotenv()
    url = os.environ.get("DATABASE_URL", "")
    # Alembic sync driver for migrations (swap asyncpg → psycopg2)
    return url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")


def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    url = get_url()
    from sqlalchemy import create_engine
    sync_engine = create_engine(url.replace("postgresql+asyncpg://", "postgresql+psycopg2://"))
    with sync_engine.connect() as connection:
        do_run_migrations(connection)


def run_migrations_online() -> None:
    from sqlalchemy import create_engine
    url = get_url()
    connectable = create_engine(url, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        do_run_migrations(connection)


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
