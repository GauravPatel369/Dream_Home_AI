# ✦ Dream Home AI
### Lifestyle-to-listing conversion engine via generative home visuals

A React-based quiz that maps your lifestyle answers to cinematic AI-generated room visuals — then matches you to real Snaphomz listings.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🎯 **5-Question Quiz** | Visual card-style quiz covering vibe, design style, location, priority space, and budget |
| 🏠 **4 AI Room Visuals** | Bedroom, Kitchen, Exterior, Workspace — generated via Claude AI |
| 🧬 **Home Personality Card** | Your unique archetype (e.g. "The Zen Modernist") with tagline |
| ⬇ **Shareable PNG Export** | Download your personality card via html2canvas |
| 🔗 **Listing Matches** | 4 curated listings matched to your vibe with % match scores |
| 🏡 **Snaphomz Integration** | Every listing links directly to snaphomz.com |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18 or higher — [Download](https://nodejs.org/)
- **npm** v9+ (comes with Node.js)
- **Anthropic API Key** — [Get one free](https://console.anthropic.com/)

### 1. Clone or download

```bash
git clone https://github.com/your-username/dream-home-ai.git
cd dream-home-ai
```

Or simply extract the downloaded ZIP.

### 2. Install dependencies

```bash
npm install
```

This installs React, html2canvas, and all required packages.

### 3. Configure environment

```bash
cp .env.example .env
```

Open `.env` and add your Anthropic API key:

```env
REACT_APP_ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxx...
```

> ⚠️ **Security note:** Your API key will be exposed in the browser bundle since this is a client-side React app. This is fine for local development and demos. For production, proxy API calls through a backend (see [Production Deployment](#production-deployment) below).

### 4. Start the development server

```bash
npm start
```

The app opens at **http://localhost:3000** 🎉

---

## 📁 Project Structure

```
dream-home-ai/
├── public/
│   └── index.html              # HTML shell
├── src/
│   ├── data/
│   │   └── quizData.js         # Quiz questions, archetypes, mock listings
│   ├── utils/
│   │   └── imageGen.js         # DALL-E prompt builder, archetype logic, listing matcher
│   ├── App.js                  # Main app — all screens & components
│   ├── App.css                 # Full styling (Playfair Display + DM Sans, dark luxury theme)
│   └── index.js                # React entry point
├── .env.example                # Environment variable template
├── .gitignore
├── package.json
└── README.md
```

---

## 🔧 How It Works

### Quiz Flow
1. User answers 5 questions (vibe, style, location, priority space, budget)
2. Answers are stored in React state — no backend needed

### AI Image Generation
- `imageGen.js` builds cinematic prompts from quiz answers (e.g. *"ultra-modern minimalist master bedroom, serene atmosphere, premium finishes with urban skyline views..."*)
- These prompts are sent to the Anthropic Claude API, which refines and optimises them for DALL-E 3
- The app displays **Unsplash fallback images** categorised by style while AI prompts are generated
- You can swap in actual DALL-E API calls in `imageGen.js` (see [Extending the App](#extending-the-app))

### Home Personality Archetype
- 16 unique archetypes mapped from vibe × style combinations
- Each has a name, tagline, colour, and accent

### Listing Matching
- Listings in `quizData.js` have `vibes` arrays
- Matcher scores each listing by overlap with the user's answer set
- Top 4 shown with live % match scores

### Share Card Export
- `html2canvas` captures an off-screen `<div>` containing the archetype + room images
- Exported as a PNG download — ready to share on Instagram, WhatsApp, etc.

---

## 🎨 Customisation Guide

### Add/edit quiz questions
Edit `src/data/quizData.js` → `QUIZ_QUESTIONS` array. Each question needs:
```js
{
  id: "unique_id",          // used as answer key
  question: "...",          // displayed heading
  subtitle: "...",          // subtext
  options: [
    { id: "opt_id", label: "Label", emoji: "🏠", desc: "Description" }
  ]
}
```

### Add/edit archetypes
In `src/utils/imageGen.js` → `getArchetype()`, add entries to the `archetypes` object:
```js
"vibe-style": {
  name: "The ...",
  tagline: "...",
  color: "#hex",      // hero background base
  accent: "#hex"      // highlight colour
}
```
Keys follow the pattern `${vibe}-${style}` (e.g. `"serene-modern"`).

### Add real listings
Replace or extend `MOCK_LISTINGS` in `quizData.js`:
```js
{
  id: 7,
  title: "...",
  location: "...",
  price: "₹...",
  beds: 3, baths: 2, sqft: "...",
  tag: "Optional badge",
  img: "https://...",           // listing photo URL
  match: 0,                     // overridden by matcher — set 0
  vibes: ["modern", "serene", "city", "premium"]   // for matching
}
```

### Change the colour theme
Core design tokens are in `App.css` under `:root`. Key variables:
- `--gold` / `--gold-light` — primary accent colour
- `--dark` / `--dark-2` / `--dark-3` — background layers
- `--cream` — primary text colour

---

## 🌐 Extending the App

### Connect real DALL-E image generation
In `src/utils/imageGen.js`, replace the `generateHomeImages` function body with:

```js
const dallEResponse = await fetch("https://api.openai.com/v1/images/generations", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`
  },
  body: JSON.stringify({
    model: "dall-e-3",
    prompt: prompts[room],
    n: 1,
    size: "1024x1024",
    quality: "hd"
  })
});
const data = await dallEResponse.json();
imageResults[room] = {
  placeholder: data.data[0].url,
  prompt: prompts[room],
  status: "generated"
};
```

Add `REACT_APP_OPENAI_API_KEY` to your `.env`.

### Connect real Snaphomz listings API
Replace `getMatchedListings` in `imageGen.js` to fetch from a real API:

```js
export const getMatchedListings = async (answers) => {
  const params = new URLSearchParams({
    style: answers.style,
    location: answers.location,
    budget: answers.budget,
    limit: 4
  });
  const res = await fetch(`https://api.snaphomz.com/listings?${params}`);
  return res.json();
};
```

### Add email capture
After the results reveal, add a simple form that posts to a service like Mailchimp, ConvertKit, or your own backend.

---

## 🏗️ Production Deployment

### ⚠️ API Key Security
Never ship `REACT_APP_ANTHROPIC_API_KEY` in a public production build — it's visible in the browser.

**Recommended approach:** create a small Express proxy:

```js
// server.js
app.post('/api/generate', async (req, res) => {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,   // server-side only
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(req.body)
  });
  res.json(await response.json());
});
```

Then point `imageGen.js` to `/api/generate` instead of the Anthropic endpoint directly.

### Build for production

```bash
npm run build
```

The optimised bundle lands in `/build`. Deploy to:
- **Vercel** — `vercel deploy`
- **Netlify** — drag `build/` folder into Netlify dashboard
- **GitHub Pages** — add `"homepage": "."` to `package.json` then `npm run build`

---

## 🛠 Troubleshooting

| Problem | Fix |
|---|---|
| `npm install` fails | Make sure Node.js ≥ 18 is installed: `node --version` |
| Blank screen / console errors | Check `.env` exists and has your API key |
| Images not loading | Unsplash URLs require internet access; check firewall/VPN |
| Share card is blank | Some browsers block `html2canvas` on cross-origin images — try Chrome |
| API quota exceeded | Check your Anthropic console usage dashboard |

---

## 📦 Dependencies

| Package | Version | Purpose |
|---|---|---|
| `react` | ^18.2 | UI framework |
| `react-dom` | ^18.2 | DOM rendering |
| `html2canvas` | ^1.4.1 | Share card PNG export |
| `react-scripts` | 5.0.1 | CRA build tooling |

---



## 🏠 Built for Snaphomz
This project is designed as a top-of-funnel viral tool for [Snaphomz](https://snaphomz.com/) — converting aspirational browsers into warm, intent-rich leads.

---

*✦ Dream Home AI — where your lifestyle becomes your listing*
