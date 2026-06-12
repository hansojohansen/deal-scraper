"""security hardening: CHECK constraints, indexes, user_sessions table

Revision ID: 017
Revises: 016
Create Date: 2026-06-12
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # CHECK constraint: users.plan must be a known tier
    op.execute(
        "ALTER TABLE users ADD CONSTRAINT ck_users_plan "
        "CHECK (plan IN ('free', 'pro', 'dealer'))"
    )

    # CHECK constraint: crm_leads.stage must be a known stage
    op.execute(
        "ALTER TABLE crm_leads ADD CONSTRAINT ck_crm_leads_stage "
        "CHECK (stage IN ('lead', 'contact', 'negotiation', 'done', 'lost'))"
    )

    # Index: crm_leads.created_at (used in ORDER BY created_at DESC)
    op.create_index("ix_crm_leads_created_at", "crm_leads", ["created_at"])

    # Composite index: crm_leads(user_id, created_at DESC) for list query
    op.execute(
        "CREATE INDEX ix_crm_leads_user_created ON crm_leads (user_id, created_at DESC)"
    )

    # Partial index: cars.reg_number (sparse column, only index non-null rows)
    op.execute(
        "CREATE INDEX ix_cars_reg_number ON cars (reg_number) "
        "WHERE reg_number IS NOT NULL"
    )

    # user_sessions table for cookie-session revocation on logout
    op.create_table(
        "user_sessions",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.Text(), nullable=False, unique=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])
    op.create_index("ix_user_sessions_token_hash", "user_sessions", ["token_hash"])
    op.create_index("ix_user_sessions_expires_at", "user_sessions", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_user_sessions_expires_at", table_name="user_sessions")
    op.drop_index("ix_user_sessions_token_hash", table_name="user_sessions")
    op.drop_index("ix_user_sessions_user_id", table_name="user_sessions")
    op.drop_table("user_sessions")

    op.execute("DROP INDEX IF EXISTS ix_cars_reg_number")
    op.execute("DROP INDEX IF EXISTS ix_crm_leads_user_created")
    op.drop_index("ix_crm_leads_created_at", table_name="crm_leads")

    op.execute("ALTER TABLE crm_leads DROP CONSTRAINT IF EXISTS ck_crm_leads_stage")
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_plan")
