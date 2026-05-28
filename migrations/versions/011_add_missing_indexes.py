"""add missing performance indexes on cars

Revision ID: 011
Revises: 010
Create Date: 2026-05-28
"""
from alembic import op

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("idx_cars_status", "cars", ["status"])
    op.create_index("idx_cars_source_status", "cars", ["source", "status"])
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_cars_price ON cars(price) WHERE price IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_cars_mileage ON cars(mileage) WHERE mileage IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_index("idx_cars_mileage", table_name="cars")
    op.drop_index("idx_cars_price", table_name="cars")
    op.drop_index("idx_cars_source_status", table_name="cars")
    op.drop_index("idx_cars_status", table_name="cars")
