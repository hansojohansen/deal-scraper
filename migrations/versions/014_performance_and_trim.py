"""add trim_level, dom_days, market_stats, extra alert filters, composite indexes

Revision ID: 014
Revises: 013
Create Date: 2026-06-12
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- cars: new fields ---
    op.add_column("cars", sa.Column("trim_level", sa.Text(), nullable=True))
    op.add_column("cars", sa.Column("dom_days", sa.Integer(), nullable=True))

    # --- deal_alerts: hyper-specific filter support ---
    op.add_column("deal_alerts", sa.Column("alert_name", sa.Text(), nullable=True))
    op.add_column("deal_alerts", sa.Column("extra_filters", JSONB(), server_default="{}", nullable=False))

    # --- market_stats: pre-computed per-model price and DOM stats ---
    op.create_table(
        "market_stats",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("brand", sa.Text(), nullable=False),
        sa.Column("model", sa.Text(), nullable=False),
        sa.Column("fuel_type", sa.Text(), nullable=False, server_default=""),
        sa.Column("median_price", sa.Integer(), nullable=True),
        sa.Column("avg_price", sa.Integer(), nullable=True),
        sa.Column("avg_dom_days", sa.Float(), nullable=True),
        sa.Column("sample_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("brand", "model", "fuel_type", name="uq_market_stats_model"),
    )
    op.create_index("ix_market_stats_brand_model", "market_stats", ["brand", "model"])

    # --- composite indexes for query performance ---
    # Peer matching in outlier engine (brand, model, status)
    op.create_index(
        "ix_cars_brand_model_status",
        "cars",
        ["brand", "model", "status"],
        postgresql_where=sa.text("brand IS NOT NULL AND model IS NOT NULL"),
    )
    # Filtered car list queries
    op.create_index(
        "ix_cars_status_price_year_mileage",
        "cars",
        ["status", "price", "year", "mileage"],
        postgresql_where=sa.text("status = 'active'"),
    )
    # DOM stats calculation
    op.create_index(
        "ix_cars_first_last_seen",
        "cars",
        ["first_seen_at", "last_seen_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_cars_first_last_seen", table_name="cars")
    op.drop_index("ix_cars_status_price_year_mileage", table_name="cars")
    op.drop_index("ix_cars_brand_model_status", table_name="cars")
    op.drop_index("ix_market_stats_brand_model", table_name="market_stats")
    op.drop_table("market_stats")
    op.drop_column("deal_alerts", "extra_filters")
    op.drop_column("deal_alerts", "alert_name")
    op.drop_column("cars", "dom_days")
    op.drop_column("cars", "trim_level")
