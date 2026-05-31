from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.models import (
    GenerateSentencesRequest,
    GenerateSentencesResponse,
    WaniKaniProfileRequest,
    WaniKaniProfileResponse,
)
from app.services.sentence_generator import generate_sentences
from app.services.wanikani import fetch_profile


settings = get_settings()

app = FastAPI(title="WaniKani Sentence Generator API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/wanikani/profile", response_model=WaniKaniProfileResponse)
async def wanikani_profile(request: WaniKaniProfileRequest) -> WaniKaniProfileResponse:
    return await fetch_profile(request.api_key)


@app.post("/api/sentences/generate", response_model=GenerateSentencesResponse)
async def sentence_generation(request: GenerateSentencesRequest) -> GenerateSentencesResponse:
    return await generate_sentences(request)
