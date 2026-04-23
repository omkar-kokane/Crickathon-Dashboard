from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    class Config:
        env_file = ".env"

print(Settings().CORS_ORIGINS)
