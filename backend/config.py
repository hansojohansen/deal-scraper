from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000", "capacitor://localhost"]
    gemini_api_key: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
