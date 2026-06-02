"""add reg_number, lien fields, and watchlist_items table

Revision ID: 013
Revises: 012
Create Date: 2026-06-02
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("cars", sa.Column("reg_number", sa.Text(), nullable=True))
    op.add_column("cars", sa.Column("first_reg_date", sa.Date(), nullable=True))
    op.add_column("cars", sa.Column("has_lien", sa.Boolean(), nullable=True))
    op.add_column("cars", sa.Column("lien_amount", sa.Integer(), nullable=True))
    op.add_column("cars", sa.Column("lien_checked_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "watchlist_items",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "car_id",
            sa.BigInteger(),
            sa.ForeignKey("cars.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "car_id", name="uq_watchlist_user_car"),
    )


def downgrade() -> None:
    op.drop_table("watchlist_items")
    op.drop_column("cars", "lien_checked_at")
    op.drop_column("cars", "lien_amount")
    op.drop_column("cars", "has_lien")
    op.drop_column("cars", "first_reg_date")
    op.drop_column("cars", "reg_number")
