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
  const [images, setImages] = useState({});
  const [archetype, setArchetype] = useState(null);
  const [listings, setListings] = useState([]);
  const [activeRoom, setActiveRoom] = useState("exterior");
  const [shareSuccess, setShareSuccess] = useState(false);
  const [regenerating, setRegenerating] = useState(null);
  // Enhancement 4: track which rooms are still loading
  const [loadingRooms, setLoadingRooms] = useState({});
  const shareCardRef = useRef(null);

  const handleStart = () => {
    setStep(STEPS.QUIZ);
    setCurrentQ(0);
    setAnswers({});
  };

  const handleAnswer = useCallback(async (questionId, optionId) => {
    const newAnswers = { ...answers, [questionId]: optionId };
    setAnswers(newAnswers);

    if (currentQ < QUIZ_QUESTIONS.length - 1) {
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
      await generateHomeImages(newAnswers, (room, result) => {
        setImages((prev) => ({ ...prev, [room]: result }));
        setLoadingRooms((prev) => ({ ...prev, [room]: false }));
        // Auto-switch to first completed room
        setActiveRoom((current) => {
          if (current === "exterior" && room !== "exterior") return current;
          return room;
        });
      });
    }
  }, [answers, currentQ]);

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
  const handleRegenerate = async (room) => {
    if (regenerating) return;
    setRegenerating(room);
    try {
      const prompts = buildImagePrompts(answers);
      const result = await generateSingleImage(prompts[room], room, answers.style);
      setImages((prev) => ({
        ...prev,
        [room]: { placeholder: result.url, prompt: result.prompt, status: result.status },
      }));
    } catch (err) {
      console.error("Regeneration failed:", err.message);
    } finally {
      setRegenerating(null);
    }
  };

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
      {step === STEPS.INTRO && <IntroScreen onStart={handleStart} />}

      {step === STEPS.QUIZ && (
        <QuizScreen
          question={QUIZ_QUESTIONS[currentQ]}
          questionIndex={currentQ}
          total={QUIZ_QUESTIONS.length}
          selectedAnswer={answers[QUIZ_QUESTIONS[currentQ].id]}
          onAnswer={(optId) => handleAnswer(QUIZ_QUESTIONS[currentQ].id, optId)}
          onBack={handleBack}
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

              {images[activeRoom]?.prompt && !isRoomLoading(activeRoom) && (
                <div className="room-prompt-card">
                  <span className="prompt-label">Design Prompt</span>
                  <p className="prompt-text">{images[activeRoom].prompt}</p>
                  <button
                    className="btn-regen-full"
                    onClick={() => handleRegenerate(activeRoom)}
                    disabled={!!regenerating}
                  >
                    {regenerating === activeRoom ? "Generating..." : "↺ Generate New Version"}
                  </button>
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

function QuizScreen({ question, questionIndex, total, selectedAnswer, onAnswer, onBack }) {
  return (
    <div className="quiz-page">
      <div className="quiz-header">
        <button className="btn-back" onClick={onBack}>← Back</button>
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
