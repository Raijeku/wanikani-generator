from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException

from app.config import get_settings
from app.models import VocabularyItem, WaniKaniProfileResponse


WANIKANI_API_BASE = "https://api.wanikani.com/v2"
SRS_CATEGORIES = {
    0: "locked",
    1: "apprentice",
    2: "apprentice",
    3: "apprentice",
    4: "apprentice",
    5: "guru",
    6: "guru",
    7: "master",
    8: "enlightened",
    9: "burned",
}
COMMON_CONNECTORS = [
    VocabularyItem(
        text="そして",
        reading="そして",
        meaning="and then",
        wk_level=1,
        srs_category="connector",
        item_type="connector",
        examples=["朝ご飯を食べました。そして、学校へ行きました。"],
    ),
    VocabularyItem(
        text="でも",
        reading="でも",
        meaning="but",
        wk_level=1,
        srs_category="connector",
        item_type="connector",
        examples=["雨です。でも、出かけます。"],
    ),
    VocabularyItem(
        text="から",
        reading="から",
        meaning="because; from",
        wk_level=1,
        srs_category="connector",
        item_type="connector",
        examples=["時間がありませんから、急ぎます。"],
    ),
    VocabularyItem(
        text="それから",
        reading="それから",
        meaning="after that",
        wk_level=1,
        srs_category="connector",
        item_type="connector",
        examples=["本を読みました。それから、寝ました。"],
    ),
    VocabularyItem(
        text="しかし",
        reading="しかし",
        meaning="however",
        wk_level=1,
        srs_category="connector",
        item_type="connector",
        examples=["これは便利です。しかし、高いです。"],
    ),
]


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
        assignments = await _fetch_assignments(client, headers)

    decorated_vocabulary = []
    for item in vocabulary:
        srs_stage = assignments.get(item.subject_id or -1)
        item.srs_stage = srs_stage
        item.srs_category = _srs_category(srs_stage)
        decorated_vocabulary.append(item)

    full_vocabulary = decorated_vocabulary + COMMON_CONNECTORS

    return WaniKaniProfileResponse(
        username=user_data["username"],
        level=level,
        vocabulary_count=len(full_vocabulary),
        vocabulary=full_vocabulary,
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


async def _fetch_assignments(client: httpx.AsyncClient, headers: dict[str, str]) -> dict[int, int]:
    assignments: dict[int, int] = {}
    next_url: str | None = f"{WANIKANI_API_BASE}/assignments?subject_types=vocabulary,kana_vocabulary"

    while next_url:
        response = await client.get(next_url, headers=headers)
        response.raise_for_status()
        body = response.json()

        for record in body["data"]:
            data = record["data"]
            assignments[int(data["subject_id"])] = int(data.get("srs_stage") or 0)

        next_url = body["pages"]["next_url"]

    return assignments


def _subject_to_vocabulary(record: dict[str, Any]) -> VocabularyItem | None:
    data = record["data"]
    characters = data.get("characters")
    if not characters:
        return None

    meanings = data.get("meanings", [])
    readings = data.get("readings", [])
    primary_meaning = next((item["meaning"] for item in meanings if item.get("primary")), None)
    primary_reading = next((item["reading"] for item in readings if item.get("primary")), None)
    examples = []
    for sentence in data.get("context_sentences", []):
        english = sentence.get("en")
        japanese = sentence.get("ja")
        if japanese and english:
            examples.append(f"{japanese} - {english}")
        elif japanese:
            examples.append(japanese)

    return VocabularyItem(
        subject_id=int(record["id"]),
        text=characters,
        reading=primary_reading or characters,
        meaning=primary_meaning or "WaniKani vocabulary",
        wk_level=int(data["level"]),
        examples=examples[:2],
        item_type="vocabulary",
        srs_category="locked",
    )


def _srs_category(stage: int | None) -> str:
    if stage is None:
        return "locked"

    return SRS_CATEGORIES.get(stage, "locked")
