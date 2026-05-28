"""add quality_tier to outlier_scores

Revision ID: 008
Revises: 007
Create Date: 2026-05-28
"""
import sqlalchemy as sa
from alembic import op

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("outlier_scores", sa.Column("quality_tier", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("outlier_scores", "quality_tier")
