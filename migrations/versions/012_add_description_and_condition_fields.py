"""add description, condition fields, and seller/vehicle detail columns

Revision ID: 012
Revises: 011
Create Date: 2026-06-02
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("cars", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("cars", sa.Column("color", sa.Text(), nullable=True))
    op.add_column("cars", sa.Column("seller_type", sa.Text(), nullable=True))
    op.add_column("cars", sa.Column("drivetrain", sa.Text(), nullable=True))
    op.add_column("cars", sa.Column("num_owners", sa.Integer(), nullable=True))
    op.add_column("cars", sa.Column("condition_signals", JSONB(), nullable=True,
                                    server_default="{}"))
    op.add_column("outlier_scores", sa.Column("condition_adjusted_score",
                                               sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("outlier_scores", "condition_adjusted_score")
    op.drop_column("cars", "condition_signals")
    op.drop_column("cars", "num_owners")
    op.drop_column("cars", "drivetrain")
    op.drop_column("cars", "seller_type")
    op.drop_column("cars", "color")
    op.drop_column("cars", "description")
