"""FCM push notification stub — logs payload, no-ops. Replace with firebase-admin in Phase 8."""
import json


async def send_push(token: str, title: str, body: str, data: dict | None = None) -> bool:
    payload = {"token": token, "title": title, "body": body, "data": data or {}}
    print(f"[push_stub] Would send FCM: {json.dumps(payload)}")
    return True
