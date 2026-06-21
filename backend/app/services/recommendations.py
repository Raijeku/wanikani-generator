import json

from openai import OpenAI

from app.config import get_settings
from app.models import RecommendationItem, RecommendationRequest, RecommendationResponse, VocabularyItem


async def recommend_media(request: RecommendationRequest) -> RecommendationResponse:
    selected = [item for item in request.vocabulary if item.wk_level <= request.max_level or item.item_type == "connector"]
    settings = get_settings()

    if settings.openai_api_key and selected:
        try:
            return RecommendationResponse(
                recommendations=_recommend_with_openai(selected, request.max_level, settings.openai_api_key, settings.openai_model),
                used_ai=True,
            )
        except Exception:
            return RecommendationResponse(recommendations=_fallback_recommendations(request.max_level), used_ai=False)

    return RecommendationResponse(recommendations=_fallback_recommendations(request.max_level), used_ai=False)


def _recommend_with_openai(
    vocabulary: list[VocabularyItem],
    max_level: int,
    api_key: str,
    model: str,
) -> list[RecommendationItem]:
    client = OpenAI(api_key=api_key)
    sample = vocabulary[:120]
    prompt = {
        "task": "Recommend reading or viewing material for a Japanese learner.",
        "rules": [
            "Use the WaniKani level and selected vocabulary to explain why each recommendation fits.",
            "Prefer beginner-friendly books, manga, anime, movies, graded readers, or public-domain texts.",
            "Only include a free_resource_url when it is a legal, public, stable free resource such as Aozora Bunko.",
            "Do not invent PDF links.",
            "Return strict JSON with a top-level recommendations array.",
        ],
        "max_level": max_level,
        "selected_vocabulary": [item.model_dump() for item in sample],
        "shape": {
            "recommendations": [
                {
                    "title": "title",
                    "media_type": "book | graded reader | anime | movie | manga | website",
                    "reason": "why it matches",
                    "level_note": "difficulty note",
                    "free_resource_url": None,
                }
            ]
        },
    }

    response = client.responses.create(
        model=model,
        input=[
            {
                "role": "system",
                "content": "You recommend Japanese learning media and output only valid JSON.",
            },
            {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
        ],
    )
    parsed = json.loads(response.output_text)
    return [RecommendationItem.model_validate(item) for item in parsed["recommendations"][:6]]


def _fallback_recommendations(max_level: int) -> list[RecommendationItem]:
    return [
        RecommendationItem(
            title="Tadoku Free Graded Readers",
            media_type="graded reader",
            reason="Short, learner-focused reading with simple vocabulary and visual support.",
            level_note=f"Good starting point around WaniKani level {max_level}.",
            free_resource_url="https://tadoku.org/japanese/free-books/",
        ),
        RecommendationItem(
            title="NHK News Web Easy",
            media_type="website",
            reason="Short real-world articles with easier language and furigana support.",
            level_note="Better once you are comfortable with basic grammar and common vocabulary.",
            free_resource_url="https://www3.nhk.or.jp/news/easy/",
        ),
        RecommendationItem(
            title="Aozora Bunko",
            media_type="public-domain books",
            reason="Legal free Japanese texts; choose shorter children-oriented stories first.",
            level_note="Often harder than graded readers, but useful for browsing familiar words.",
            free_resource_url="https://www.aozora.gr.jp/",
        ),
        RecommendationItem(
            title="Shirokuma Cafe",
            media_type="anime",
            reason="Everyday topics and repeated conversational patterns make it approachable.",
            level_note="Use subtitles and pause often; better as listening exposure than pure reading.",
        ),
    ]
