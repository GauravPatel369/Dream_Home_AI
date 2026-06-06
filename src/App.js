import React, { useState, useRef, useCallback } from "react";
import { QUIZ_QUESTIONS, MOCK_LISTINGS } from "./data/quizData";
import { generateHomeImages, getArchetype, getMatchedListings, getFallbackImage } from "./utils/imageGen";
import html2canvas from "html2canvas";
import "./App.css";

const STEPS = { INTRO: "intro", QUIZ: "quiz", GENERATING: "generating", RESULTS: "results" };

export default function App() {
  const [step, setStep] = useState(STEPS.INTRO);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [images, setImages] = useState({});
  const [archetype, setArchetype] = useState(null);
  const [listings, setListings] = useState([]);
  const [generatingStatus, setGeneratingStatus] = useState("");
  const [activeRoom, setActiveRoom] = useState("exterior");
  const [shareSuccess, setShareSuccess] = useState(false);
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
      setStep(STEPS.GENERATING);
      const arch = getArchetype(newAnswers);
      setArchetype(arch);

      const statuses = [
        "Analysing your lifestyle DNA...",
        "Generating your exterior with DALL-E 3...",
        "Rendering your bedroom sanctuary...",
        "Crafting your perfect kitchen...",
        "Building your dream workspace...",
        "Matching listings to your vibe...",
      ];

      let i = 0;
      const interval = setInterval(() => {
        setGeneratingStatus(statuses[i % statuses.length]);
        i++;
      }, 1200);

      try {
        const imgs = await generateHomeImages(newAnswers);
        clearInterval(interval);
        setImages(imgs);
        const matched = getMatchedListings(newAnswers, MOCK_LISTINGS);
        setListings(matched);
        setStep(STEPS.RESULTS);
      } catch {
        clearInterval(interval);
        const fallbackImgs = {
          bedroom: { placeholder: getFallbackImage("bedroom", newAnswers.style), prompt: "Master bedroom", status: "fallback" },
          kitchen: { placeholder: getFallbackImage("kitchen", newAnswers.style), prompt: "Kitchen", status: "fallback" },
          exterior: { placeholder: getFallbackImage("exterior", newAnswers.style), prompt: "Home exterior", status: "fallback" },
          workspace: { placeholder: getFallbackImage("workspace", newAnswers.style), prompt: "Workspace", status: "fallback" },
        };
        setImages(fallbackImgs);
        const matched = getMatchedListings(newAnswers, MOCK_LISTINGS);
        setListings(matched);
        setStep(STEPS.RESULTS);
      }
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
  };

  const handleShare = async () => {
    if (!shareCardRef.current) return;
    try {
      const canvas = await html2canvas(shareCardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: archetype?.color || "#1a1a2e",
        logging: false,
      });
      const link = document.createElement("a");
      link.download = `dream-home-${archetype?.name?.toLowerCase().replace(/\s+/g, "-") || "card"}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 2500);
    } catch (err) {
      console.error("Share failed:", err);
    }
  };

  const rooms = ["exterior", "bedroom", "kitchen", "workspace"];
  const roomLabels = { exterior: "Exterior", bedroom: "Bedroom", kitchen: "Kitchen", workspace: "Workspace" };
  const roomIcons = { exterior: "🏠", bedroom: "🛏️", kitchen: "🍳", workspace: "💻" };

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

      {step === STEPS.GENERATING && (
        <GeneratingScreen status={generatingStatus} archetype={archetype} />
      )}

      {step === STEPS.RESULTS && archetype && (
        <div className="results-page">
          {/* Share Card (hidden, used for export) */}
          <div
            ref={shareCardRef}
            className="share-card-export"
            style={{ background: `linear-gradient(135deg, ${archetype.color} 0%, ${archetype.accent}40 100%)` }}
          >
            <div className="share-card-logo">✦ Dream Home AI</div>
            <div className="share-card-archetype">{archetype.name}</div>
            <div className="share-card-tagline">"{archetype.tagline}"</div>
            <div className="share-card-grid">
              {rooms.slice(0, 4).map((room) => (
                <div key={room} className="share-card-img-wrap">
                  <img
                    src={images[room]?.placeholder || ""}
                    alt={roomLabels[room]}
                    crossOrigin="anonymous"
                    onError={(e) => { e.target.style.display = "none"; }}
                  />
                  <span className="share-card-room-label">{roomLabels[room]}</span>
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
              <div className="hero-actions">
                <button className="btn-share" onClick={handleShare}>
                  {shareSuccess ? "✓ Downloaded!" : "⬇ Download Card"}
                </button>
                <button className="btn-retake" onClick={handleRetake}>Retake Quiz</button>
              </div>
            </div>
          </section>

          {/* Room Gallery */}
          <section className="gallery-section">
            <div className="section-label">Your Dream Rooms</div>
            <div className="room-tabs">
              {rooms.map((room) => (
                <button
                  key={room}
                  className={`room-tab ${activeRoom === room ? "active" : ""}`}
                  onClick={() => setActiveRoom(room)}
                >
                  <span>{roomIcons[room]}</span>
                  {roomLabels[room]}
                </button>
              ))}
            </div>
            <div className="room-display">
              <div className="room-image-wrap">
                <img
                  key={activeRoom}
                  src={images[activeRoom]?.placeholder || ""}
                  alt={`Dream ${roomLabels[activeRoom]}`}
                  className="room-image"
                />
                <div className="room-overlay">
                  <span className="room-overlay-label">{roomIcons[activeRoom]} {roomLabels[activeRoom]}</span>
                  <span className="room-ai-badge">
                    {images[activeRoom]?.status === "generated" ? "✦ DALL-E 3 Generated" : "Style Reference"}
                  </span>
                </div>
              </div>
              {images[activeRoom]?.prompt && (
                <div className="room-prompt-card">
                  <span className="prompt-label">Design Prompt</span>
                  <p className="prompt-text">{images[activeRoom].prompt}</p>
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
                <ListingCard key={listing.id} listing={listing} accent={archetype.accent} />
              ))}
            </div>
            <div className="browse-cta">
              <p>See hundreds more homes matched to your style</p>
              <a href="https://snaphomz.com/" target="_blank" rel="noopener noreferrer" className="btn-browse">
                Browse All on Snaphomz →
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
        <button className="btn-start" onClick={onStart}>
          Start Designing →
        </button>
        <p className="intro-powered">Powered by AI • Free forever • No sign-up needed</p>
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
            <div
              className="quiz-progress-fill"
              style={{ width: `${((questionIndex + 1) / total) * 100}%` }}
            />
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

function GeneratingScreen({ status, archetype }) {
  return (
    <div className="generating-page">
      <div className="generating-inner">
        <div className="generating-spinner">
          <div className="spinner-ring" />
          <div className="spinner-ring r2" />
          <div className="spinner-core">✦</div>
        </div>
        {archetype && (
          <div className="generating-archetype">
            <span className="gen-label">Your personality emerging...</span>
            <h2 className="gen-name">{archetype.name}</h2>
          </div>
        )}
        <p className="generating-status">{status}</p>
        <div className="generating-rooms">
          {["🏠 Exterior", "🛏️ Bedroom", "🍳 Kitchen", "💻 Workspace"].map((r, i) => (
            <span key={r} className="gen-room-pill" style={{ animationDelay: `${i * 0.3}s` }}>{r}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ListingCard({ listing, accent }) {
  return (
    <div className="listing-card">
      <div className="listing-img-wrap">
        <img src={listing.img} alt={listing.title} className="listing-img" />
        <div className="listing-match" style={{ background: accent }}>
          {listing.match}% match
        </div>
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
          <a
            href="https://snaphomz.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-view"
          >
            View →
          </a>
        </div>
      </div>
    </div>
  );
}
