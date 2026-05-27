"""add horsepower, body_type, engine_size_cc to cars; fair_value, method to outlier_scores

Revision ID: 007
Revises: 006
Create Date: 2026-05-27
"""
import sqlalchemy as sa
from alembic import op

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("cars", sa.Column("horsepower", sa.SmallInteger(), nullable=True))
    op.add_column("cars", sa.Column("body_type", sa.Text(), nullable=True))
    op.add_column("cars", sa.Column("engine_size_cc", sa.SmallInteger(), nullable=True))
    op.create_index("ix_cars_body_type", "cars", ["body_type"])
    op.create_index("ix_cars_horsepower", "cars", ["horsepower"])
    op.add_column("outlier_scores", sa.Column("fair_value", sa.Integer(), nullable=True))
    op.add_column("outlier_scores", sa.Column("method", sa.Text(), nullable=True, server_default="zscore"))


def downgrade() -> None:
    op.drop_column("outlier_scores", "method")
    op.drop_column("outlier_scores", "fair_value")
    op.drop_index("ix_cars_horsepower", table_name="cars")
    op.drop_index("ix_cars_body_type", table_name="cars")
    op.drop_column("cars", "engine_size_cc")
    op.drop_column("cars", "body_type")
    op.drop_column("cars", "horsepower")
