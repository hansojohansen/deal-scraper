"""Async email notifications via aiosmtplib."""
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

from backend.config import settings


def _build_html(car_data: dict, outlier_pct: int | None) -> str:
    badge = ""
    if outlier_pct:
        badge = f'<div style="background:#16a34a;color:#fff;padding:6px 12px;border-radius:4px;display:inline-block;font-weight:bold;margin-bottom:12px;">{outlier_pct}% below market</div><br>'
    price_str = f"{car_data['price']:,} NOK" if car_data.get("price") else "N/A"
    mileage_str = f"{car_data['mileage']:,} km" if car_data.get("mileage") else "N/A"
    return f"""
<html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="color:#1d4ed8;">Deal Alert: {car_data.get('title','Car')}</h2>
  {badge}
  <table style="border-collapse:collapse;width:100%">
    <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;"><b>Price</b></td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">{price_str}</td></tr>
    <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;"><b>Year</b></td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">{car_data.get('year','')}</td></tr>
    <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;"><b>Mileage</b></td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">{mileage_str}</td></tr>
    <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;"><b>Fuel</b></td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">{car_data.get('fuel_type','')}</td></tr>
  </table>
  <br>
  <a href="{car_data['url']}" style="background:#1d4ed8;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;display:inline-block;">View on Finn.no</a>
  <p style="color:#6b7280;font-size:12px;margin-top:24px;">You received this because you set up a deal alert. Reply to unsubscribe.</p>
</body></html>
"""


async def send_reset_email(to_email: str, raw_token: str) -> bool:
    if not settings.smtp_host or not settings.smtp_user:
        print(f"[email] SMTP not configured — skipping reset email to {to_email}")
        return False
    reset_url = f"http://localhost:5173/reset-password?token={raw_token}&email={to_email}"
    html = f"""
<html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <h2>Reset your password</h2>
  <p>Click the link below to reset your password. This link expires in 30 minutes.</p>
  <a href="{reset_url}" style="background:#1d4ed8;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;display:inline-block;">Reset Password</a>
  <p style="color:#6b7280;font-size:12px;margin-top:24px;">If you didn't request this, you can ignore this email.</p>
</body></html>
"""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Reset your password"
    msg["From"] = settings.smtp_user
    msg["To"] = to_email
    msg.attach(MIMEText(html, "html"))
    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user,
            password=settings.smtp_password,
            start_tls=True,
        )
        return True
    except Exception as e:
        print(f"[email] Failed to send reset email to {to_email}: {e}")
        return False


async def send_alert(to_email: str, car_data: dict, outlier_pct: int | None = None) -> bool:
    if not settings.smtp_host or not settings.smtp_user:
        print(f"[email] SMTP not configured — skipping send to {to_email}")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Deal Alert: {car_data.get('title','Car')} — {car_data.get('price', 0):,} NOK"
    msg["From"] = settings.smtp_user
    msg["To"] = to_email
    msg.attach(MIMEText(_build_html(car_data, outlier_pct), "html"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user,
            password=settings.smtp_password,
            start_tls=True,
        )
        print(f"[email] Sent alert to {to_email} for car {car_data.get('url')}")
        return True
    except Exception as e:
        print(f"[email] Failed to send to {to_email}: {e}")
        return False
