"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  Eye,
  Flame,
  GraduationCap,
  Headphones,
  KeyRound,
  Layers3,
  Loader2,
  Lock,
  Medal,
  RefreshCcw,
  ScrollText,
  Search,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";

type Token = {
  text: string;
  reading: string;
  meaning: string;
  wk_level?: number;
  is_unknown?: boolean;
  kind: "vocabulary" | "connector" | "particle" | "ending";
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
  subject_id?: number;
  srs_stage?: number;
  srs_category: SrsCategory;
  item_type: "vocabulary" | "connector";
  examples: string[];
};

type WaniKaniProfile = {
  username: string;
  level: number;
  vocabulary_count: number;
  vocabulary: VocabularyItem[];
};

type RecommendationItem = {
  title: string;
  media_type: string;
  reason: string;
  level_note: string;
  free_resource_url?: string | null;
};

type SentenceStyle = "short" | "medium" | "long" | "story";
type SentenceCache = Partial<Record<SentenceStyle, Sentence[]>>;
type ViewMode = "sentences" | "vocabulary";
type SrsCategory = "connector" | "locked" | "apprentice" | "guru" | "master" | "enlightened" | "burned";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const WANIKANI_KEY_STORAGE_KEY = "wanikani-generator:wanikani-key";
const sentenceCountOptions = [1, 2, 3, 4, 5] as const;
const sentenceStyleOptions: { value: SentenceStyle; label: string }[] = [
  { value: "short", label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "long", label: "Long" },
  { value: "story", label: "Story" },
];
const srsFilters: { value: SrsCategory; label: string; icon: typeof Check }[] = [
  { value: "connector", label: "Connectors", icon: Layers3 },
  { value: "locked", label: "Locked", icon: Lock },
  { value: "apprentice", label: "Apprentice", icon: GraduationCap },
  { value: "guru", label: "Guru", icon: Sparkles },
  { value: "master", label: "Master", icon: Medal },
  { value: "enlightened", label: "Enlightened", icon: ScrollText },
  { value: "burned", label: "Burned", icon: Flame },
];

export default function Home() {
  const [viewMode, setViewMode] = useState<ViewMode>("sentences");
  const [level, setLevel] = useState(12);
  const [sentenceCount, setSentenceCount] = useState<(typeof sentenceCountOptions)[number]>(5);
  const [sentenceStyle, setSentenceStyle] = useState<SentenceStyle>("short");
  const [unknownLevelsAhead, setUnknownLevelsAhead] = useState(0);
  const [sampleSize, setSampleSize] = useState(80);
  const [activeSrsFilters, setActiveSrsFilters] = useState<Set<SrsCategory>>(
    new Set(srsFilters.map((filter) => filter.value)),
  );
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
  const [showReadings, setShowReadings] = useState(true);
  const [revealedTranslations, setRevealedTranslations] = useState<Set<number>>(new Set());
  const [audioState, setAudioState] = useState<"idle" | "speaking">("idle");
  const [waniKaniKey, setWaniKaniKey] = useState("");
  const [profile, setProfile] = useState<WaniKaniProfile | null>(null);
  const [sentencesByStyle, setSentencesByStyle] = useState<SentenceCache>({});
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [message, setMessage] = useState("Load WaniKani first, then generate AI sentences.");
  const sentences = sentencesByStyle[sentenceStyle] ?? [];

  const availableVocabulary = useMemo(() => {
    if (!profile) {
      return [];
    }

    return profile.vocabulary.filter((item) => item.wk_level <= level + unknownLevelsAhead || item.item_type === "connector");
  }, [level, profile, unknownLevelsAhead]);

  const visibleVocabulary = useMemo(() => {
    const filtered = availableVocabulary.filter((item) => activeSrsFilters.has(item.srs_category));
    const connectors = filtered.filter((item) => item.item_type === "connector");
    const words = filtered.filter((item) => item.item_type !== "connector").slice(0, sampleSize);
    return [...connectors, ...words];
  }, [activeSrsFilters, availableVocabulary, sampleSize]);

  const selectedVocabulary = useMemo(() => {
    return availableVocabulary.filter((item) => selectedWords.has(item.text));
  }, [availableVocabulary, selectedWords]);

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
    setMessage("Fetching your WaniKani level, vocabulary, SRS stages, and examples...");

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
      setSampleSize(Math.min(120, Math.max(30, body.vocabulary_count)));
      setSelectedWords(new Set(body.vocabulary.map((item) => item.text)));
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

    if (selectedVocabulary.length === 0) {
      setStatus("error");
      setMessage("Select at least one vocabulary item first.");
      return;
    }

    setStatus("loading");
    setMessage("Generating Japanese sentences with selected vocabulary...");
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
          vocabulary: selectedVocabulary,
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
      setViewMode("sentences");
      setStatus("ready");
      setMessage(body.used_ai ? "Generated with OpenAI." : "Generated with the local fallback generator.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not generate sentences.");
    }
  }

  async function getRecommendations() {
    if (!profile || selectedVocabulary.length === 0) {
      setStatus("error");
      setMessage("Load WaniKani and select vocabulary before requesting recommendations.");
      return;
    }

    setStatus("loading");
    setMessage("Finding media recommendations for the selected vocabulary...");

    try {
      const response = await fetch(`${API_BASE_URL}/api/recommendations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_level: level,
          vocabulary: selectedVocabulary,
        }),
      });

      if (!response.ok) {
        throw new Error(await readError(response, "Could not get recommendations."));
      }

      const body = (await response.json()) as { recommendations: RecommendationItem[]; used_ai: boolean };
      setRecommendations(body.recommendations);
      setShowRecommendations(true);
      setStatus("ready");
      setMessage(body.used_ai ? "Recommendations generated with OpenAI." : "Showing curated recommendations.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not get recommendations.");
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

  function toggleSrsFilter(category: SrsCategory) {
    setActiveSrsFilters((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  function toggleWord(text: string) {
    setSelectedWords((current) => {
      const next = new Set(current);
      if (next.has(text)) {
        next.delete(text);
      } else {
        next.add(text);
      }
      return next;
    });
  }

  function selectVisibleWords(selected: boolean) {
    setSelectedWords((current) => {
      const next = new Set(current);
      for (const item of visibleVocabulary) {
        if (selected) {
          next.add(item.text);
        } else {
          next.delete(item.text);
        }
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

          <button className="secondaryButton wideButton" type="button" onClick={getRecommendations}>
            <Search size={18} aria-hidden="true" />
            <span>Recommend Media</span>
          </button>

          <div className="statsGrid">
            <div>
              <span>Selected</span>
              <strong>{selectedVocabulary.length}</strong>
            </div>
            <div>
              <span>Profile</span>
              <strong>{profile?.level ?? "-"}</strong>
            </div>
          </div>
        </aside>

        <section className="practiceSurface" aria-live="polite">
          <div className="viewTabs" role="tablist" aria-label="Practice views">
            <button
              className={viewMode === "sentences" ? "selected" : ""}
              type="button"
              onClick={() => setViewMode("sentences")}
            >
              Sentences
            </button>
            <button
              className={viewMode === "vocabulary" ? "selected" : ""}
              type="button"
              onClick={() => setViewMode("vocabulary")}
            >
              Vocabulary
            </button>
          </div>

          {viewMode === "vocabulary" ? (
            <VocabularyView
              activeSrsFilters={activeSrsFilters}
              sampleSize={sampleSize}
              selectedWords={selectedWords}
              vocabulary={visibleVocabulary}
              totalVocabulary={availableVocabulary.length}
              onSampleSizeChange={setSampleSize}
              onSelectVisible={selectVisibleWords}
              onToggleSrsFilter={toggleSrsFilter}
              onToggleWord={toggleWord}
            />
          ) : (
            <SentenceView
              audioState={audioState}
              level={level}
              profile={profile}
              revealedTranslations={revealedTranslations}
              sentences={sentences}
              showReadings={showReadings}
              showUnknownWords={unknownLevelsAhead > 0}
              onGenerate={generateSentences}
              onSpeakSentence={speakSentence}
              onSpeakText={speakText}
              onToggleTranslation={toggleSentenceTranslation}
            />
          )}
        </section>
      </section>

      {showRecommendations ? (
        <RecommendationsModal recommendations={recommendations} onClose={() => setShowRecommendations(false)} />
      ) : null}
    </main>
  );
}

function VocabularyView({
  activeSrsFilters,
  sampleSize,
  selectedWords,
  vocabulary,
  totalVocabulary,
  onSampleSizeChange,
  onSelectVisible,
  onToggleSrsFilter,
  onToggleWord,
}: {
  activeSrsFilters: Set<SrsCategory>;
  sampleSize: number;
  selectedWords: Set<string>;
  vocabulary: VocabularyItem[];
  totalVocabulary: number;
  onSampleSizeChange: (size: number) => void;
  onSelectVisible: (selected: boolean) => void;
  onToggleSrsFilter: (category: SrsCategory) => void;
  onToggleWord: (text: string) => void;
}) {
  return (
    <div className="vocabularyView">
      <div className="sentenceToolbar">
        <div>
          <span className="eyebrow">Vocabulary selection</span>
          <h2>Words for generation</h2>
        </div>
        <div className="toolbarActions">
          <button className="secondaryButton compact" type="button" onClick={() => onSelectVisible(true)}>
            <Check size={16} aria-hidden="true" />
            <span>Select visible</span>
          </button>
          <button className="secondaryButton compact" type="button" onClick={() => onSelectVisible(false)}>
            <X size={16} aria-hidden="true" />
            <span>Clear visible</span>
          </button>
        </div>
      </div>

      <div className="srsFilterBar" aria-label="SRS filters">
        {srsFilters.map((filter) => {
          const Icon = filter.icon;
          return (
            <button
              className={`${filter.value} ${activeSrsFilters.has(filter.value) ? "selected" : ""}`}
              key={filter.value}
              type="button"
              onClick={() => onToggleSrsFilter(filter.value)}
            >
              <Icon size={15} aria-hidden="true" />
              <span>{filter.label}</span>
            </button>
          );
        })}
      </div>

      <div className="sampleControl">
        <div className="controlLabel">
          <SlidersHorizontal size={16} aria-hidden="true" />
          <span>Sample words kept</span>
          <strong>{sampleSize}</strong>
        </div>
        <input
          aria-label="Sample words kept"
          type="range"
          min="10"
          max={Math.max(10, totalVocabulary)}
          step="5"
          value={Math.min(sampleSize, Math.max(10, totalVocabulary))}
          onChange={(event) => onSampleSizeChange(Number(event.target.value))}
        />
      </div>

      <div className="vocabularyGrid">
        {vocabulary.map((item) => (
          <button
            className={`vocabularyCard ${item.srs_category} ${selectedWords.has(item.text) ? "selected" : ""}`}
            key={`${item.item_type}-${item.text}`}
            type="button"
            onClick={() => onToggleWord(item.text)}
          >
            <span className="checkMark">{selectedWords.has(item.text) ? "✓" : ""}</span>
            <span className="vocabText">{item.text}</span>
            <span className="vocabReading">{item.reading}</span>
            <strong>{item.meaning}</strong>
            <em>{item.item_type === "connector" ? "Connector" : `WK ${item.wk_level} · ${item.srs_category}`}</em>
            {item.examples.length > 0 ? <small>{item.examples[0]}</small> : <small>No WaniKani example sentence.</small>}
          </button>
        ))}
      </div>
    </div>
  );
}

function SentenceView({
  audioState,
  level,
  profile,
  revealedTranslations,
  sentences,
  showReadings,
  showUnknownWords,
  onGenerate,
  onSpeakSentence,
  onSpeakText,
  onToggleTranslation,
}: {
  audioState: "idle" | "speaking";
  level: number;
  profile: WaniKaniProfile | null;
  revealedTranslations: Set<number>;
  sentences: Sentence[];
  showReadings: boolean;
  showUnknownWords: boolean;
  onGenerate: () => void;
  onSpeakSentence: (sentence: Sentence) => void;
  onSpeakText: (text: string) => void;
  onToggleTranslation: (sentenceId: number) => void;
}) {
  if (sentences.length === 0) {
    return (
      <div className="emptyState">
        <h2>No sentences yet</h2>
        <p>Load WaniKani, choose selected vocabulary, and generate a set.</p>
      </div>
    );
  }

  return (
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
          onClick={onGenerate}
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
            showUnknownWords={showUnknownWords}
            isTranslationRevealed={revealedTranslations.has(sentence.id)}
            level={level}
            sentence={sentence}
            showReadings={showReadings}
            onSpeakSentence={onSpeakSentence}
            onSpeakText={onSpeakText}
            onToggleTranslation={onToggleTranslation}
          />
        ))}
      </div>
    </>
  );
}

function RecommendationsModal({
  recommendations,
  onClose,
}: {
  recommendations: RecommendationItem[];
  onClose: () => void;
}) {
  return (
    <div className="modalBackdrop" role="presentation">
      <section className="recommendationModal" role="dialog" aria-modal="true" aria-label="Recommended media">
        <div className="sentenceToolbar">
          <div>
            <span className="eyebrow">Recommendations</span>
            <h2>What to read or watch next</h2>
          </div>
          <button className="iconButton" type="button" onClick={onClose} aria-label="Close recommendations">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="recommendationList">
          {recommendations.map((item) => (
            <article className="recommendationCard" key={`${item.media_type}-${item.title}`}>
              <span>{item.media_type}</span>
              <h3>{item.title}</h3>
              <p>{item.reason}</p>
              <em>{item.level_note}</em>
              {item.free_resource_url ? (
                <a href={item.free_resource_url} target="_blank" rel="noreferrer">
                  Free resource
                </a>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
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
