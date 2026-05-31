from functools import lru_cache
from os import getenv

from dotenv import load_dotenv


load_dotenv()


class Settings:
    openai_api_key: str | None = getenv("OPENAI_API_KEY")
    openai_model: str = getenv("OPENAI_MODEL", "gpt-5.2")
    frontend_origin: str = getenv("FRONTEND_ORIGIN", "http://localhost:3000")
    wanikani_revision: str = "20170710"


@lru_cache
def get_settings() -> Settings:
    return Settings()
