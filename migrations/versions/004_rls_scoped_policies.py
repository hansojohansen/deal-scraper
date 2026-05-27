"""Replace open allow_all RLS policies with scoped per-operation policies

Revision ID: 004
Revises: 003
Create Date: 2026-05-27

Scoped policy design:
  cars / price_history / outlier_scores — public read (anon + authenticated),
    no write via PostgREST (backend uses direct connection which bypasses RLS)
  deal_alerts / alert_matches — no public access until user auth is added in Phase 8;
    backend writes directly via postgres role (bypasses RLS)
"""

from alembic import op
from sqlalchemy import text

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None

PUBLIC_READ_TABLES = ["cars", "price_history", "outlier_scores"]
SERVICE_ONLY_TABLES = ["deal_alerts", "alert_matches"]


def upgrade() -> None:
    conn = op.get_bind()

    # Drop the permissive allow_all policies from migration 003
    for table in PUBLIC_READ_TABLES + SERVICE_ONLY_TABLES:
        conn.execute(text(f"DROP POLICY IF EXISTS allow_all ON {table}"))

    # Public read-only tables: allow SELECT for anon and authenticated roles
    # No INSERT/UPDATE/DELETE — those only happen via our direct-connection backend
    for table in PUBLIC_READ_TABLES:
        conn.execute(text(
            f'CREATE POLICY "Public can view {table}" '
            f"ON {table} FOR SELECT TO anon, authenticated USING (true)"
        ))

    # deal_alerts and alert_matches: no public access yet
    # When auth is added (Phase 8), add:
    #   CREATE POLICY "Users manage own alerts" ON deal_alerts
    #   FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    # No policy created here — PostgREST access is blocked; backend bypasses RLS


def downgrade() -> None:
    conn = op.get_bind()

    for table in PUBLIC_READ_TABLES:
        conn.execute(text(f'DROP POLICY IF EXISTS "Public can view {table}" ON {table}'))

    # Restore the open policies
    for table in PUBLIC_READ_TABLES + SERVICE_ONLY_TABLES:
        conn.execute(text(
            f"CREATE POLICY allow_all ON {table} FOR ALL USING (true) WITH CHECK (true)"
        ))
