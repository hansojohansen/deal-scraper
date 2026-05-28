"""Add missing vehicle detail columns and quality_tier to outlier_scores

Revision ID: 003
Revises: 002
Create Date: 2026-05-28

Uses IF NOT EXISTS so this is safe to run against a DB that already has
some of these columns from prior manual migrations.
"""

from alembic import op

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- cars: vehicle detail columns ---
    op.execute("ALTER TABLE cars ADD COLUMN IF NOT EXISTS eu_inspected_at DATE")
    op.execute("ALTER TABLE cars ADD COLUMN IF NOT EXISTS eu_next_deadline DATE")
    op.execute("ALTER TABLE cars ADD COLUMN IF NOT EXISTS is_norwegian_reg BOOLEAN")
    op.execute("ALTER TABLE cars ADD COLUMN IF NOT EXISTS listing_type TEXT")
    op.execute("ALTER TABLE cars ADD COLUMN IF NOT EXISTS horsepower SMALLINT")
    op.execute("ALTER TABLE cars ADD COLUMN IF NOT EXISTS body_type TEXT")
    op.execute("ALTER TABLE cars ADD COLUMN IF NOT EXISTS engine_size_cc SMALLINT")

    # --- outlier_scores: algorithm output columns ---
    op.execute("ALTER TABLE outlier_scores ADD COLUMN IF NOT EXISTS fair_value INTEGER")
    op.execute("ALTER TABLE outlier_scores ADD COLUMN IF NOT EXISTS method TEXT DEFAULT 'zscore'")
    op.execute("ALTER TABLE outlier_scores ADD COLUMN IF NOT EXISTS quality_tier TEXT")


def downgrade() -> None:
    # Only remove the truly new column; the others may have pre-existed.
    op.execute("ALTER TABLE outlier_scores DROP COLUMN IF EXISTS quality_tier")
