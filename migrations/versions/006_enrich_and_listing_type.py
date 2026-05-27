"""add eu inspection, norwegian registration, and listing_type to cars

Revision ID: 006
Revises: 005
Create Date: 2026-05-27
"""
import sqlalchemy as sa
from alembic import op

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("cars", sa.Column("eu_inspected_at", sa.Date(), nullable=True))
    op.add_column("cars", sa.Column("eu_next_deadline", sa.Date(), nullable=True))
    op.add_column("cars", sa.Column("is_norwegian_reg", sa.Boolean(), nullable=True))
    op.add_column("cars", sa.Column("listing_type", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("cars", "listing_type")
    op.drop_column("cars", "is_norwegian_reg")
    op.drop_column("cars", "eu_next_deadline")
    op.drop_column("cars", "eu_inspected_at")
