from dotenv import load_dotenv
load_dotenv(override=True)
import os
import json
import urllib.parse
from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from . import models, schemas, crud, ai_service, tts_service, seed_data
from .database import engine, get_db

# Create DB tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="bAI buddy API")

# Configure CORS (for development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://b-ai-buddy.vercel.app",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi import Request

@app.middleware("http")
async def add_no_cache_header(request: Request, call_next):
    response = await call_next(request)
    # Disable caching for static frontend files
    if request.method == "GET" and ("." in request.url.path or request.url.path == "/"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


@app.post("/users/", response_model=schemas.UserResponse)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    return crud.create_user(db=db, user=user)

@app.get("/users/{user_id}", response_model=schemas.UserResponse)
def read_user(user_id: int, db: Session = Depends(get_db)):
    db_user = crud.get_user(db, user_id=user_id)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user

@app.post("/users/{user_id}/equipment", response_model=schemas.EquipmentProfileResponse)
def create_equipment(user_id: int, profile: schemas.EquipmentProfileCreate, db: Session = Depends(get_db)):
    return crud.create_equipment_profile(db=db, profile=profile, user_id=user_id)

@app.get("/users/{user_id}/equipment", response_model=list[schemas.EquipmentProfileResponse])
def get_equipment(user_id: int, db: Session = Depends(get_db)):
    return crud.get_equipment_profiles(db, user_id)

@app.post("/users/{user_id}/generate_plan")
def generate_plan(user_id: int, equipment_profile_id: int, db: Session = Depends(get_db)):
    user = crud.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    profiles = crud.get_equipment_profiles(db, user_id)
    profile = next((p for p in profiles if p.id == equipment_profile_id), None)
    if not profile:
        raise HTTPException(status_code=404, detail="Equipment profile not found")
        
    equipment_list = json.loads(profile.equipment_list) if profile.equipment_list else []
    
    # Filter eligible exercises
    eligible = seed_data.get_eligible_exercises(
        user_equipment=equipment_list,
        user_preferences=user.preferences,
        avoid_movements=user.avoid_movements
    )
    
    if not eligible:
        raise HTTPException(status_code=400, detail="No exercises match your equipment and preferences.")
        
    # Generate plan
    try:
        plan_data = ai_service.generate_workout_plan(user, profile, eligible)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
    # Save plan
    db_plan = crud.create_workout_plan(db, plan_data, user_id, equipment_profile_id)
    return {"plan_id": db_plan.id, "plan_data": plan_data}

@app.get("/users/{user_id}/plan")
def get_active_plan(user_id: int, db: Session = Depends(get_db)):
    plan = crud.get_active_plan(db, user_id)
    if not plan:
        raise HTTPException(status_code=404, detail="No active plan found")
    return {"plan_id": plan.id, "plan_data": json.loads(plan.plan_data)}

# Simple in-memory session store for MVP
chat_sessions = {}

@app.post("/chat", response_model=schemas.ChatResponse)
def chat(request: schemas.ChatRequest, db: Session = Depends(get_db)):
    session_id = request.session_id
    if session_id not in chat_sessions:
        chat_sessions[session_id] = []
        
    chat_sessions[session_id].append({"role": "user", "content": request.message})
    
    # Pass entire history to AI
    response_data = ai_service.generate_conversational_response(chat_sessions[session_id], request.mode)
    response_text = response_data["text"]
    
    chat_sessions[session_id].append({"role": "assistant", "content": response_text})
    
    audio_url = f"/tts?text={urllib.parse.quote(response_text)}"
    
    return schemas.ChatResponse(
        response=response_text,
        audio_url=audio_url,
        plan_data=response_data.get("plan_data"),
        suggestions=response_data.get("suggestions")
    )

@app.get("/tts")
async def get_tts(text: str, voice: str = None, pitch: str = None):
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text parameter is required")
    return StreamingResponse(
        tts_service.generate_speech_stream(text=text, voice=voice, pitch=pitch),
        media_type="audio/mpeg"
    )


# Ensure frontend directory exists before mounting
os.makedirs("frontend", exist_ok=True)
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
