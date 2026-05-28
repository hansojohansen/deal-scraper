"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-05-27
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cars",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("source_id", sa.Text(), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("brand", sa.Text(), nullable=True),
        sa.Column("model", sa.Text(), nullable=True),
        sa.Column("year", sa.SmallInteger(), nullable=True),
        sa.Column("mileage", sa.Integer(), nullable=True),
        sa.Column("fuel_type", sa.Text(), nullable=True),
        sa.Column("transmission", sa.Text(), nullable=True),
        sa.Column("price", sa.Integer(), nullable=True),
        sa.Column("location", sa.Text(), nullable=True),
        sa.Column("features", JSONB(), server_default="{}", nullable=False),
        sa.Column("status", sa.Text(), server_default="active", nullable=False),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("url", name="uq_cars_url"),
    )
    op.create_index("ix_cars_brand", "cars", ["brand"])
    op.create_index("ix_cars_model", "cars", ["model"])
    op.create_index("ix_cars_year", "cars", ["year"])
    op.create_index("ix_cars_fuel_type", "cars", ["fuel_type"])
    op.create_index("ix_cars_source", "cars", ["source"])

    op.create_table(
        "price_history",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("car_id", sa.BigInteger(), nullable=False),
        sa.Column("price", sa.Integer(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["car_id"], ["cars.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_price_history_car_id", "price_history", ["car_id"])

    op.create_table(
        "outlier_scores",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("car_id", sa.BigInteger(), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("peer_group_size", sa.Integer(), nullable=False),
        sa.Column("peer_avg_price", sa.Integer(), nullable=False),
        sa.Column("detected_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["car_id"], ["cars.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("car_id", name="uq_outlier_car_id"),
    )

    op.create_table(
        "deal_alerts",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("notify_email", sa.Text(), nullable=False),
        sa.Column("brand", sa.Text(), nullable=True),
        sa.Column("model", sa.Text(), nullable=True),
        sa.Column("year_min", sa.SmallInteger(), nullable=True),
        sa.Column("year_max", sa.SmallInteger(), nullable=True),
        sa.Column("price_max", sa.Integer(), nullable=True),
        sa.Column("mileage_max", sa.Integer(), nullable=True),
        sa.Column("fuel_type", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("notify_push", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("push_token", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_deal_alerts_is_active", "deal_alerts", ["is_active"])

    op.create_table(
        "alert_matches",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("alert_id", sa.BigInteger(), nullable=False),
        sa.Column("car_id", sa.BigInteger(), nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["alert_id"], ["deal_alerts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["car_id"], ["cars.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("alert_id", "car_id", name="uq_alert_car"),
    )
    op.create_index("ix_alert_matches_alert_id", "alert_matches", ["alert_id"])
    op.create_index("ix_alert_matches_car_id", "alert_matches", ["car_id"])


def downgrade() -> None:
    op.drop_table("alert_matches")
    op.drop_table("deal_alerts")
    op.drop_table("outlier_scores")
    op.drop_table("price_history")
    op.drop_table("cars")
