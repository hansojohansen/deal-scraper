from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    jwt_secret: str  # required — no default; set JWT_SECRET in .env
    jwt_algorithm: str = "HS256"
    access_token_expire_hours: int = 24
    password_reset_expire_minutes: int = 30
    cookie_secure: bool = False  # set COOKIE_SECURE=true in production (HTTPS)
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    gemini_api_key: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    log_level: str = "INFO"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
