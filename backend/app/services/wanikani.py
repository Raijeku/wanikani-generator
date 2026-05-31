from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException

from app.config import get_settings
from app.models import VocabularyItem, WaniKaniProfileResponse


WANIKANI_API_BASE = "https://api.wanikani.com/v2"


async def fetch_profile(api_key: str) -> WaniKaniProfileResponse:
    settings = get_settings()
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Wanikani-Revision": settings.wanikani_revision,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        user_response = await client.get(f"{WANIKANI_API_BASE}/user", headers=headers)
        if user_response.status_code == 401:
            raise HTTPException(status_code=401, detail="WaniKani rejected the API token.")
        user_response.raise_for_status()
        user_data = user_response.json()["data"]

        level = int(user_data["level"])
        preview_level = min(level + 5, 60)
        levels = ",".join(str(level_number) for level_number in range(1, preview_level + 1))
        query = urlencode({"types": "vocabulary,kana_vocabulary", "levels": levels})
        vocabulary = await _fetch_subjects(client, f"{WANIKANI_API_BASE}/subjects?{query}", headers)

    return WaniKaniProfileResponse(
        username=user_data["username"],
        level=level,
        vocabulary_count=len(vocabulary),
        vocabulary=vocabulary,
    )


async def _fetch_subjects(
    client: httpx.AsyncClient,
    url: str,
    headers: dict[str, str],
) -> list[VocabularyItem]:
    vocabulary: list[VocabularyItem] = []
    next_url: str | None = url

    while next_url:
        response = await client.get(next_url, headers=headers)
        response.raise_for_status()
        body = response.json()

        for record in body["data"]:
            item = _subject_to_vocabulary(record)
            if item:
                vocabulary.append(item)

        next_url = body["pages"]["next_url"]

    return vocabulary


def _subject_to_vocabulary(record: dict[str, Any]) -> VocabularyItem | None:
    data = record["data"]
    characters = data.get("characters")
    if not characters:
        return None

    meanings = data.get("meanings", [])
    readings = data.get("readings", [])
    primary_meaning = next((item["meaning"] for item in meanings if item.get("primary")), None)
    primary_reading = next((item["reading"] for item in readings if item.get("primary")), None)

    return VocabularyItem(
        text=characters,
        reading=primary_reading or characters,
        meaning=primary_meaning or "WaniKani vocabulary",
        wk_level=int(data["level"]),
    )
