from typing import Literal

from pydantic import BaseModel, Field


class VocabularyItem(BaseModel):
    text: str
    reading: str
    meaning: str
    wk_level: int = Field(alias="wk_level")
    subject_id: int | None = None
    srs_stage: int | None = None
    srs_category: str = "connector"
    item_type: Literal["vocabulary", "connector"] = "vocabulary"
    examples: list[str] = Field(default_factory=list)


class Token(BaseModel):
    text: str
    reading: str = ""
    meaning: str = ""
    wk_level: int | None = None
    is_unknown: bool = False
    kind: str


class Sentence(BaseModel):
    id: int
    title: str
    translation: str
    level: int
    tokens: list[Token]


class WaniKaniProfileRequest(BaseModel):
    api_key: str


class WaniKaniProfileResponse(BaseModel):
    username: str
    level: int
    vocabulary_count: int
    vocabulary: list[VocabularyItem]


class GenerateSentencesRequest(BaseModel):
    count: int = Field(default=5, ge=1, le=10)
    max_level: int = Field(default=1, ge=1, le=60)
    sentence_style: Literal["short", "medium", "long", "story"] = "short"
    unknown_levels_ahead: int = Field(default=0, ge=0, le=5)
    unknown_percentage: int = Field(default=20, ge=1, le=30)
    vocabulary: list[VocabularyItem]


class GenerateSentencesResponse(BaseModel):
    sentences: list[Sentence]
    used_ai: bool


class RecommendationRequest(BaseModel):
    max_level: int = Field(default=1, ge=1, le=60)
    vocabulary: list[VocabularyItem]


class RecommendationItem(BaseModel):
    title: str
    media_type: str
    reason: str
    level_note: str
    free_resource_url: str | None = None


class RecommendationResponse(BaseModel):
    recommendations: list[RecommendationItem]
    used_ai: bool
