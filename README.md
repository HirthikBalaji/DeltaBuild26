<div align="center">

```
╔══════════════════════════════════════════════════════╗
║   ◈  D E V I Q  —  O R G   I N T E L L I G E N C E  ║
║      Deep Space Terminal · AI Developer Analytics    ║
╚══════════════════════════════════════════════════════╝
```

# DevIQ — Engineering Intelligence Platform

**The ICU monitor for your engineering organization.**

DevIQ is a full-stack, real-time developer analytics dashboard that transforms raw GitHub commits, Jira tickets, and Slack messages into a continuous stream of organizational vital signs — commit velocity, coordination load, knowledge distribution, burnout temperature, and deployment frequency — displayed in a cinematic deep-space terminal UI.

[![Python](https://img.shields.io/badge/Python-3.12+-00ffc8?style=flat-square&labelColor=080c14)](https://python.org)
[![React](https://img.shields.io/badge/React-18+-00ffc8?style=flat-square&labelColor=080c14)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-latest-a3ff5a?style=flat-square&labelColor=080c14)](https://fastapi.tiangolo.com)
[![Vite](https://img.shields.io/badge/Vite-5+-a3ff5a?style=flat-square&labelColor=080c14)](https://vitejs.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-b56cff?style=flat-square&labelColor=080c14)](LICENSE)

</div>

---

## 🫀 The Concept — Org Vitals Monitor

A patient in the ICU has continuous vital signs. So does your engineering org. DevIQ monitors them in real time:

| Vital Sign | Engineering Equivalent | What It Detects |
|---|---|---|
| ❤️ **Heart Rate** | Commit velocity | Flatlines (team stopped), tachycardia (unsustainable pace) |
| 🩺 **Blood Pressure** | Coordination load | Bottlenecks (hypertensive), silos (hypotensive) |
| 💧 **SpO₂** | Knowledge distribution | Bus-factor crisis, knowledge concentration |
| 🌡 **Temperature** | Burnout index | Fever spikes predicting burnout events |
| 🫁 **Resp. Rate** | Deployment frequency | Ticket throughput, delivery health |

When Hirthik's burnout hits 90%, the monitor shows an arrhythmia. When knowledge concentrates in one file, oxygen saturation drops. When coordination tax spikes, blood pressure redlines.

---

## ✨ Features

### 20 Intelligence Modules

| Module | Description |
|---|---|
| **Overview** | Live KPI dashboard with animated counters and team health snapshot |
| **Leaderboard** | Developer rankings by contribution, burnout risk, and productivity score |
| **Developer Profile** | Full DNA radar: Logic, Refactor, Speed, Collab, Velocity, Reliability |
| **Burnout Monitor** | Per-developer burnout forecasting with sparkline trajectories |
| **Flow State** | Deep-work detection — who's in the zone, who's fragmented |
| **Code Health** | Entropy scoring across all files, risk heatmaps, technical debt index |
| **Dependencies & Risk** | Force-directed dependency graph, circular dep detection |
| **Psych Safety** | Proxy scores for team psychological safety from Jira comment patterns |
| **Team & Collaboration** | Interaction graph, workload balance, team fragmentation index |
| **AI Insights** | Automated anomaly detection and executive-ready recommendations |
| **Evolution Simulator** | Sprint-over-sprint trajectory modeling and velocity forecasting |
| **Research Platform** | Cross-dimensional correlation analysis (burnout × output, etc.) |
| **Knowledge Graph** | Who knows what — expertise mapping across the codebase |
| **Dark Matter** | Invisible work: review cycles, untracked debugging, context-switching tax |
| **Contribution Portfolio** | Blockchain-verifiable WCIS proof-of-work per developer |
| **Blockchain Ledger** | Immutable contribution ledger with hash chain visualization |
| **ZK Proof Verification** | Zero-knowledge proof circuits for contribution privacy |
| **AI Quality Scoring** | PR quality, code review depth, comment signal analysis |
| **Hidden Work Detector** | Surfaces untracked effort invisible to standard sprint metrics |
| **Jira Agent** | Agentic AI assistant for ticket triage, sprint planning, and risk flags |
| **Slack Intelligence** | Sentiment analysis, communication health, and collaboration scoring |
| **🫀 Org Vitals Monitor** | ICU-style live waveforms — arrhythmias, flatlines, fever alerts |

### Technical Highlights

- **Server-Sent Events (SSE)** — live data pushed from backend every 30s, no polling
- **Ollama integration** — local LLM for AI DNA profiles and reasoning (optional)
- **GitHub API** — real commit history, file changes, contributor stats
- **Jira REST API** — live ticket data, sprint metadata, comment analysis
- **Slack API** — channel history, sentiment scoring, collaboration metrics
- **Zero-Knowledge Proofs** — client-side circuit simulation for contribution privacy
- **Responsive** — full mobile support with bottom nav, drawer, and adaptive grids
- **Deep Space Terminal UI** — IBM Plex Mono + Syne, cyan/lime/violet palette, live ECG waveforms

---

## 🗂 Project Structure

```
DeltaBuild26/
├── main.py                  # FastAPI backend — all data fetching, SSE stream
├── deviq-ultimate.jsx       # React frontend — all 20+ pages, single file
├── index.html               # Vite entry point
├── vite.config.js           # Vite config (proxy → FastAPI :3001)
├── package.json             # Node dependencies (React, Vite)
├── pyproject.toml           # Python dependencies (FastAPI, httpx, etc.)
├── uv.lock                  # Locked Python dep tree
├── .github_cache.json       # Cached GitHub API response (speeds up dev)
├── Data/                    # Static fallback datasets
│   └── ...
└── src/                     # Additional source assets
    └── ...
```

---

## ⚡ Prerequisites

Make sure you have these installed before you begin:

| Tool | Version | Install |
|---|---|---|
| **Python** | 3.12+ | [python.org](https://python.org) |
| **Node.js** | 18+ | [nodejs.org](https://nodejs.org) |
| **uv** (Python pkg manager) | latest | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| **Git** | any | [git-scm.com](https://git-scm.com) |
| **Ollama** *(optional)* | latest | [ollama.ai](https://ollama.ai) — for AI DNA profiles |

---

## 🚀 Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/HirthikBalaji/DeltaBuild26.git
cd DeltaBuild26
```

### 2. Set up environment variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env   # if example exists, otherwise create manually
```

Open `.env` and fill in your credentials:

```env
# ── GitHub ─────────────────────────────────────────────
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_REPO=your-org/your-repo          # e.g. HirthikBalaji/DeltaBuild26

# ── Jira ───────────────────────────────────────────────
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=you@example.com
JIRA_API_TOKEN=your_jira_api_token
JIRA_PROJECT_KEY=DEV                    # your Jira project key

# ── Slack (optional) ───────────────────────────────────
SLACK_BOT_TOKEN=xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx
SLACK_CHANNEL_IDS=C01234ABCDE,C09876FGHIJ   # comma-separated, optional
SLACK_CACHE_TTL_SECONDS=120
SLACK_MSG_LIMIT=200

# ── Ollama (optional — local AI) ───────────────────────
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

> **Where to get tokens:**
> - **GitHub token**: [github.com/settings/tokens](https://github.com/settings/tokens) → Generate new token (classic) → check `repo` scope
> - **Jira token**: [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
> - **Slack token**: [api.slack.com/apps](https://api.slack.com/apps) → Create app → OAuth & Permissions → `channels:history`, `users:read`, `reactions:read`

### 3. Install Python dependencies

```bash
# Using uv (recommended — it's fast)
uv sync

# Or using pip directly
pip install fastapi uvicorn httpx python-dotenv
```

### 4. Install Node dependencies

```bash
npm install
```

### 5. Start the backend (Terminal 1)

```bash
# Using uv
uv run uvicorn main:app --host 0.0.0.0 --port 3001 --reload

# Or with Python directly
python -m uvicorn main:app --host 0.0.0.0 --port 3001 --reload
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:3001 (Press CTRL+C to quit)
INFO:     Started reloader process
```

### 6. Start the frontend (Terminal 2)

```bash
npm run dev
```

You should see:
```
  VITE v5.x.x  ready in 300ms
  ➜  Local:   http://localhost:5173/
```

### 7. Open the dashboard

Navigate to **[http://localhost:5173](http://localhost:5173)** in your browser.

**Login credentials:**
```
Email:    hirthikbalaji2006@gmail.com
Password: 123456
```

> To change credentials, edit the `handleSignIn` function in `deviq-ultimate.jsx`.

---

## 🤖 Optional: Enable AI DNA Profiles (Ollama)

DevIQ can generate AI-powered developer DNA profiles using a local LLM via Ollama.

```bash
# 1. Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# 2. Pull a model
ollama pull llama3.2

# 3. Start Ollama server (it usually auto-starts)
ollama serve

# 4. Verify it's running
curl http://localhost:11434/api/tags
```

The OLLAMA_BASE_URL and OLLAMA_MODEL in your `.env` will be picked up automatically. When Ollama is unavailable, DevIQ falls back to the built-in math-based DNA engine — no errors.

---

## 🔧 Configuration Reference

### Backend (`main.py`) key environment variables

| Variable | Default | Description |
|---|---|---|
| `GITHUB_TOKEN` | required | Personal access token with `repo` scope |
| `GITHUB_REPO` | required | `owner/repo` format |
| `JIRA_BASE_URL` | required | Your Atlassian domain |
| `JIRA_EMAIL` | required | Jira account email |
| `JIRA_API_TOKEN` | required | Jira API token |
| `JIRA_PROJECT_KEY` | `DEV` | Jira project identifier |
| `SLACK_BOT_TOKEN` | optional | `xoxb-...` bot token |
| `SLACK_CHANNEL_IDS` | optional | Auto-discovers first 10 channels if unset |
| `SLACK_CACHE_TTL_SECONDS` | `120` | Slack data cache duration |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API endpoint |
| `OLLAMA_MODEL` | `llama3.2` | Model to use for DNA profiles |

### Frontend ports

The Vite dev server proxies all `/api/*` requests to `http://localhost:3001`. This is configured in `vite.config.js`. If you run the backend on a different port, update that file.

---

## 🌐 API Endpoints

The FastAPI backend exposes these endpoints:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/events` | SSE stream — live data every 30s |
| `GET` | `/api/devs` | Developer stats (commits, burnout, flow, etc.) |
| `GET` | `/api/files` | File-level entropy and risk data |
| `GET` | `/api/deps` | Dependency graph edges |
| `GET` | `/api/tickets` | Jira ticket data |
| `GET` | `/api/slack` | Slack intelligence metrics |
| `POST` | `/api/refresh/slack` | Invalidate Slack cache |
| `GET` | `/api/cache/status` | Cache age and health |
| `GET` | `/docs` | Interactive Swagger UI |

---

## 🏗 Building for Production

```bash
# Build the frontend
npm run build

# Serve with a static server (optional)
npx serve dist

# Or serve the frontend from FastAPI itself
# (add StaticFiles mount to main.py)
```

For deployment, run the FastAPI backend on any server (Railway, Fly.io, VPS) and serve the built Vite `dist/` folder from a CDN or the same server.

---

## 🐛 Troubleshooting

**Backend won't start — missing module**
```bash
uv sync       # re-sync Python deps
# or
pip install -r requirements.txt   # if requirements.txt exists
```

**Frontend can't reach backend (network error)**
- Confirm backend is running on port `3001`
- Check `vite.config.js` proxy target matches your backend port
- Try visiting `http://localhost:3001/docs` directly to confirm FastAPI is alive

**GitHub API rate limit**
- The app caches responses in `.github_cache.json`
- If rate-limited, the cache is used automatically
- Use a token with broader permissions or wait for the rate limit to reset

**Slack shows "not connected"**
- Ensure `SLACK_BOT_TOKEN` is set in `.env`
- Invite the bot to each channel: `/invite @your-bot-name`
- Check the bot has `channels:history` and `users:read` OAuth scopes

**Ollama DNA profiles not loading**
- Confirm `ollama serve` is running: `curl http://localhost:11434/api/tags`
- The dashboard falls back to math-based profiles automatically if Ollama is offline

**Login not working**
- Default credentials: `hirthikbalaji2006@gmail.com` / `123456`
- To change them, find `handleSignIn` in `deviq-ultimate.jsx` and update the comparison

---

## 🧰 Tech Stack

**Backend**
- [FastAPI](https://fastapi.tiangolo.com) — async Python API server
- [uvicorn](https://www.uvicorn.org) — ASGI server
- [httpx](https://www.python-httpx.org) — async HTTP client for GitHub/Jira/Slack APIs
- [python-dotenv](https://pypi.org/project/python-dotenv/) — environment management
- [uv](https://docs.astral.sh/uv/) — fast Python package manager

**Frontend**
- [React 18](https://react.dev) — UI framework
- [Vite 5](https://vitejs.dev) — build tool and dev server
- IBM Plex Mono + Syne — typography via Google Fonts
- Pure CSS animations — no animation library dependency
- SVG — all waveforms, gauges, radar charts, and graphs hand-built

**Integrations**
- GitHub REST API v3
- Jira REST API v3 (Atlassian Cloud)
- Slack Web API
- Ollama (local LLM inference)

---

## 📸 Module Screenshots

| Module | Visual |
|---|---|
| 🫀 Org Vitals Monitor | Live ECG waveforms, arrhythmia alerts, flatline detection |
| 🧬 Evolution Simulator | Sprint trajectory modeling with burnout forecast overlays |
| 🧠 Knowledge Graph | Force-directed graph of expertise across codebase |
| 🌑 Dark Matter | Hidden work radar with contribution invisibility index |
| 🔐 ZK Proof Verification | Zero-knowledge circuit simulation for contribution privacy |
| 💬 Slack Intelligence | Sentiment heatmap, top communicators, live message feed |

---

## 👥 Team

Built at **DeltaBuild 2026** hackathon.

| Name | Role |
|---|---|
| **Hirthik Balaji** | Full-stack, AI integration, system architecture |
| **Anandhappriya** | Data engineering, Jira/GitHub integration |


---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

```
◈ DEVIQ PROTOCOL v3.0.0 · RESTRICTED ACCESS · LIVE
```

*Built with obsessive attention to detail for DeltaBuild 2026*

**[⭐ Star this repo](https://github.com/HirthikBalaji/DeltaBuild26)** if DevIQ impressed you.

</div>
