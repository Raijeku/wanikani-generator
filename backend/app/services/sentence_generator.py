import json
import random

from openai import OpenAI

from app.config import get_settings
from app.models import GenerateSentencesRequest, GenerateSentencesResponse, Sentence, Token, VocabularyItem


DEFAULT_UNKNOWN_PERCENTAGE = 20


async def generate_sentences(request: GenerateSentencesRequest) -> GenerateSentencesResponse:
    known_vocabulary = [item for item in request.vocabulary if item.wk_level <= request.max_level]
    unknown_limit = min(request.max_level + request.unknown_levels_ahead, 60)
    unknown_vocabulary = [
        item
        for item in request.vocabulary
        if request.max_level < item.wk_level <= unknown_limit
    ]

    if not known_vocabulary:
        return GenerateSentencesResponse(sentences=[], used_ai=False)

    settings = get_settings()
    if settings.openai_api_key:
        try:
            sentences = _generate_with_openai(
                request=request,
                known_vocabulary=known_vocabulary,
                unknown_vocabulary=unknown_vocabulary,
                api_key=settings.openai_api_key,
                model=settings.openai_model,
            )
            return GenerateSentencesResponse(sentences=sentences, used_ai=True)
        except Exception:
            # Keep the app usable while provider output rules are tuned.
            return GenerateSentencesResponse(
                sentences=_generate_locally(request, known_vocabulary, unknown_vocabulary),
                used_ai=False,
            )

    return GenerateSentencesResponse(
        sentences=_generate_locally(request, known_vocabulary, unknown_vocabulary),
        used_ai=False,
    )


def _generate_with_openai(
    request: GenerateSentencesRequest,
    known_vocabulary: list[VocabularyItem],
    unknown_vocabulary: list[VocabularyItem],
    api_key: str,
    model: str,
) -> list[Sentence]:
    client = OpenAI(api_key=api_key)
    known_sample = _sample_vocabulary(known_vocabulary, min(70, max(18, request.count * 12)))
    unknown_sample = []
    if request.unknown_levels_ahead > 0:
        unknown_sample = _sample_vocabulary(unknown_vocabulary, min(12, max(3, request.count * 2)))

    style_guidance = {
        "short": "Generate short single sentences, roughly 5 to 9 Japanese tokens each.",
        "medium": "Generate longer single sentences with one natural clause expansion.",
        "long": "Generate each item as a compact two-sentence entry. Keep it shorter than the story style.",
        "story": "Generate a connected mini story across the requested items. Each item should be about as long as a long entry, but the entries must clearly connect into one shared sequence.",
    }
    prompt = {
        "task": "Generate Japanese study sentences.",
        "rules": [
            "Use only the provided WaniKani vocabulary plus common Japanese particles and endings.",
            "Do not introduce content words that are not in the vocabulary lists.",
            style_guidance[request.sentence_style],
            "Return strict JSON with a top-level 'sentences' array.",
            "Every token must include text, reading, meaning, kind, is_unknown, and wk_level for vocabulary.",
            "Allowed token kinds are vocabulary, particle, ending.",
            "Set is_unknown to true only for words from the unknown vocabulary list.",
            f"If unknown vocabulary is enabled, keep unknown words to a small minority of vocabulary tokens, around {request.unknown_percentage} percent.",
            "If unknown_levels_ahead is 0, do not use any unknown vocabulary.",
        ],
        "count": request.count,
        "max_level": request.max_level,
        "sentence_style": request.sentence_style,
        "unknown_levels_ahead": request.unknown_levels_ahead,
        "known_vocabulary": [item.model_dump() for item in known_sample],
        "unknown_vocabulary": [item.model_dump() for item in unknown_sample],
        "shape": {
            "sentences": [
                {
                    "id": 1,
                    "title": "short English title",
                    "translation": "English sentence translation",
                    "level": request.max_level,
                    "tokens": [
                        {
                            "text": "日本語",
                            "reading": "にほんご",
                            "meaning": "Japanese language",
                            "wk_level": 1,
                            "is_unknown": False,
                            "kind": "vocabulary",
                        }
                    ],
                }
            ]
        },
    }

    response = client.responses.create(
        model=model,
        input=[
            {
                "role": "system",
                "content": "You generate concise Japanese learning sentences and output only valid JSON.",
            },
            {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
        ],
    )

    parsed = json.loads(response.output_text)
    sentences = [Sentence.model_validate(sentence) for sentence in parsed["sentences"][: request.count]]
    return [
        _normalize_unknown_tokens(sentence, request.max_level, request.unknown_levels_ahead > 0)
        for sentence in sentences
    ]


def _generate_locally(
    request: GenerateSentencesRequest,
    known_vocabulary: list[VocabularyItem],
    unknown_vocabulary: list[VocabularyItem],
) -> list[Sentence]:
    sentences: list[Sentence] = []
    known = _sample_vocabulary(known_vocabulary, max(request.count * 3, 3))
    unknown = _sample_vocabulary(unknown_vocabulary, request.count) if request.unknown_levels_ahead > 0 else []

    for index in range(request.count):
        first = known[(index * 3) % len(known)]
        second = known[(index * 3 + 1) % len(known)]
        extra = known[(index * 3 + 2) % len(known)]
        unknown_item = unknown[index % len(unknown)] if unknown else None
        final_item = unknown_item or extra
        level = max(first.wk_level, second.wk_level, extra.wk_level, final_item.wk_level)
        tokens = _local_tokens_for_style(
            style=request.sentence_style,
            first=first,
            second=second,
            extra=extra,
            final_item=final_item,
            max_level=request.max_level,
        )

        sentences.append(
            Sentence(
                id=index + 1,
                title=_local_title(request.sentence_style, index),
                translation=_local_translation(request.sentence_style, first, second, extra, final_item, bool(unknown_item)),
                level=level,
                tokens=tokens,
            )
        )

    return sentences


def _local_translation(
    style: str,
    first: VocabularyItem,
    second: VocabularyItem,
    extra: VocabularyItem,
    final_item: VocabularyItem,
    has_unknown: bool,
) -> str:
    extra = " The final word is new vocabulary." if has_unknown else ""
    if style == "medium":
        return f"{first.meaning} is connected with {second.meaning}, and {final_item.meaning} is also present.{extra}"
    if style == "long":
        return f"{first.meaning} and {second.meaning} appear first. Then {final_item.meaning} appears too.{extra}"
    if style == "story":
        return f"Story beat: {first.meaning} and {second.meaning} set up the scene. Then {final_item.meaning} connects to the next beat.{extra}"
    return f"{first.meaning}, {second.meaning}, and {final_item.meaning} are in the sentence.{extra}"


def _local_title(style: str, index: int) -> str:
    if style == "story":
        return f"Story beat {index + 1}"
    return f"{style.title()} sentence"


def _local_tokens_for_style(
    style: str,
    first: VocabularyItem,
    second: VocabularyItem,
    extra: VocabularyItem,
    final_item: VocabularyItem,
    max_level: int,
) -> list[Token]:
    if style == "medium":
        return [
            _vocabulary_token(first, max_level),
            Token(text="は", reading="は", meaning="topic marker", kind="particle"),
            _vocabulary_token(second, max_level),
            Token(text="と", reading="と", meaning="and; with", kind="particle"),
            _vocabulary_token(final_item, max_level),
            Token(text="を", reading="を", meaning="direct object marker", kind="particle"),
            _vocabulary_token(extra, max_level),
            Token(text="です", reading="です", meaning="is", kind="ending"),
            Token(text="。", kind="ending"),
        ]

    if style == "long":
        return [
            _vocabulary_token(first, max_level),
            Token(text="は", reading="は", meaning="topic marker", kind="particle"),
            _vocabulary_token(second, max_level),
            Token(text="です", reading="です", meaning="is", kind="ending"),
            Token(text="。", kind="ending"),
            _vocabulary_token(final_item, max_level),
            Token(text="も", reading="も", meaning="also", kind="particle"),
            _vocabulary_token(extra, max_level),
            Token(text="です", reading="です", meaning="is", kind="ending"),
            Token(text="。", kind="ending"),
        ]

    if style == "story":
        return [
            _vocabulary_token(first, max_level),
            Token(text="は", reading="は", meaning="topic marker", kind="particle"),
            _vocabulary_token(second, max_level),
            Token(text="です", reading="です", meaning="is", kind="ending"),
            Token(text="。", kind="ending"),
            _vocabulary_token(final_item, max_level),
            Token(text="も", reading="も", meaning="also", kind="particle"),
            _vocabulary_token(extra, max_level),
            Token(text="と", reading="と", meaning="and; with", kind="particle"),
            Token(text="あります", reading="あります", meaning="exists", kind="ending"),
            Token(text="。", kind="ending"),
        ]

    return [
        _vocabulary_token(first, max_level),
        Token(text="は", reading="は", meaning="topic marker", kind="particle"),
        _vocabulary_token(second, max_level),
        Token(text="と", reading="と", meaning="and; with", kind="particle"),
        _vocabulary_token(final_item, max_level),
        Token(text="です", reading="です", meaning="is", kind="ending"),
        Token(text="。", kind="ending"),
    ]


def _normalize_unknown_tokens(sentence: Sentence, max_level: int, include_unknown: bool) -> Sentence:
    normalized_tokens = []
    for token in sentence.tokens:
        if token.kind == "vocabulary" and token.wk_level:
            token.is_unknown = include_unknown and token.wk_level > max_level
        else:
            token.is_unknown = False
        normalized_tokens.append(token)

    sentence.tokens = normalized_tokens
    if normalized_tokens:
        sentence.level = max((token.wk_level or sentence.level) for token in normalized_tokens)
    return sentence


def _sample_vocabulary(vocabulary: list[VocabularyItem], size: int) -> list[VocabularyItem]:
    if len(vocabulary) <= size:
        return vocabulary

    return random.sample(vocabulary, size)


def _vocabulary_token(item: VocabularyItem, max_level: int) -> Token:
    return Token(
        text=item.text,
        reading=item.reading,
        meaning=item.meaning,
        wk_level=item.wk_level,
        is_unknown=item.wk_level > max_level,
        kind="vocabulary",
    )
