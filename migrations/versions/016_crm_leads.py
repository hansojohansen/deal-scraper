"""add crm_leads table

Revision ID: 016
Revises: 015
Create Date: 2026-06-12
"""
import sqlalchemy as sa
from alembic import op

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "crm_leads",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("car_id", sa.BigInteger(),
                  sa.ForeignKey("cars.id", ondelete="SET NULL"), nullable=True),
        sa.Column("stage", sa.Text(), nullable=False, server_default="lead"),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("brand", sa.Text(), nullable=True),
        sa.Column("model", sa.Text(), nullable=True),
        sa.Column("year", sa.SmallInteger(), nullable=True),
        sa.Column("price", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("contact_name", sa.Text(), nullable=True),
        sa.Column("contact_phone", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_crm_leads_user_id", "crm_leads", ["user_id"])
    op.create_index("ix_crm_leads_car_id", "crm_leads", ["car_id"])
    op.create_index("ix_crm_leads_stage", "crm_leads", ["stage"])


def downgrade() -> None:
    op.drop_index("ix_crm_leads_stage", table_name="crm_leads")
    op.drop_index("ix_crm_leads_car_id", table_name="crm_leads")
    op.drop_index("ix_crm_leads_user_id", table_name="crm_leads")
    op.drop_table("crm_leads")
