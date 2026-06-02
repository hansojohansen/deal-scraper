"""Quick SMTP connection test — run once, then delete."""
import asyncio

from dotenv import load_dotenv

load_dotenv()

from backend.config import settings  # noqa: E402
from notifications.email import send_alert  # noqa: E402


async def main():
    if not settings.smtp_user:
        print("ERROR: SMTP_USER is empty in .env")
        return
    print(f"Testing SMTP as {settings.smtp_user} via {settings.smtp_host}:{settings.smtp_port}")
    ok = await send_alert(
        to_email=settings.smtp_user,
        car_data={
            "title": "Test Alert — Nissan Leaf",
            "brand": "Nissan", "model": "Leaf",
            "year": 2014, "price": 35000,
            "mileage": 98632, "fuel_type": "El",
            "url": "https://www.finn.no/mobility/item/456971928",
        },
        outlier_pct=79,
    )
    print("SUCCESS — check your inbox" if ok else "FAILED — check credentials")

asyncio.run(main())
