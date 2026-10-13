# bAI buddies: Equipment-Aware AI Voice Fitness & Nutrition Coach

**bAI buddies** is an interactive, voice-driven AI fitness and nutrition assistant. It helps users generate customized workout routines and nutrition meal plans that strictly adhere to their available equipment, space, dietary goals, and physical limitations—complete with real-time voice conversations and reactive animated avatars.

---

## 🌟 Key Features

* **🎭 Dual-Persona Coaching**:
  * **FitBuddy (Workout Coach)**: Represented by an athletic Bull avatar with an olive green aesthetic. Creates hyper-personalized workout plans based strictly on the gear you have at home or in the gym.
  * **MealBuddy (Nutrition Coach)**: Represented by a Rhino chef avatar with a warm culinary orange aesthetic. Crafts tailored meal plans with calorie and macronutrient (protein, carbs, fat) targets.
* **🎙️ Natural Voice Conversations**:
  * **Speech-to-Text (STT)**: Real-time client-side voice transcription via browser `SpeechRecognition` / `webkitSpeechRecognition` with live speech-state indicators.
  * **Neural Text-to-Speech (TTS)**: High-fidelity natural voice streaming using **Microsoft Edge TTS** (`edge-tts`) with configurable pitch and vocal characteristics, falling back seamlessly to browser speech synthesis when needed.
  * **Synchronized Avatar Lip-Sync**: Avatars react and animate their mouths and vocal wave indicators in sync with spoken audio.
* **🧠 Multi-Provider AI Architecture**:
  * **Groq (Primary)**: Powered by `llama-3.3-70b-versatile` for near-instant conversational responses and structured JSON plan extraction.
  * **Google Gemini (Secondary/Fallback)**: Supported via `google-genai` for flexible multimodal capabilities.
  * **Deterministic Mock AI (Offline Mode)**: Built-in deterministic offline engine (`USE_MOCK_AI=true`) that runs completely without API keys for testing and demonstrations.
* **🛡️ Zero-Hallucination Equipment Filter**:
  * Employs an exact exercise catalog filter (`backend/seed_data.py`) ensuring workouts *never* prescribe exercises requiring equipment the user does not possess.
* **💾 Local Persistence & State Management**:
  * Stores user profiles, equipment inventories, and workout plans locally using SQLite (`fitbuddy.db`).
  * Persists ongoing conversation transcripts in `localStorage` across page reloads.
* **📱 Responsive Modern Design**:
  * Premium dark athletic visual theme with fluid transitions, desktop side-drawers, and mobile bottom-sheet interfaces.

---

## 🏗️ Architecture & Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Backend** | Python 3.10+, FastAPI, Uvicorn, SQLAlchemy, Pydantic |
| **AI & LLMs** | Groq SDK (`llama-3.3-70b-versatile`), Google Gemini (`google-genai`), Rule-based Fallback |
| **Voice & Audio** | Microsoft Edge TTS (`edge-tts` streaming MP3), Web Speech API (`SpeechRecognition`) |
| **Database** | SQLite (`fitbuddy.db`) with SQLAlchemy ORM |
| **Frontend** | Vanilla HTML5, CSS3 (Custom Design System, Glassmorphism, Micro-animations), Vanilla JavaScript (ES6 Modules) |

---

## 📁 Project Structure

```text
AIVoiceAgent-gymbuddy/
├── backend/
│   ├── ai_service.py       # Groq/Gemini/Mock LLM logic & plan extraction
│   ├── crud.py             # Database CRUD helper functions
│   ├── database.py         # SQLAlchemy engine & session setup
│   ├── main.py             # FastAPI routing, middleware, CORS, & endpoints
│   ├── models.py           # SQLAlchemy database models
│   ├── schemas.py          # Pydantic validation schemas
│   ├── seed_data.py        # Validated exercise catalog & equipment filtering
│   └── tts_service.py      # Microsoft Edge TTS audio streaming service
├── frontend/
│   ├── index.html          # Marketing & feature showcase landing page
│   ├── app.html            # Main interactive coaching application
│   ├── app.js              # Application logic, audio playback, & API coordination
│   ├── ui.js               # Modal/sheet controllers & UI state management
│   ├── avatar.js           # FitBuddy Bull avatar animations & lip-sync
│   ├── rhino.js            # MealBuddy Rhino avatar animations & lip-sync
│   ├── style.css           # Global stylesheet & design tokens
│   └── *.png / *.jpg       # Visual assets, icons, and avatars
├── requirements.txt        # Python package dependencies
├── .env.example            # Environment variables template
├── fitbuddy.db             # Local SQLite database (auto-generated)
└── README.md               # Project documentation
```

---

## 🚀 Getting Started

### 1. Prerequisites
* **Python 3.10 or higher** installed. Verify with:
  ```powershell
  python --version
  ```
* Google Chrome, Microsoft Edge, or Safari (recommended for Web Speech API support).

### 2. Installation

1. **Clone the repository**:
   ```powershell
   git clone https://github.com/draylazy/AIVoiceAgent-gymbuddy.git
   cd AIVoiceAgent-gymbuddy
   ```

2. **Create and activate a virtual environment**:
   ```powershell
   # Windows (PowerShell)
   python -m venv venv
   .\venv\Scripts\activate

   # macOS / Linux
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install dependencies**:
   ```powershell
   pip install -r requirements.txt
   ```

### 3. Environment Configuration

Copy the `.env.example` file to create your local `.env`:
```powershell
copy .env.example .env
```

Open `.env` and configure your settings:
```ini
# AI Provider (Choose Groq or Gemini, or set USE_MOCK_AI=true)
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile

# Optional: Google Gemini API Key
GEMINI_API_KEY=your_gemini_api_key_here

# Offline mock mode (set to true to run without any API keys)
USE_MOCK_AI=false

# SQLite Database
DATABASE_URL=sqlite:///./fitbuddy.db

# Microsoft Edge TTS Settings
EDGE_TTS_VOICE=en-US-ChristopherNeural
EDGE_TTS_PITCH=-10Hz
```

> **Note**: Free Groq API keys with fast inference speeds can be acquired at [Groq Console](https://console.groq.com/).

### 4. Running the Application

Start the FastAPI application with Uvicorn:
```powershell
uvicorn backend.main:app --reload
```

Once running:
* **Landing Page**: [`http://localhost:8000/`](http://localhost:8000/)
* **Interactive App**: [`http://localhost:8000/app.html`](http://localhost:8000/app.html)
* **Interactive API Docs (Swagger)**: [`http://localhost:8000/docs`](http://localhost:8000/docs)
* **ReDoc API Documentation**: [`http://localhost:8000/redoc`](http://localhost:8000/redoc)

---

## 📡 API Endpoints Overview

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/chat` | Main conversational endpoint. Handles dialogue, extracts workout/meal plans, and returns streaming TTS audio URLs. |
| `GET` | `/tts` | Streams neural voice MP3 audio chunks using Microsoft Edge TTS (`edge-tts`). |
| `POST` | `/users/` | Creates a new user profile with demographic, fitness level, and limitation preferences. |
| `GET` | `/users/{id}` | Retrieves a user's profile information. |
| `POST` | `/users/{id}/equipment` | Saves an equipment profile (e.g., "Home Setup", "Gym Setup"). |
| `GET` | `/users/{id}/equipment` | Lists all saved equipment profiles for a user. |
| `POST` | `/users/{id}/generate_plan` | Triggers deterministic or AI plan generation restricted to eligible exercises. |
| `GET` | `/users/{id}/plan` | Retrieves the currently active workout plan for a user. |

---

## 🎯 Verification & Demonstration Guide

To test the application quickly without requiring API keys:

1. In `.env`, set `USE_MOCK_AI=true`.
2. Start the server and navigate to `http://localhost:8000/app.html`.
3. **Switch Modes**: Use the top toggle or burger menu to switch between **FitBuddy** (Workout) and **MealBuddy** (Nutrition).
4. **Voice Interaction**: Click the microphone button and grant browser microphone permission. Speak into your mic or type a prompt like:
   * *"Create a 3-day dumbbell workout plan for building muscle"*
   * *"Give me a high-protein meal plan for fat loss"*
5. **View Plans**: Click the **View Plan** button to open the plan sheet and view structured exercise splits, sets, reps, equipment badges, and daily meal breakdowns.

---

## 🔒 Security & Best Practices

* **API Keys Isolation**: API keys (`GROQ_API_KEY`, `GEMINI_API_KEY`) are kept strictly on the backend server and are never delivered to the client.
* **Static File Safety**: The root project directory and `.env` are protected; only the `frontend/` directory is mounted for public static serving.
* **CORS Protection**: CORS middleware is locked down to authorized origins (e.g., local development and the production Vercel frontend).

---

## 📄 License & Disclaimer

This project is created for educational and personal wellness purposes. It is not a replacement for certified medical, physical therapy, or registered dietitian advice. Consult a healthcare professional before starting any strenuous exercise routine.
