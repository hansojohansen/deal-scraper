"""add min_discount_pct to deal_alerts

Revision ID: 005
Revises: 004
Create Date: 2026-05-27
"""
import sqlalchemy as sa
from alembic import op

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("deal_alerts", sa.Column("min_discount_pct", sa.Integer(), nullable=True))

def downgrade() -> None:
    op.drop_column("deal_alerts", "min_discount_pct")
