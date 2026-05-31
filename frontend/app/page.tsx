"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  Eye,
  Headphones,
  KeyRound,
  Loader2,
  RefreshCcw,
  SlidersHorizontal,
  Volume2,
} from "lucide-react";

type Token = {
  text: string;
  reading: string;
  meaning: string;
  wk_level?: number;
  is_unknown?: boolean;
  kind: "vocabulary" | "particle" | "ending";
};

type Sentence = {
  id: number;
  title: string;
  translation: string;
  level: number;
  tokens: Token[];
};

type VocabularyItem = {
  text: string;
  reading: string;
  meaning: string;
  wk_level: number;
};

type WaniKaniProfile = {
  username: string;
  level: number;
  vocabulary_count: number;
  vocabulary: VocabularyItem[];
};

type SentenceStyle = "short" | "medium" | "long" | "story";
type SentenceCache = Partial<Record<SentenceStyle, Sentence[]>>;

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const WANIKANI_KEY_STORAGE_KEY = "wanikani-generator:wanikani-key";
const sentenceCountOptions = [1, 2, 3, 4, 5] as const;
const sentenceStyleOptions: { value: SentenceStyle; label: string }[] = [
  { value: "short", label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "long", label: "Long" },
  { value: "story", label: "Story" },
];

export default function Home() {
  const [level, setLevel] = useState(12);
  const [sentenceCount, setSentenceCount] = useState<(typeof sentenceCountOptions)[number]>(5);
  const [sentenceStyle, setSentenceStyle] = useState<SentenceStyle>("short");
  const [unknownLevelsAhead, setUnknownLevelsAhead] = useState(0);
  const [showReadings, setShowReadings] = useState(true);
  const [revealedTranslations, setRevealedTranslations] = useState<Set<number>>(new Set());
  const [audioState, setAudioState] = useState<"idle" | "speaking">("idle");
  const [waniKaniKey, setWaniKaniKey] = useState("");
  const [profile, setProfile] = useState<WaniKaniProfile | null>(null);
  const [sentencesByStyle, setSentencesByStyle] = useState<SentenceCache>({});
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [message, setMessage] = useState("Load WaniKani first, then generate AI sentences.");
  const sentences = sentencesByStyle[sentenceStyle] ?? [];

  useEffect(() => {
    const savedKey = window.localStorage.getItem(WANIKANI_KEY_STORAGE_KEY);
    if (savedKey) {
      setWaniKaniKey(savedKey);
    }
  }, []);

  function updateWaniKaniKey(value: string) {
    setWaniKaniKey(value);
    if (value.trim()) {
      window.localStorage.setItem(WANIKANI_KEY_STORAGE_KEY, value);
    } else {
      window.localStorage.removeItem(WANIKANI_KEY_STORAGE_KEY);
    }
  }

  async function loadWaniKani() {
    const apiKey = waniKaniKey.trim();
    if (!apiKey) {
      setStatus("error");
      setMessage("Enter a WaniKani v2 API token first.");
      return;
    }

    setStatus("loading");
    setMessage("Fetching your WaniKani level and vocabulary...");

    try {
      const response = await fetch(`${API_BASE_URL}/api/wanikani/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey }),
      });

      if (!response.ok) {
        throw new Error(await readError(response, "Could not load WaniKani data."));
      }

      const body = (await response.json()) as WaniKaniProfile;
      window.localStorage.setItem(WANIKANI_KEY_STORAGE_KEY, apiKey);
      setProfile(body);
      setLevel(body.level);
      setSentencesByStyle({});
      setRevealedTranslations(new Set());
      setStatus("ready");
      setMessage(`Loaded ${body.vocabulary_count.toLocaleString()} vocabulary items for ${body.username}.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not load WaniKani data.");
    }
  }

  async function generateSentences() {
    if (!profile) {
      setStatus("error");
      setMessage("Load your WaniKani vocabulary before generating sentences.");
      return;
    }

    setStatus("loading");
    setMessage("Generating Japanese sentences with your WaniKani vocabulary...");
    setRevealedTranslations(new Set());

    try {
      const response = await fetch(`${API_BASE_URL}/api/sentences/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count: sentenceCount,
          max_level: level,
          sentence_style: sentenceStyle,
          unknown_levels_ahead: unknownLevelsAhead,
          vocabulary: profile.vocabulary,
        }),
      });

      if (!response.ok) {
        throw new Error(await readError(response, "Could not generate sentences."));
      }

      const body = (await response.json()) as { sentences: Sentence[]; used_ai: boolean };
      setSentencesByStyle((current) => ({
        ...current,
        [sentenceStyle]: body.sentences,
      }));
      setStatus("ready");
      setMessage(body.used_ai ? "Generated with OpenAI." : "Generated with the local fallback generator.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not generate sentences.");
    }
  }

  function toggleSentenceTranslation(sentenceId: number) {
    setRevealedTranslations((current) => {
      const next = new Set(current);
      if (next.has(sentenceId)) {
        next.delete(sentenceId);
      } else {
        next.add(sentenceId);
      }
      return next;
    });
  }

  function speakText(text: string, onDone?: () => void) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.rate = 0.82;
    utterance.onend = () => onDone?.();
    utterance.onerror = () => onDone?.();
    window.speechSynthesis.speak(utterance);
  }

  function speakSentence(sentence: Sentence) {
    setAudioState("speaking");
    speakText(
      sentence.tokens.map((token) => token.text).join(""),
      () => setAudioState("idle"),
    );
  }

  return (
    <main className="appShell">
      <section className="workspace">
        <aside className="controlPanel" aria-label="Sentence controls">
          <div className="brand">
            <span className="brandMark" aria-hidden="true">
              文
            </span>
            <div>
              <h1>WaniKani Sentences</h1>
              <p>AI-generated Japanese practice</p>
            </div>
          </div>

          <div className="controlGroup">
            <label className="fieldLabel" htmlFor="waniKaniKey">
              <KeyRound size={16} aria-hidden="true" />
              WaniKani API token
            </label>
            <input
              id="waniKaniKey"
              className="textInput"
              type="password"
              autoComplete="off"
              value={waniKaniKey}
              onChange={(event) => updateWaniKaniKey(event.target.value)}
              placeholder="v2 token"
            />
            <button className="secondaryButton" type="button" onClick={loadWaniKani}>
              {status === "loading" ? <Loader2 className="spin" size={17} /> : <KeyRound size={17} />}
              <span>Load WaniKani</span>
            </button>
            <p className={`statusText ${status}`}>{message}</p>
          </div>

          <div className="controlGroup">
            <div className="controlLabel">
              <SlidersHorizontal size={16} aria-hidden="true" />
              <span>Max WaniKani level</span>
              <strong>{level}</strong>
            </div>
            <input
              aria-label="Maximum WaniKani level"
              type="range"
              min="1"
              max={profile?.level ?? 60}
              value={level}
              onChange={(event) => setLevel(Number(event.target.value))}
            />
          </div>

          <div className="controlGroup">
            <span className="fieldLabel">Sentence level</span>
            <div className="segmentedControl" role="radiogroup" aria-label="Sentence level">
              {sentenceStyleOptions.map((option) => (
                <button
                  className={sentenceStyle === option.value ? "selected" : ""}
                  key={option.value}
                  type="button"
                  onClick={() => setSentenceStyle(option.value)}
                  role="radio"
                  aria-checked={sentenceStyle === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <details className="advancedOptions">
            <summary>Advanced options</summary>
            <div className="controlGroup">
              <div className="controlLabel">
                <SlidersHorizontal size={16} aria-hidden="true" />
                <span>Sentences</span>
                <strong>{sentenceCount}</strong>
              </div>
              <input
                aria-label="Number of sentences"
                type="range"
                min="1"
                max="5"
                step="1"
                value={sentenceCount}
                onChange={(event) =>
                  setSentenceCount(Number(event.target.value) as (typeof sentenceCountOptions)[number])
                }
              />
            </div>

            <div className="controlGroup">
              <div className="controlLabel">
                <SlidersHorizontal size={16} aria-hidden="true" />
                <span>Unknown levels ahead</span>
                <strong>{unknownLevelsAhead}</strong>
              </div>
              <input
                aria-label="Unknown WaniKani levels ahead"
                type="range"
                min="0"
                max="5"
                step="1"
                value={unknownLevelsAhead}
                onChange={(event) => setUnknownLevelsAhead(Number(event.target.value))}
              />
            </div>
          </details>

          <label className="toggleRow">
            <input
              checked={showReadings}
              type="checkbox"
              onChange={(event) => setShowReadings(event.target.checked)}
            />
            <span>Show furigana inline</span>
          </label>

          <button className="primaryButton wideButton" type="button" onClick={generateSentences}>
            <RefreshCcw size={18} aria-hidden="true" />
            <span>Generate</span>
          </button>

          <div className="statsGrid">
            <div>
              <span>Vocabulary</span>
              <strong>{profile?.vocabulary_count ?? 0}</strong>
            </div>
            <div>
              <span>Profile</span>
              <strong>{profile?.level ?? "-"}</strong>
            </div>
          </div>
        </aside>

        <section className="practiceSurface" aria-live="polite">
          {sentences.length > 0 ? (
            <>
              <div className="sentenceToolbar">
                <div>
                  <span className="eyebrow">
                    {profile ? `${profile.username} · level ${profile.level}` : "No profile loaded"}
                  </span>
                  <h2>Generated sentences</h2>
                </div>
                <button
                  className="iconButton"
                  type="button"
                  onClick={generateSentences}
                  aria-label="Generate another sentence set"
                  title="Generate another sentence set"
                >
                  <RefreshCcw size={19} aria-hidden="true" />
                </button>
              </div>

              <div className="sentenceStack">
                {sentences.map((sentence) => (
                  <SentenceBlock
                    key={sentence.id}
                    audioState={audioState}
                    showUnknownWords={unknownLevelsAhead > 0}
                    isTranslationRevealed={revealedTranslations.has(sentence.id)}
                    level={level}
                    sentence={sentence}
                    showReadings={showReadings}
                    onSpeakSentence={speakSentence}
                    onSpeakText={speakText}
                    onToggleTranslation={toggleSentenceTranslation}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="emptyState">
              <h2>No sentences yet</h2>
              <p>Load your WaniKani vocabulary, choose the settings, and generate a set.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function SentenceBlock({
  audioState,
  showUnknownWords,
  isTranslationRevealed,
  level,
  sentence,
  showReadings,
  onSpeakSentence,
  onSpeakText,
  onToggleTranslation,
}: {
  audioState: "idle" | "speaking";
  showUnknownWords: boolean;
  isTranslationRevealed: boolean;
  level: number;
  sentence: Sentence;
  showReadings: boolean;
  onSpeakSentence: (sentence: Sentence) => void;
  onSpeakText: (text: string) => void;
  onToggleTranslation: (sentenceId: number) => void;
}) {
  const unknownTokens = showUnknownWords
    ? sentence.tokens.filter((token) => token.kind === "vocabulary" && token.is_unknown)
    : [];

  return (
    <article className="sentenceBlock">
      <div className="sentenceBlockHeader">
        <span>Level {sentence.level}</span>
        <div className="toolbarActions">
          <button
            className="secondaryButton compact"
            type="button"
            onClick={() => onToggleTranslation(sentence.id)}
          >
            <Eye size={16} aria-hidden="true" />
            <span>{isTranslationRevealed ? "Hide meaning" : "Show meaning"}</span>
          </button>
          <button className="primaryButton compact" type="button" onClick={() => onSpeakSentence(sentence)}>
            {audioState === "speaking" ? (
              <Headphones size={17} aria-hidden="true" />
            ) : (
              <Volume2 size={17} aria-hidden="true" />
            )}
            <span>Listen</span>
          </button>
        </div>
      </div>

      <div className="sentenceReader" lang="ja">
        {sentence.tokens.map((token, index) => (
          <WordToken
            key={`${sentence.id}-${token.text}-${index}`}
            token={token}
            showReading={showReadings}
            isOutsideWaniKaniLevel={isOutsideWaniKaniLevel(token, level)}
            onSpeak={onSpeakText}
          />
        ))}
      </div>

      <div className="translationRow">
        <BookOpen size={18} aria-hidden="true" />
        {isTranslationRevealed ? (
          <span>{sentence.translation}</span>
        ) : (
          <span className="mutedText">Sentence meaning hidden</span>
        )}
      </div>

      {unknownTokens.length > 0 ? (
        <div className="tokenList" aria-label="Unknown vocabulary in this sentence">
          {unknownTokens.map((token, index) => (
            <div className="tokenCard unknownCard outsideLevel" key={`${sentence.id}-${token.text}-card-${index}`}>
              <span>{token.text}</span>
              <strong className="hiddenMeaning">Hidden until hover</strong>
              <strong className="revealedMeaning">{token.meaning}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function WordToken({
  token,
  showReading,
  isOutsideWaniKaniLevel,
  onSpeak,
}: {
  token: Token;
  showReading: boolean;
  isOutsideWaniKaniLevel: boolean;
  onSpeak: (text: string) => void;
}) {
  const canInspect = token.kind !== "ending";

  if (!canInspect) {
    return <span className="punctuation">{token.text}</span>;
  }

  return (
    <span className={`wordToken ${token.kind} ${isOutsideWaniKaniLevel ? "outsideLevel" : ""}`} tabIndex={0}>
      <ruby>
        {token.text}
        {showReading && token.reading ? <rt>{token.reading}</rt> : null}
      </ruby>
      <span className="wordPopover" role="tooltip">
        <button
          className="wordListenButton"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSpeak(token.text);
          }}
          aria-label={`Listen to ${token.text}`}
          title={`Listen to ${token.text}`}
        >
          <Volume2 size={14} aria-hidden="true" />
        </button>
        <strong>{token.meaning}</strong>
        {token.reading ? <span>{token.reading}</span> : null}
        {token.wk_level ? <em>WK level {token.wk_level}</em> : <em>{token.kind}</em>}
        {isOutsideWaniKaniLevel ? <b>Outside selected WaniKani level</b> : null}
      </span>
    </span>
  );
}

function isOutsideWaniKaniLevel(token: Token, level: number) {
  return token.kind === "vocabulary" && typeof token.wk_level === "number" && token.wk_level > level;
}

async function readError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { detail?: string };
    return body.detail ?? fallback;
  } catch {
    return fallback;
  }
}
