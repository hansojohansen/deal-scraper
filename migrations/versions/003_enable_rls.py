"""Enable RLS on all public tables with permissive policies

Revision ID: 003
Revises: 002
Create Date: 2026-05-27

Enables Row Level Security on all tables and adds an open policy so
our direct-connection backend is unaffected. When user auth is added
(Phase 8), replace the open policies with row-scoped ones.
"""

from alembic import op
from sqlalchemy import text

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None

TABLES = ["cars", "price_history", "outlier_scores", "deal_alerts", "alert_matches"]


def upgrade() -> None:
    conn = op.get_bind()
    for table in TABLES:
        # Enable RLS
        conn.execute(text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
        # Open policy: allow all operations for all roles (direct-connection backend bypasses
        # RLS anyway; this just clears the Supabase warning and is ready to be scoped later)
        conn.execute(text(
            f"CREATE POLICY allow_all ON {table} FOR ALL USING (true) WITH CHECK (true)"
        ))


def downgrade() -> None:
    conn = op.get_bind()
    for table in reversed(TABLES):
        conn.execute(text(f"DROP POLICY IF EXISTS allow_all ON {table}"))
        conn.execute(text(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY"))
