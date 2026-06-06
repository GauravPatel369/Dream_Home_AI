import React, { useState, useRef, useCallback } from "react";
import { QUIZ_QUESTIONS, MOCK_LISTINGS } from "./data/quizData";
import {
  generateHomeImages,
  generateSingleImage,
  buildImagePrompts,
  getArchetype,
  getMatchedListings,
  getFallbackImage,
  buildSnaphomzUrl,
} from "./utils/imageGen";
import html2canvas from "html2canvas";
import "./App.css";

const STEPS = { INTRO: "intro", QUIZ: "quiz", RESULTS: "results" };
const ROOMS = ["exterior", "bedroom", "kitchen", "workspace"];
const ROOM_LABELS = { exterior: "Exterior", bedroom: "Bedroom", kitchen: "Kitchen", workspace: "Workspace" };
const ROOM_ICONS = { exterior: "🏠", bedroom: "🛏️", kitchen: "🍳", workspace: "💻" };

export default function App() {
  const [step, setStep] = useState(STEPS.INTRO);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  // Keep an editable copy of questions so users can add options/questions at runtime
  const [questions, setQuestions] = useState(QUIZ_QUESTIONS);
  const [images, setImages] = useState({});
  const [archetype, setArchetype] = useState(null);
  const [listings, setListings] = useState([]);
  const [activeRoom, setActiveRoom] = useState("exterior");
  const [apiStatus, setApiStatus] = useState({ ok: true, message: null, code: null });
  const [shareSuccess, setShareSuccess] = useState(false);
  const [regenerating, setRegenerating] = useState(null);
  // Enhancement 4: track which rooms are still loading
  const [loadingRooms, setLoadingRooms] = useState({});
  const shareCardRef = useRef(null);
  // track latest generation id per room to avoid stale async overwrites
  const latestRoomGen = useRef({});

  const handleStart = () => {
    setStep(STEPS.QUIZ);
    setCurrentQ(0);
    setAnswers({});
  };

  const handleAnswer = useCallback(async (questionId, optionId) => {
    const newAnswers = { ...answers, [questionId]: optionId };
    setAnswers(newAnswers);

    if (currentQ < questions.length - 1) {
      setTimeout(() => setCurrentQ((q) => q + 1), 300);
    } else {
      // Enhancement 4: go to results immediately, show skeletons
      const arch = getArchetype(newAnswers);
      setArchetype(arch);
      const matched = getMatchedListings(newAnswers, MOCK_LISTINGS);
      setListings(matched);

      // Mark all rooms as loading
      const loading = {};
      ROOMS.forEach((r) => (loading[r] = true));
      setLoadingRooms(loading);
      setImages({});
      setStep(STEPS.RESULTS);

      // Enhancement 4: stream results — each room updates UI as it finishes
      const batchId = Date.now();
      // record batch id for every room so we can ignore stale results
      ROOMS.forEach((r) => (latestRoomGen.current[r] = batchId));
      console.debug("generateHomeImages batch start", { batchId, answers: newAnswers });
      await generateHomeImages(newAnswers, (room, result) => {
        console.debug("generateHomeImages callback", { batchId, room, result });
        // ignore if a newer generation was started for this room
        if (latestRoomGen.current[room] !== batchId) {
          console.debug("Stale initial result ignored", { room, batchId, current: latestRoomGen.current[room] });
          return;
        }
        setImages((prev) => ({ ...prev, [room]: result }));
        setLoadingRooms((prev) => ({ ...prev, [room]: false }));

        // Surface API errors to the UI so user knows we're using fallbacks
        if (result?.status === "unauthorized") {
          setApiStatus({ ok: false, message: "Image API unauthorized or API key missing. Showing fallback images.", code: "unauthorized" });
        } else if (result?.status === "quota") {
          setApiStatus({ ok: false, message: "Image API quota exceeded. Showing fallback images.", code: "quota" });
        }

        // Auto-switch to first completed room
        setActiveRoom((current) => {
          if (current === "exterior" && room !== "exterior") return current;
          return room;
        });
      });
    }
  }, [answers, currentQ]);

  // Allow adding a custom option to the current question at runtime
  const handleAddOption = (label, emoji = "", desc = "") => {
    const q = questions[currentQ];
    const newOpt = { id: `${q.id}-custom-${Date.now()}`, label, emoji, desc };
    const updated = questions.map((item, idx) => (idx === currentQ ? { ...item, options: [...item.options, newOpt] } : item));
    setQuestions(updated);
  };

  // Allow adding an entirely new question (minimal fields)
  const handleAddQuestion = (questionText, subtitle = "", firstOptionLabel = "Custom") => {
    const newQ = {
      id: `q_custom_${Date.now()}`,
      question: questionText,
      subtitle,
      options: [{ id: `opt_${Date.now()}`, label: firstOptionLabel, emoji: "", desc: "User added" }],
    };
    setQuestions((prev) => [...prev, newQ]);
  };

  const handleBack = () => {
    if (currentQ > 0) setCurrentQ((q) => q - 1);
    else setStep(STEPS.INTRO);
  };

  const handleRetake = () => {
    setStep(STEPS.INTRO);
    setCurrentQ(0);
    setAnswers({});
    setImages({});
    setArchetype(null);
    setListings([]);
    setLoadingRooms({});
    setRegenerating(null);
  };

  // Enhancement 5: per-room regeneration
  const handleRegenerate = async (room, promptOverride) => {
    if (regenerating) return;
    setRegenerating(room);
    // mark this room as loading (shows skeleton)
    setLoadingRooms((prev) => ({ ...prev, [room]: true }));

    // create a unique id for this regeneration and record it so older async
    // results (from the initial batch) won't overwrite this newer result
    const myId = Date.now();
    latestRoomGen.current[room] = myId;

    console.debug("handleRegenerate start", { room, myId, promptOverride });

    const prompts = buildImagePrompts(answers);
    const promptToUse = promptOverride || prompts?.[room] || "";

    // optimistic UI: mark status generating
    setImages((prev) => ({
      ...prev,
      [room]: { ...(prev[room] || {}), status: "generating", prompt: promptToUse },
    }));

    try {
      const result = await generateSingleImage(promptToUse, room, answers.style);
      console.debug("handleRegenerate result", { room, myId, status: result?.status });
      // if the image API returned an error-like status, reflect in apiStatus
      if (result?.status === "unauthorized") {
        setApiStatus({ ok: false, message: "Image API unauthorized or API key missing. Showing fallback images.", code: "unauthorized" });
      } else if (result?.status === "quota") {
        setApiStatus({ ok: false, message: "Image API quota exceeded. Showing fallback images.", code: "quota" });
      }
      setImages((prev) => ({
        ...prev,
        [room]: { placeholder: result.url, prompt: result.prompt || promptToUse, status: result.status },
      }));
    } catch (err) {
      console.error("Regeneration failed:", err?.message || err);
      const fallbackUrl = getFallbackImage(room, answers.style);
      setImages((prev) => ({
        ...prev,
        [room]: { placeholder: fallbackUrl, prompt: promptToUse, status: "fallback", error: err?.message || String(err) },
      }));
    } finally {
      // only clear loading if this regeneration is still the latest
      if (latestRoomGen.current[room] === myId) {
        setLoadingRooms((prev) => ({ ...prev, [room]: false }));
      }
      setRegenerating(null);
    }
  };

  // Allow user to provide a custom prompt per room and generate from it
  const [customPrompts, setCustomPrompts] = useState({});

  // Enhancement 2 + 3: Web Share API with native sheet on mobile, download on desktop
  const handleShare = async () => {
    if (!shareCardRef.current) return;
    try {
      const canvas = await html2canvas(shareCardRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: archetype?.color || "#1a1a2e",
        logging: false,
      });

      const filename = `dream-home-${archetype?.name?.toLowerCase().replace(/\s+/g, "-") || "card"}.png`;

      canvas.toBlob(async (blob) => {
        const file = new File([blob], filename, { type: "image/png" });

        // Enhancement 2: try native Web Share API first (mobile)
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: `I'm ${archetype?.name}`,
              text: `"${archetype?.tagline}" — Find your dream home on Snaphomz`,
              files: [file],
            });
            setShareSuccess(true);
            setTimeout(() => setShareSuccess(false), 2500);
            return;
          } catch (shareErr) {
            if (shareErr.name === "AbortError") return; // user cancelled
          }
        }

        // Fallback: download on desktop
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = filename;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
        setShareSuccess(true);
        setTimeout(() => setShareSuccess(false), 2500);
      }, "image/png");
    } catch (err) {
      console.error("Share failed:", err);
    }
  };

  // Enhancement 3: build smart Snaphomz URL
  const snaphomzUrl = archetype ? buildSnaphomzUrl(answers, archetype) : "https://snaphomz.com/";

  const isRoomLoading = (room) => loadingRooms[room] === true;
  const allRoomsLoaded = ROOMS.every((r) => !loadingRooms[r]);

  return (
    <div className="app">
      {!apiStatus.ok && (
        <div className="api-alert-top" role="alert" style={{ textAlign: "center", padding: "8px 12px", background: "#3b2f1b", color: "#ffdca8" }}>
          {apiStatus.message} {apiStatus.code ? `(${apiStatus.code})` : null}
        </div>
      )}
      {step === STEPS.INTRO && <IntroScreen onStart={handleStart} />}

      {step === STEPS.QUIZ && (
        <QuizScreen
          question={questions[currentQ]}
          questionIndex={currentQ}
          total={questions.length}
          selectedAnswer={answers[questions[currentQ].id]}
          onAnswer={(optId) => handleAnswer(questions[currentQ].id, optId)}
          onBack={handleBack}
          onAddOption={handleAddOption}
          onAddQuestion={handleAddQuestion}
        />
      )}

      {step === STEPS.RESULTS && archetype && (
        <div className="results-page">
          {/* Share Card — off-screen, used for export only */}
          <div
            ref={shareCardRef}
            className="share-card-export"
            style={{ background: `linear-gradient(135deg, ${archetype.color} 0%, ${archetype.accent}40 100%)` }}
          >
            <div className="share-card-logo">✦ Dream Home AI</div>
            <div className="share-card-archetype">{archetype.name}</div>
            <div className="share-card-tagline">"{archetype.tagline}"</div>
            <div className="share-card-grid">
              {ROOMS.map((room) => (
                <div key={room} className="share-card-img-wrap">
                  {/* Enhancement 1: base64 images render correctly in html2canvas */}
                  {images[room]?.placeholder && (
                    <img src={images[room].placeholder} alt={ROOM_LABELS[room]} />
                  )}
                  <span className="share-card-room-label">{ROOM_LABELS[room]}</span>
                </div>
              ))}
            </div>
            <div className="share-card-footer">snaphomz.com • Find your dream home</div>
          </div>

          {/* Results Hero */}
          <section className="results-hero" style={{ "--accent": archetype.accent, "--base": archetype.color }}>
            <div className="results-hero-inner">
              <div className="archetype-badge">Your Home Personality</div>
              <h1 className="archetype-name">{archetype.name}</h1>
              <p className="archetype-tagline">"{archetype.tagline}"</p>
              {!apiStatus.ok && (
                <div className="api-alert" role="status">
                  {apiStatus.message}
                </div>
              )}
              {!allRoomsLoaded && (
                <div className="generating-inline">
                  <div className="gen-dots">
                    <span /><span /><span />
                  </div>
                  <span className="gen-inline-label">
                    Generating {ROOMS.filter((r) => loadingRooms[r]).length} room{ROOMS.filter((r) => loadingRooms[r]).length !== 1 ? "s" : ""}...
                  </span>
                </div>
              )}
              <div className="hero-actions">
                <button className="btn-share" onClick={handleShare} disabled={!allRoomsLoaded}>
                  {!allRoomsLoaded ? "⏳ Generating..." : shareSuccess ? "✓ Shared!" : "⬆ Share Card"}
                </button>
                <button className="btn-retake" onClick={handleRetake}>Retake Quiz</button>
              </div>
            </div>
          </section>

          {/* Room Gallery */}
          <section className="gallery-section">
            <div className="section-label">Your Dream Rooms</div>
            <div className="room-tabs">
              {ROOMS.map((room) => (
                <button
                  key={room}
                  className={`room-tab ${activeRoom === room ? "active" : ""} ${isRoomLoading(room) ? "loading" : ""}`}
                  onClick={() => setActiveRoom(room)}
                >
                  <span>{ROOM_ICONS[room]}</span>
                  {ROOM_LABELS[room]}
                  {isRoomLoading(room) && <span className="tab-spinner" />}
                </button>
              ))}
            </div>

            <div className="room-display">
              <div className="room-image-wrap">
                {/* Enhancement 4: skeleton while loading */}
                {isRoomLoading(activeRoom) ? (
                  <div className="room-skeleton">
                    <div className="skeleton-shimmer" />
                    <div className="skeleton-label">
                      <div className="skeleton-spinner" />
                      Generating {ROOM_LABELS[activeRoom]}...
                    </div>
                  </div>
                ) : (
                  <img
                    key={activeRoom + images[activeRoom]?.placeholder}
                    src={images[activeRoom]?.placeholder || ""}
                    alt={`Dream ${ROOM_LABELS[activeRoom]}`}
                    className="room-image"
                  />
                )}
                <div className="room-overlay">
                  <span className="room-overlay-label">{ROOM_ICONS[activeRoom]} {ROOM_LABELS[activeRoom]}</span>
                  <div className="room-overlay-right">
                    <span className="room-ai-badge">
                      {isRoomLoading(activeRoom)
                        ? "⏳ Generating..."
                        : images[activeRoom]?.status === "generated"
                        ? "✦ DALL-E 3"
                        : "Style Reference"}
                    </span>
                    {/* Enhancement 5: regenerate button */}
                    {!isRoomLoading(activeRoom) && (
                      <button
                        className={`btn-regen ${regenerating === activeRoom ? "spinning" : ""}`}
                        onClick={() => handleRegenerate(activeRoom)}
                        disabled={!!regenerating}
                        title="Generate a new version"
                      >
                        ↺
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {(!isRoomLoading(activeRoom)) && (
                <div className="room-prompt-card">
                  <span className="prompt-label">Design Prompt</span>
                  <p className="prompt-text">{images[activeRoom]?.prompt || "(No prompt available)"}</p>
                  <div className="custom-prompt-row">
                    <textarea
                      className="custom-prompt-input"
                      placeholder="Write your own prompt to generate this room..."
                      value={customPrompts[activeRoom] || ""}
                      onChange={(e) => setCustomPrompts((p) => ({ ...p, [activeRoom]: e.target.value }))}
                    />
                  </div>
                  <div className="prompt-actions">
                    <button
                      className="btn-regen-full"
                      onClick={() => handleRegenerate(activeRoom)}
                      disabled={!!regenerating}
                    >
                      {regenerating === activeRoom ? "Generating..." : "↺ Generate New Version"}
                    </button>
                    <button
                      className="btn-use-prompt"
                      onClick={() => handleRegenerate(activeRoom, customPrompts[activeRoom])}
                      disabled={!!regenerating || !customPrompts[activeRoom]}
                    >
                      Use My Prompt
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Listings */}
          <section className="listings-section">
            <div className="section-label">Matched Listings</div>
            <h2 className="section-title">Homes that match your vibe</h2>
            <p className="section-sub">Curated picks that align with your dream home personality</p>
            <div className="listings-grid">
              {listings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  accent={archetype.accent}
                  snaphomzUrl={snaphomzUrl}
                />
              ))}
            </div>
            {/* Enhancement 3: smart URL CTA */}
            <div className="browse-cta">
              <p>See hundreds more {answers.style} homes {answers.location === "city" ? "in the city" : answers.location === "coastal" ? "by the coast" : answers.location === "nature" ? "in the hills" : "in great suburbs"}</p>
              <a href={snaphomzUrl} target="_blank" rel="noopener noreferrer" className="btn-browse">
                Browse Matched Homes on Snaphomz →
              </a>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function IntroScreen({ onStart }) {
  return (
    <div className="intro-page">
      <div className="intro-bg">
        <div className="intro-bg-img" />
        <div className="intro-overlay" />
      </div>
      <div className="intro-content">
        <div className="intro-logo">✦ Dream Home AI</div>
        <h1 className="intro-headline">
          Design Your<br />
          <span className="intro-headline-accent">Dream Home</span>
        </h1>
        <p className="intro-sub">
          Answer 5 questions. Get cinematic AI visuals of your perfect home —
          bedroom, kitchen, exterior, workspace. Then find real listings that match.
        </p>
        <div className="intro-stats">
          <div className="intro-stat"><span>5</span> Questions</div>
          <div className="intro-stat-divider" />
          <div className="intro-stat"><span>4</span> AI Rooms</div>
          <div className="intro-stat-divider" />
          <div className="intro-stat"><span>∞</span> Possibilities</div>
        </div>
        <button className="btn-start" onClick={onStart}>Start Designing →</button>
        <p className="intro-powered">Powered by DALL-E 3 • Free forever • No sign-up needed</p>
      </div>
    </div>
  );
}

function QuizScreen({ question, questionIndex, total, selectedAnswer, onAnswer, onBack, onAddOption, onAddQuestion }) {
  const [showAddOption, setShowAddOption] = useState(false);
  const [optLabel, setOptLabel] = useState("");
  const [optEmoji, setOptEmoji] = useState("");
  const [optDesc, setOptDesc] = useState("");

  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newQText, setNewQText] = useState("");
  const [newQSub, setNewQSub] = useState("");
  const [newQFirst, setNewQFirst] = useState("");

  const submitNewOption = () => {
    if (!optLabel) return;
    onAddOption && onAddOption(optLabel, optEmoji, optDesc);
    setOptLabel(""); setOptEmoji(""); setOptDesc(""); setShowAddOption(false);
  };

  const submitNewQuestion = () => {
    if (!newQText) return;
    onAddQuestion && onAddQuestion(newQText, newQSub, newQFirst || "Custom");
    setNewQText(""); setNewQSub(""); setNewQFirst(""); setShowAddQuestion(false);
  };

  return (
    <div className="quiz-page">
      <div className="quiz-header">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button className="btn-back" onClick={onBack}>← Back</button>
          <div className="inline-add-controls">
            {!showAddOption && (
              <button className="btn-small" onClick={() => setShowAddOption(true)}>+ Add Option</button>
            )}
            {showAddOption && (
              <div className="add-option-form">
                <input className="input-sm" placeholder="Label" value={optLabel} onChange={(e) => setOptLabel(e.target.value)} />
                <input className="input-sm" placeholder="Emoji (optional)" value={optEmoji} onChange={(e) => setOptEmoji(e.target.value)} />
                <input className="input-sm" placeholder="Short description (optional)" value={optDesc} onChange={(e) => setOptDesc(e.target.value)} />
                <button className="btn-small" onClick={submitNewOption}>Add</button>
                <button className="btn-small muted" onClick={() => setShowAddOption(false)}>Cancel</button>
              </div>
            )}

            {!showAddQuestion && (
              <button className="btn-small" onClick={() => setShowAddQuestion(true)}>+ Add Question</button>
            )}
            {showAddQuestion && (
              <div className="add-question-form">
                <input className="input-md" placeholder="Question text" value={newQText} onChange={(e) => setNewQText(e.target.value)} />
                <input className="input-sm" placeholder="Subtitle (optional)" value={newQSub} onChange={(e) => setNewQSub(e.target.value)} />
                <input className="input-sm" placeholder="First option label" value={newQFirst} onChange={(e) => setNewQFirst(e.target.value)} />
                <button className="btn-small" onClick={submitNewQuestion}>Add Question</button>
                <button className="btn-small muted" onClick={() => setShowAddQuestion(false)}>Cancel</button>
              </div>
            )}
          </div>
        </div>
        <div className="quiz-progress-wrap">
          <div className="quiz-progress-bar">
            <div className="quiz-progress-fill" style={{ width: `${((questionIndex + 1) / total) * 100}%` }} />
          </div>
          <span className="quiz-progress-label">{questionIndex + 1} / {total}</span>
        </div>
      </div>
      <div className="quiz-body">
        <div className="question-number">Question {questionIndex + 1}</div>
        <h2 className="question-text">{question.question}</h2>
        <p className="question-sub">{question.subtitle}</p>
        <div className="options-grid">
          {question.options.map((opt) => (
            <button
              key={opt.id}
              className={`option-card ${selectedAnswer === opt.id ? "selected" : ""}`}
              onClick={() => onAnswer(opt.id)}
            >
              <span className="option-emoji">{opt.emoji}</span>
              <span className="option-label">{opt.label}</span>
              <span className="option-desc">{opt.desc}</span>
              {selectedAnswer === opt.id && <span className="option-check">✓</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ListingCard({ listing, accent, snaphomzUrl }) {
  return (
    <div className="listing-card">
      <div className="listing-img-wrap">
        <img src={listing.img} alt={listing.title} className="listing-img" />
        <div className="listing-match" style={{ background: accent }}>{listing.match}% match</div>
        {listing.tag && <div className="listing-tag">{listing.tag}</div>}
      </div>
      <div className="listing-body">
        <h3 className="listing-title">{listing.title}</h3>
        <p className="listing-location">📍 {listing.location}</p>
        <div className="listing-meta">
          <span>🛏 {listing.beds} beds</span>
          <span>🚿 {listing.baths} baths</span>
          <span>📐 {listing.sqft}</span>
        </div>
        <div className="listing-footer">
          <span className="listing-price">{listing.price}</span>
          {/* Enhancement 3: smart URL per listing */}
          <a href={snaphomzUrl} target="_blank" rel="noopener noreferrer" className="btn-view">
            View →
          </a>
        </div>
      </div>
    </div>
  );
}
