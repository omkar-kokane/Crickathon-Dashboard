from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Crickathon API"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "postgresql://user:password@localhost:5432/crickathon"

    # Firebase
    FIREBASE_PROJECT_ID: str = ""
    FIREBASE_DATABASE_URL: str = ""
    GOOGLE_APPLICATION_CREDENTIALS: str = "./service_account_key.json"

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    # Bootstrap (for creating the first SuperAdmin)
    BOOTSTRAP_SECRET: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
