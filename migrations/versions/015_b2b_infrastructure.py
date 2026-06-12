"""add deal_events table and user.plan field

Revision ID: 015
Revises: 014
Create Date: 2026-06-12
"""
import sqlalchemy as sa
from alembic import op

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("plan", sa.Text(), server_default="free", nullable=False))

    op.create_table(
        "deal_events",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("car_id", sa.BigInteger(), sa.ForeignKey("cars.id", ondelete="CASCADE"), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("quality_tier", sa.Text(), nullable=True),
        sa.Column("brand", sa.Text(), nullable=True),
        sa.Column("model", sa.Text(), nullable=True),
        sa.Column("price", sa.Integer(), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("detected_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_deal_events_detected_at", "deal_events", ["detected_at"])
    op.create_index("ix_deal_events_car_id", "deal_events", ["car_id"])


def downgrade() -> None:
    op.drop_index("ix_deal_events_car_id", table_name="deal_events")
    op.drop_index("ix_deal_events_detected_at", table_name="deal_events")
    op.drop_table("deal_events")
    op.drop_column("users", "plan")
