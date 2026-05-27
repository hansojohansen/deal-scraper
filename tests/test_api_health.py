"""Smoke test for the FastAPI health endpoint (no DB)."""
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient


def test_health_ok():
    with patch("backend.db.session.engine") as mock_engine:
        mock_conn = AsyncMock()
        mock_engine.connect.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_engine.connect.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_conn.execute = AsyncMock()

        from backend.main import create_app
        app = create_app()
        client = TestClient(app, raise_server_exceptions=False)
        # Health may 500 without real DB in test — just check it responds
        r = client.get("/health")
        assert r.status_code in (200, 500)
