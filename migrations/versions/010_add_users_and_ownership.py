"""add users table and user_id ownership to deal_alerts

Revision ID: 010
Revises: 009
Create Date: 2026-05-28
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("hashed_pw", sa.Text(), nullable=False),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("verify_token", sa.Text(), nullable=True),
        sa.Column("reset_token", sa.Text(), nullable=True),
        sa.Column("reset_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("idx_users_email", "users", ["email"], unique=True)

    op.add_column(
        "deal_alerts",
        sa.Column("user_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_deal_alerts_user_id",
        "deal_alerts", "users",
        ["user_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_index("idx_alerts_user_id", "deal_alerts", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_alerts_user_id", table_name="deal_alerts")
    op.drop_constraint("fk_deal_alerts_user_id", "deal_alerts", type_="foreignkey")
    op.drop_column("deal_alerts", "user_id")
    op.drop_index("idx_users_email", table_name="users")
    op.drop_table("users")
