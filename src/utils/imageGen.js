export const buildImagePrompts = (answers) => {
  const { vibe, style, location, space, budget } = answers;

  const styleMap = {
    modern: "ultra-modern minimalist",
    scandinavian: "Scandinavian hygge",
    industrial: "urban industrial loft",
    mediterranean: "warm Mediterranean",
  };

  const vibeMap = {
    serene: "serene, calm, soft natural light",
    bold: "dramatic, bold, high-contrast statement",
    cozy: "warm, cozy, layered textures",
    creative: "eclectic, artistic, vibrant",
  };

  const locationMap = {
    city: "with urban skyline views through floor-to-ceiling windows",
    suburban: "with lush garden views and natural daylight",
    nature: "with panoramic mountain and valley views",
    coastal: "with ocean breezes and coastal light",
  };

  const budgetMap = {
    starter: "clean and functional, smart design",
    mid: "comfortable family home, quality materials",
    premium: "premium finishes, designer fixtures",
    luxury: "ultra-luxury, bespoke materials, architectural masterpiece",
  };

  const styleDesc = styleMap[style] || "contemporary";
  const vibeDesc = vibeMap[vibe] || "elegant";
  const locationDesc = locationMap[location] || "";
  const budgetDesc = budgetMap[budget] || "well-appointed";

  return {
    bedroom: `A ${styleDesc} master bedroom, ${vibeDesc} atmosphere, ${budgetDesc} finishes ${locationDesc}. Professional architectural photography, cinematic lighting, 8K quality, photorealistic.`,
    kitchen: `A ${styleDesc} kitchen ${vibeDesc} with ${budgetDesc} appliances and surfaces ${locationDesc}. Open plan, professional architectural interior photography, natural and artificial lighting, photorealistic.`,
    exterior: `A ${styleDesc} home exterior, ${vibeDesc} landscaping, ${budgetDesc} architecture ${locationDesc}. Golden hour lighting, professional real estate photography, photorealistic.`,
    workspace: `A ${styleDesc} home office and creative workspace, ${vibeDesc} setup, ${budgetDesc} furniture and lighting ${locationDesc}. Productivity-focused, natural daylight, professional interior photography.`,
  };
};

// Enhancement 1: Convert image URL to persistent base64 to prevent expiry & fix html2canvas
const urlToBase64 = async (url) => {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return url; // fallback to raw URL if conversion fails
  }
};

export const generateSingleImage = async (prompt, room, style) => {
  const apiKey = process.env.REACT_APP_OPENAI_API_KEY;

  if (!apiKey) {
    console.warn("REACT_APP_OPENAI_API_KEY not set — using fallback images.");
    const fallbackUrl = getFallbackImage(room, style);
    const base64 = await urlToBase64(fallbackUrl);
    return { url: base64, prompt, status: "fallback" };
  }

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      // Use the OpenAI Images API model that is currently supported
      model: "gpt-image-1",
      prompt,
      n: 1,
      // use a supported square size to avoid API errors
      size: "1024x1024",
    }),
  });

  if (!response.ok) {
    // Read body if possible to get message
    const errBody = await response.json().catch(() => ({}));
    const msg = errBody?.error?.message || errBody?.message || `OpenAI API error ${response.status}`;

    // Handle common API failure cases gracefully by returning a fallback image
    if (response.status === 401 || response.status === 403) {
      console.error("OpenAI unauthorized:", msg);
      const fallbackUrl = getFallbackImage(room, style);
      const base64 = await urlToBase64(fallbackUrl).catch(() => fallbackUrl);
      return { url: base64, prompt, status: "unauthorized", error: msg };
    }

    if (response.status === 429) {
      console.error("OpenAI rate limit / quota exceeded:", msg);
      const fallbackUrl = getFallbackImage(room, style);
      const base64 = await urlToBase64(fallbackUrl).catch(() => fallbackUrl);
      return { url: base64, prompt, status: "quota", error: msg };
    }

    // Other errors — throw so callers can handle / fallback as needed
    throw new Error(msg);
  }

  const data = await response.json();
  const entry = data.data?.[0] || {};

  // OpenAI may return either a URL or base64 -- handle both.
  if (entry.url) {
    const base64 = await urlToBase64(entry.url).catch(() => entry.url);
    return { url: base64, prompt, status: "generated" };
  }

  if (entry.b64_json) {
    // data is base64-encoded image bytes
    const dataUrl = `data:image/png;base64,${entry.b64_json}`;
    return { url: dataUrl, prompt, status: "generated" };
  }

  throw new Error("No image returned from DALL-E response");
};

// Enhancement 4: Stream results — calls onRoomReady(room, result) as each room completes
export const generateHomeImages = async (answers, onRoomReady) => {
  const prompts = buildImagePrompts(answers);
  const rooms = ["exterior", "bedroom", "kitchen", "workspace"];
  const imageResults = {};

  for (const room of rooms) {
    try {
      const result = await generateSingleImage(prompts[room], room, answers.style);
      imageResults[room] = {
        placeholder: result.url,
        prompt: result.prompt,
        status: result.status,
      };
    } catch (err) {
      console.error(`Generation failed for ${room}:`, err.message);
      const fallbackUrl = getFallbackImage(room, answers.style);
      const base64 = await urlToBase64(fallbackUrl);
      imageResults[room] = {
        placeholder: base64,
        prompt: prompts[room],
        status: "fallback",
        error: err.message,
      };
    }
    // Notify parent immediately so UI updates per room
    if (onRoomReady) onRoomReady(room, imageResults[room]);
  }

  return imageResults;
};

const FALLBACK_IMAGES = {
  bedroom: {
    modern: "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80",
    scandinavian: "https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=800&q=80",
    industrial: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=800&q=80",
    mediterranean: "https://images.unsplash.com/photo-1540518614846-7eded433c457?w=800&q=80",
    default: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=800&q=80",
  },
  kitchen: {
    modern: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80",
    scandinavian: "https://images.unsplash.com/photo-1556909172-54557c7e4fb7?w=800&q=80",
    industrial: "https://images.unsplash.com/photo-1565538810643-b5bdb714032a?w=800&q=80",
    mediterranean: "https://images.unsplash.com/photo-1600489000022-c2086d79f9d4?w=800&q=80",
    default: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80",
  },
  exterior: {
    modern: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80",
    scandinavian: "https://images.unsplash.com/photo-1449844908441-8829872d2607?w=800&q=80",
    industrial: "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=800&q=80",
    mediterranean: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80",
    default: "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=800&q=80",
  },
  workspace: {
    modern: "https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=800&q=80",
    scandinavian: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80",
    industrial: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80",
    mediterranean: "https://images.unsplash.com/photo-1600210492493-0946911123ea?w=800&q=80",
    default: "https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=800&q=80",
  },
};

export const getFallbackImage = (room, style) => {
  return FALLBACK_IMAGES[room]?.[style] || FALLBACK_IMAGES[room]?.default || "";
};

export const getArchetype = (answers) => {
  const { vibe, style } = answers;
  const archetypes = {
    "serene-modern": { name: "The Zen Modernist", tagline: "Stillness engineered into every corner", color: "#2D6A4F", accent: "#74C69D" },
    "serene-scandinavian": { name: "The Nordic Dreamer", tagline: "Nature's palette, humanity's warmth", color: "#1D3557", accent: "#A8DADC" },
    "serene-industrial": { name: "The Urban Monk", tagline: "Raw materials, refined spirit", color: "#3D405B", accent: "#81B29A" },
    "serene-mediterranean": { name: "The Sun Seeker", tagline: "Where warmth becomes an architecture", color: "#6B3226", accent: "#F4A261" },
    "bold-modern": { name: "The Power Minimalist", tagline: "Less, but everything it needs to be", color: "#1A1A2E", accent: "#E94560" },
    "bold-industrial": { name: "The Edge Dweller", tagline: "No apologies. No compromises.", color: "#2C2C54", accent: "#FF5722" },
    "bold-scandinavian": { name: "The Statement Nordic", tagline: "Quiet confidence, maximum impact", color: "#1B4332", accent: "#95D5B2" },
    "bold-mediterranean": { name: "The Bold Voyager", tagline: "Every room tells a sun-drenched story", color: "#7B2D00", accent: "#FFBA08" },
    "cozy-scandinavian": { name: "The Hygge Architect", tagline: "Every corner whispers stay a while", color: "#5C4033", accent: "#D4A574" },
    "cozy-mediterranean": { name: "The Terra Wanderer", tagline: "Sun-baked warmth, ancient calm", color: "#8B4513", accent: "#DDA15E" },
    "cozy-modern": { name: "The Warm Modernist", tagline: "Clean lines, never cold", color: "#4A4E69", accent: "#C9ADA7" },
    "cozy-industrial": { name: "The Comfort Rebel", tagline: "Industrial shell, velvet heart", color: "#374151", accent: "#D97706" },
    "creative-industrial": { name: "The Loft Artist", tagline: "Where constraints fuel creativity", color: "#1F2937", accent: "#8B5CF6" },
    "creative-mediterranean": { name: "The Mosaic Mind", tagline: "Every tile a story, every wall a canvas", color: "#7C2D12", accent: "#F59E0B" },
    "creative-modern": { name: "The Art Technologist", tagline: "Precision as poetry, function as art", color: "#0F172A", accent: "#38BDF8" },
    "creative-scandinavian": { name: "The Forest Curator", tagline: "Nature and art in perfect dialogue", color: "#14532D", accent: "#86EFAC" },
  };
  const key = `${vibe}-${style}`;
  return archetypes[key] || { name: "The Free Spirit", tagline: "Unapologetically you — rules are for decorating", color: "#374151", accent: "#9CA3AF" };
};

export const getMatchedListings = (answers, allListings) => {
  const { vibe, style, location, budget } = answers;
  const preferences = [style, vibe, location, budget].filter(Boolean);
  const scored = allListings.map((listing) => {
    const overlap = listing.vibes.filter((v) => preferences.includes(v)).length;
    const score = Math.round(70 + (overlap / preferences.length) * 28 + Math.random() * 5);
    return { ...listing, match: Math.min(score, 99) };
  });
  return scored.sort((a, b) => b.match - a.match).slice(0, 4);
};

// Enhancement 3: Smart Snaphomz URL with encoded filters + UTM tracking
export const buildSnaphomzUrl = (answers, archetype) => {
  // Force redirect to root domain only (per product requirement)
  return `https://snaphomz.com/`;
};
