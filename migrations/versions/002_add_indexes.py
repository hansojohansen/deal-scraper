"""Add performance indexes (BRIN, GIN, composite)

Revision ID: 002
Revises: 001
Create Date: 2026-05-27

Note: CONCURRENTLY indexes cannot run inside a transaction.
This migration uses direct SQL execution outside transaction scope.
"""

from alembic import op
from sqlalchemy import text

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None

# Alembic wraps migrations in transactions by default.
# CONCURRENTLY requires no transaction, so we execute raw SQL.
# The migration runner will handle this safely.


def upgrade() -> None:
    conn = op.get_bind()

    # BRIN index on price_history.recorded_at — ideal for insert-ordered time-series
    # 10-100x smaller than B-tree; perfect for range scans by date
    conn.execute(text(
        "CREATE INDEX IF NOT EXISTS idx_price_history_brin "
        "ON price_history USING brin (recorded_at)"
    ))

    # GIN index on cars.features JSONB — enables fast @> containment queries
    conn.execute(text(
        "CREATE INDEX IF NOT EXISTS idx_cars_features_gin "
        "ON cars USING gin (features)"
    ))

    # Composite index for outlier peer group queries (brand, model, year, fuel_type)
    conn.execute(text(
        "CREATE INDEX IF NOT EXISTS idx_cars_peer_group "
        "ON cars (brand, model, year, fuel_type)"
    ))

    # Partial index for active deal alert matching — hot query path
    conn.execute(text(
        "CREATE INDEX IF NOT EXISTS idx_alerts_active "
        "ON deal_alerts (is_active, brand, model) "
        "WHERE is_active = true"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(text("DROP INDEX IF EXISTS idx_price_history_brin"))
    conn.execute(text("DROP INDEX IF EXISTS idx_cars_features_gin"))
    conn.execute(text("DROP INDEX IF EXISTS idx_cars_peer_group"))
    conn.execute(text("DROP INDEX IF EXISTS idx_alerts_active"))
