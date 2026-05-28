from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    Float,
    ForeignKey,
    Integer,
    SmallInteger,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import DateTime


class Base(DeclarativeBase):
    pass


class Car(Base):
    __tablename__ = "cars"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    source_id: Mapped[str] = mapped_column(Text, nullable=False)
    url: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    title: Mapped[str | None] = mapped_column(Text)
    brand: Mapped[str | None] = mapped_column(Text, index=True)
    model: Mapped[str | None] = mapped_column(Text, index=True)
    year: Mapped[int | None] = mapped_column(SmallInteger, index=True)
    mileage: Mapped[int | None] = mapped_column(Integer)
    fuel_type: Mapped[str | None] = mapped_column(Text, index=True)
    transmission: Mapped[str | None] = mapped_column(Text)
    price: Mapped[int | None] = mapped_column(Integer)
    location: Mapped[str | None] = mapped_column(Text)
    features: Mapped[dict[str, Any]] = mapped_column(JSONB, default={}, server_default="{}")
    status: Mapped[str] = mapped_column(Text, default="active", server_default="active")
    eu_inspected_at: Mapped[date | None] = mapped_column(Date)
    eu_next_deadline: Mapped[date | None] = mapped_column(Date)
    is_norwegian_reg: Mapped[bool | None] = mapped_column(Boolean)
    listing_type: Mapped[str | None] = mapped_column(Text)
    horsepower: Mapped[int | None] = mapped_column(SmallInteger, index=True)
    body_type: Mapped[str | None] = mapped_column(Text, index=True)
    engine_size_cc: Mapped[int | None] = mapped_column(SmallInteger)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_seen_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now()
    )

    price_history: Mapped[list["PriceHistory"]] = relationship(
        back_populates="car", cascade="all, delete-orphan"
    )
    outlier_score: Mapped["OutlierScore | None"] = relationship(
        back_populates="car", cascade="all, delete-orphan", uselist=False
    )


class PriceHistory(Base):
    __tablename__ = "price_history"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    car_id: Mapped[int] = mapped_column(
        ForeignKey("cars.id", ondelete="CASCADE"), nullable=False, index=True
    )
    price: Mapped[int] = mapped_column(Integer, nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    car: Mapped["Car"] = relationship(back_populates="price_history")


class OutlierScore(Base):
    __tablename__ = "outlier_scores"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    car_id: Mapped[int] = mapped_column(
        ForeignKey("cars.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    score: Mapped[float] = mapped_column(Float, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    peer_group_size: Mapped[int] = mapped_column(Integer, nullable=False)
    peer_avg_price: Mapped[int] = mapped_column(Integer, nullable=False)
    fair_value: Mapped[int | None] = mapped_column(Integer)
    method: Mapped[str | None] = mapped_column(Text, default="zscore")
    quality_tier: Mapped[str | None] = mapped_column(Text)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    car: Mapped["Car"] = relationship(back_populates="outlier_score")


class DealAlert(Base):
    __tablename__ = "deal_alerts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    notify_email: Mapped[str] = mapped_column(Text, nullable=False)
    brand: Mapped[str | None] = mapped_column(Text)
    model: Mapped[str | None] = mapped_column(Text)
    year_min: Mapped[int | None] = mapped_column(SmallInteger)
    year_max: Mapped[int | None] = mapped_column(SmallInteger)
    price_max: Mapped[int | None] = mapped_column(Integer)
    mileage_max: Mapped[int | None] = mapped_column(Integer)
    fuel_type: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", index=True)
    notify_push: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    min_discount_pct: Mapped[int | None] = mapped_column(Integer)
    push_token: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    matches: Mapped[list["AlertMatch"]] = relationship(
        back_populates="alert", cascade="all, delete-orphan"
    )


class AlertMatch(Base):
    __tablename__ = "alert_matches"
    __table_args__ = (UniqueConstraint("alert_id", "car_id", name="uq_alert_car"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    alert_id: Mapped[int] = mapped_column(
        ForeignKey("deal_alerts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    car_id: Mapped[int] = mapped_column(
        ForeignKey("cars.id", ondelete="CASCADE"), nullable=False, index=True
    )
    score: Mapped[float | None] = mapped_column(Float)
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    alert: Mapped["DealAlert"] = relationship(back_populates="matches")
