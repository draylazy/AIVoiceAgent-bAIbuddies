import os
import json
import re
from typing import List, Dict, Any, Union
from .schemas import WorkoutPlanData, WorkoutSessionSchema, ExerciseSchema, MealPlanData, DailyMealPlanSchema, MealSchema
from .seed_data import get_eligible_exercises, EXERCISE_CATALOG

def load_env_file():
    """Load .env file from project root if it exists without requiring external packages."""
    env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
    if os.path.exists(env_path):
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k not in os.environ:
                            os.environ[k] = v
        except Exception as e:
            print(f"Error loading .env: {e}")

load_env_file()

def get_ai_provider():
    """Determine AI provider: groq > gemini > mock."""
    load_env_file()
    use_mock = os.getenv("USE_MOCK_AI", "false").lower() == "true"
    if use_mock:
        return "mock"
    
    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key and groq_key.strip() and groq_key != "your_groq_api_key_here":
        return "groq"
        
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key and gemini_key.strip() and gemini_key != "your_api_key_here":
        return "gemini"
        
    return "mock"

def get_ai_mode():
    return "mock" if get_ai_provider() == "mock" else "live"

try:
    from groq import Groq
    GROQ_AVAILABLE = True
except ImportError:
    GROQ_AVAILABLE = False

try:
    from google import genai
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False

def generate_workout_plan(user: Any, equipment: Any, eligible_exercises: List[Dict[str, Any]]) -> WorkoutPlanData:
    provider = get_ai_provider()
    
    if not eligible_exercises:
        raise ValueError("No eligible exercises found for the given equipment and preferences.")
        
    if provider == "groq" and GROQ_AVAILABLE:
        try:
            return _generate_groq_plan(user, equipment, eligible_exercises)
        except Exception as e:
            print(f"Groq plan generation error: {e}. Falling back to mock plan.")
            return _generate_mock_plan(user, eligible_exercises)
            
    if provider == "gemini" and GENAI_AVAILABLE:
        try:
            return _generate_gemini_plan(user, equipment, eligible_exercises)
        except Exception as e:
            print(f"Gemini plan generation error: {e}. Falling back to mock plan.")
            return _generate_mock_plan(user, eligible_exercises)
            
    return _generate_mock_plan(user, eligible_exercises)

def _generate_mock_plan(user: Any, eligible_exercises: List[Dict[str, Any]]) -> WorkoutPlanData:
    import random
    sessions = []
    num_exercises = min(4, len(eligible_exercises))
    selected = random.sample(eligible_exercises, num_exercises)
    
    exercises = []
    for ex in selected:
        if ex.get("type") == "reps":
            exercises.append(ExerciseSchema(
                id=ex["id"], 
                name=ex["name"], 
                sets=3, 
                reps=10, 
                rest_seconds=60, 
                notes=ex.get("instructions", "Focus on controlled form.")
            ))
        else:
            exercises.append(ExerciseSchema(
                id=ex["id"], 
                name=ex["name"], 
                sets=3, 
                duration_seconds=30, 
                rest_seconds=30,
                notes=ex.get("instructions", "Breathe steadily throughout.")
            ))
            
    sessions.append(WorkoutSessionSchema(
        day=1,
        warmup=["Arm circles (30s)", "High knees (30s)", "Torso twists (30s)"],
        exercises=exercises,
        cooldown=["Hamstring stretch", "Quad stretch", "Deep breathing (1 min)"],
        estimated_time_minutes=25,
        explanation="Full-body activation tailored to your available equipment and space."
    ))
    
    return WorkoutPlanData(
        sessions=sessions,
        general_advice="Stay well-hydrated, control your breathing, and maintain proper form over speed."
    )

def _generate_mock_meal_plan(user: Any) -> MealPlanData:
    meals = [
        MealSchema(id="m1", name="Grilled Chicken Salad", calories=400, protein=45, carbs=15, fat=10, notes="Use light dressing"),
        MealSchema(id="m2", name="Protein Shake", calories=200, protein=30, carbs=10, fat=5, notes="Post-workout")
    ]
    return MealPlanData(
        days=[DailyMealPlanSchema(
            day=1,
            breakfast=["Oatmeal", "Black coffee"],
            meals=meals,
            snacks=["Almonds"],
            total_calories=1800,
            explanation="High protein focus for muscle recovery."
        )],
        general_advice="Drink at least 3 liters of water today."
    )

def search_online_fitness(query: str, max_results: int = 2) -> str:
    """Search online for current evidence-based workouts, routines, and exercises."""
    try:
        from ddgs import DDGS
        results = list(DDGS().text(f"{query} workout exercises form", max_results=max_results))
        if not results:
            return ""
        snippets = []
        for r in results:
            title = r.get("title", "")
            body = r.get("body", "")
            snippets.append(f"- {title}: {body}")
        return "\n".join(snippets)
    except Exception as e:
        print(f"Online search notice: {e}")
        return ""

GROQ_PRIMARY_MODELS = [
    os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"),
    "qwen/qwen3.8-27b",
    "allam-2-7b",
]

def get_groq_model():
    return GROQ_PRIMARY_MODELS[0]

def _groq_call_with_fallback(client, messages, response_format=None, temperature=0.7, max_tokens=400):
    """Try each groq model in order, returning the first successful completion."""
    for model in GROQ_PRIMARY_MODELS:
        try:
            kwargs = dict(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            if response_format:
                kwargs["response_format"] = response_format
            return client.chat.completions.create(**kwargs)
        except Exception as e:
            # Silently fallback for common expected errors (like rate limits or missing models)
            if "rate_limit_exceeded" not in str(e) and "does not exist" not in str(e):
                print(f"Groq model {model} failed: {e}. Trying next...")
    raise RuntimeError("All Groq models failed.")

def _generate_groq_plan(user: Any, equipment: Any, eligible_exercises: List[Dict[str, Any]]) -> WorkoutPlanData:
    client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    goal = getattr(user, 'goal', 'general fitness')
    equip = getattr(equipment, 'equipment_list', 'bodyweight')
    
    # Search online for the best, most up-to-date workouts and exercises
    online_findings = search_online_fitness(f"{goal} with {equip}", max_results=2)
    
    prompt = f"""
    You are FitBuddy, an expert AI fitness coach with live internet research capabilities.
    Create a {getattr(user, 'workout_days', 3)}-day weekly workout plan for a user based on modern exercise science and online research.
    User Goal: {goal}
    Experience Level: {getattr(user, 'experience_level', 'beginner')}
    Minutes per session: {getattr(user, 'minutes_per_session', 30)}
    Preferences: {getattr(user, 'preferences', 'none')}
    Equipment Available: {equip}
    
    Online Research & Best Practice Insights:
    {online_findings if online_findings else "Utilize evidence-based exercise science and optimal hypertrophy/strength protocols."}
    
    Do NOT restrict yourself to a static list. Pick the best, most effective, and safe exercises found online or in modern fitness science.
    
    Respond STRICTLY in valid JSON matching this schema:
    {{
      "sessions": [
        {{
          "day": 1,
          "warmup": ["Dynamic movement (e.g. arm circles, leg swings)"],
          "exercises": [
            {{
              "id": "ex_1",
              "name": "Exercise Name",
              "sets": 3,
              "reps": "10-12", 
              "duration_seconds": null,
              "rest_seconds": 60,
              "notes": "Evidence-based coaching form tip"
            }}
          ],
          "cooldown": ["Targeted static stretches"],
          "estimated_time_minutes": 45, // MUST accurately calculate total time based on sets, reps, rests, warmup, and cooldown
          "explanation": "Scientific rationale for this session"
        }}
      ],
      "general_advice": "Evidence-based recovery and consistency advice"
    }}
    """
    
    completion = _groq_call_with_fallback(
        client,
        [{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.3,
        max_tokens=800
    )
    raw = completion.choices[0].message.content.strip()
    data = json.loads(raw)
    if "workout_plan" in data and isinstance(data["workout_plan"], dict):
        data = data["workout_plan"]
    elif "plan" in data and isinstance(data["plan"], dict):
        data = data["plan"]
    return WorkoutPlanData(**data)

class GeminiWrapper:
    def __init__(self, model_name):
        self.client = genai.Client(api_key=os.getenv("GEMINI_API_KEY") or "mock")
        self.model = model_name

    def generate_content(self, prompt):
        return self.client.models.generate_content(
            model=self.model,
            contents=prompt
        )

def get_gemini_model():
    """Get the active Gemini model supported by current API."""
    return GeminiWrapper('gemini-2.5-flash')

def _generate_gemini_plan(user: Any, equipment: Any, eligible_exercises: List[Dict[str, Any]]) -> WorkoutPlanData:
    model = get_gemini_model()
    catalog_str = json.dumps([{"id": e["id"], "name": e["name"], "type": e["type"]} for e in eligible_exercises])
    
    prompt = f"""
    You are FitBuddy, an expert fitness coach. Create a {getattr(user, 'workout_days', 3)}-day weekly workout plan for a user.
    User Goal: {getattr(user, 'goal', 'general fitness')}
    Experience Level: {getattr(user, 'experience_level', 'beginner')}
    Minutes per session: {getattr(user, 'minutes_per_session', 30)}
    Preferences: {getattr(user, 'preferences', 'none')}
    Equipment Available: {getattr(equipment, 'equipment_list', 'bodyweight')}
    
    You MUST ONLY use exercises from this eligible catalog:
    {catalog_str}
    
    Respond STRICTLY in valid JSON matching this schema:
    {{
      "sessions": [
        {{
          "day": 1,
          "warmup": ["string"],
          "exercises": [
            {{
              "id": "must match an id from the catalog",
              "name": "name of exercise",
              "sets": 3,
              "reps": 10, 
              "duration_seconds": null,
              "rest_seconds": 60,
              "notes": "brief form tip"
            }}
          ],
          "cooldown": ["string"],
          "estimated_time_minutes": 45, // MUST accurately calculate total time based on sets, reps, rests, warmup, and cooldown
          "explanation": "brief reason for this session"
        }}
      ],
      "general_advice": "brief weekly advice"
    }}
    """
    
    response = model.generate_content(prompt)
    text = response.text.strip()
    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
        
    data = json.loads(text.strip())
    return WorkoutPlanData(**data)

def _detect_equipment_in_text(text: str) -> List[str]:
    equipment = []
    text_lower = text.lower()
    if "dumbbell" in text_lower:
        equipment.append("Dumbbells")
    if "bench" in text_lower:
        equipment.append("Bench")
    if "mat" in text_lower or "yoga" in text_lower:
        equipment.append("Exercise mat")
    if "band" in text_lower or "resistance" in text_lower:
        equipment.append("Resistance bands")
    if "pull up" in text_lower or "pull-up" in text_lower:
        equipment.append("Pull-up bar")
    if "kettlebell" in text_lower:
        equipment.append("Kettlebell")
    return equipment

def _conversational_offline_engine(chat_history: List[Dict[str, str]], mode: str = "fitness") -> Dict[str, Any]:
    last_message = chat_history[-1]["content"].strip()
    msg_lower = last_message.lower()
    
    all_user_text = " ".join([m["content"] for m in chat_history if m["role"] == "user"])
    detected_equip = _detect_equipment_in_text(all_user_text)
    
    if any(q in msg_lower for q in ["hear me", "can you hear", "test", "testing", "mic check", "are you there"]):
        return {
            "text": "Yes, I hear you loud and clear! I'm FitBuddy, your equipment-aware fitness coach. What workout goals or equipment are we working with today?",
            "suggestions": ["I have dumbbells", "Bodyweight only", "Full gym setup", "Build muscle"]
        }
        
    if any(q in msg_lower for q in ["hello", "hi", "hey", "who are you", "what can you do", "what is your name"]):
        return {
            "text": "Hey there! I'm FitBuddy, your AI fitness coach. I can design customized workout plans based on the equipment you actually have. Tell me what gear you have around, or ask me any workout question!",
            "suggestions": ["Build muscle", "Lose weight", "I only have dumbbells", "Plan a 3-day split"]
        }

    if any(q in msg_lower for q in ["harder", "make it harder", "intensity", "more challenging", "more difficult", "too easy"]):
        return {
            "text": "To ramp up the challenge, we can increase training volume with extra sets, shorten your rest periods, or incorporate supersets and drop sets. Which direction would you prefer?",
            "suggestions": ["Increase volume & sets", "Shorter rest periods", "Supersets & drop sets", "Heavier weight"]
        }

    if any(q in msg_lower for q in ["swap", "replace", "substitute", "different exercise", "change exercise"]):
        return {
            "text": "We can easily swap exercises! Would you like a dumbbell variation, a bodyweight alternative, or a lower-impact movement?",
            "suggestions": ["Swap for dumbbells", "Bodyweight alternative", "Low impact variation", "Focus on arms"]
        }

    if any(q in msg_lower for q in ["rest day", "recovery", "rest"]):
        return {
            "text": "Rest is crucial for rebuilding muscle! Do you prefer active recovery like walking and mobility, or a complete rest day?",
            "suggestions": ["Active recovery & walking", "Complete rest day", "Mobility & stretching"]
        }
        
    if any(q in msg_lower for q in ["plan", "workout", "routine", "exercise", "give me", "create", "start", "training", "program"]):
        eligible = get_eligible_exercises(user_equipment=detected_equip)
        if not eligible:
            eligible = [e for e in EXERCISE_CATALOG if not e.get("required_equipment")]
            
        if mode == "nutrition":
            plan = _generate_mock_meal_plan(None)
            return {
                "text": "I've created a personalized meal plan for you! Check out your nutrition guide on the right. Bon appétit!",
                "plan_data": plan,
                "suggestions": ["Higher protein meals", "Quick meal prep", "Add healthy snacks", "Adjust calories"]
            }
        else:
            plan = _generate_mock_plan(None, eligible)
            equip_str = ", ".join(detected_equip) if detected_equip else "bodyweight only"
            return {
                "text": f"I've created a personalized workout plan for you using {equip_str}! Check out your routine and coaching tips on the right. Let's get moving!",
                "plan_data": plan,
                "suggestions": ["Make it harder", "Swap an exercise", "Add a 4th day", "Focus on arms"]
            }
        
    new_equip = _detect_equipment_in_text(msg_lower)
    if new_equip or any(q in msg_lower for q in ["no equipment", "bodyweight", "nothing", "home"]):
        if new_equip:
            gear = ", ".join(new_equip)
            return {
                "text": f"Got it, {gear}! That's plenty to get a great session in. Would you like a full-body workout or should we focus on a specific muscle group?",
                "suggestions": ["Full-body workout", "Chest & Triceps", "Back & Biceps", "Leg day"]
            }
        else:
            return {
                "text": "Bodyweight workouts are fantastic for building functional strength, endurance, and mobility! Ready for me to generate your bodyweight plan?",
                "suggestions": ["Generate bodyweight plan", "Push Pull Legs", "High intensity circuit"]
            }
            
    if "push up" in msg_lower or "pushup" in msg_lower:
        return {
            "text": "For clean push-ups, keep your body in a straight plank, tuck your elbows at a 45-degree angle, and lower your chest until it almost touches the floor. Push up explosively!",
            "suggestions": ["Diamond push-ups", "Decline push-ups", "How many reps?", "Chest workout"]
        }
    if "squat" in msg_lower:
        return {
            "text": "For great squat form, keep your chest proud, feet shoulder-width apart, and sit back into your hips while tracking your knees over your toes. Drive up through your heels.",
            "suggestions": ["Goblet squats", "Bulgarian split squats", "Fix knee discomfort", "Leg day routine"]
        }
    if "plank" in msg_lower:
        return {
            "text": "When holding a plank, brace your abs like you're taking a punch, squeeze your glutes, and keep a straight line from your shoulders down to your heels.",
            "suggestions": ["Side planks", "Plank jacks", "Core workout routine", "Increase duration"]
        }
    if "cardio" in msg_lower or "lose weight" in msg_lower or "fat" in msg_lower:
        return {
            "text": "For fat loss and cardio health, combine regular resistance training with daily steps and a moderate caloric deficit. Consistency wins every time!",
            "suggestions": ["HIIT workout", "Steady state cardio", "Caloric deficit guide", "Daily step routine"]
        }
    if "muscle" in msg_lower or "bulk" in msg_lower or "gains" in msg_lower:
        return {
            "text": "To build muscle, focus on progressive overload with 8 to 12 challenging reps per set, eat plenty of protein, and make sure you get 7 to 9 hours of quality sleep.",
            "suggestions": ["Hypertrophy rep ranges", "High protein meal plan", "Progressive overload guide"]
        }
        
    if any(q in msg_lower for q in ["thank", "thanks", "awesome", "great", "cool", "let's go", "ready", "good"]):
        return {
            "text": "You're very welcome! I'm here whenever you need form tips, workout motivation, or plan adjustments. Just tap Push to Talk!",
            "suggestions": ["Make plan harder", "Swap an exercise", "Plan a 3-day split"]
        }
        
    clean_msg = last_message.rstrip(".?!")
    return {
        "text": f"I heard you say '{clean_msg}'. As your fitness coach, I'm here to build routines tailored to your equipment and goals. What equipment do you have ready, or what exercises would you like to do?",
        "suggestions": ["I have dumbbells", "Bodyweight only", "Full gym setup", "Build muscle"]
    }

def _generate_groq_dynamic_plan_from_chat(chat_history: List[Dict[str, str]], mode: str = "fitness") -> Union[WorkoutPlanData, MealPlanData]:
    client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    history_str = "\n".join([f"{msg['role'].capitalize()}: {msg['content']}" for msg in chat_history])
    user_msgs = [msg['content'] for msg in chat_history if msg['role'] == 'user']
    search_query = user_msgs[-1] if user_msgs else "best workout routine"
    
    online_findings = search_online_fitness(search_query, max_results=2)
    
    if mode == "nutrition":
        prompt = f"""
        You are MealBuddy, an expert AI nutrition coach.
        Based on our conversation history and live online research below, dynamically generate a structured daily meal plan.
        
        Conversation History:
        {history_str}
        
        Live Online Research Insights:
        {online_findings if online_findings else "Utilize current nutritional science."}
        
        CRITICAL INSTRUCTION: If the user is asking for a "different", "new", or "changed" plan, you MUST select completely different meals compared to what was discussed previously in the chat history. Provide a novel variation!
        
        PLAN LENGTH RULES:
        1. If the user asks for a specific number of days (e.g., "4-day plan", "3 days"), you MUST generate EXACTLY that number of days in the array.
        2. If the user asks for a plan exceeding 7 days (e.g., "30-day plan"), you MUST generate a maximum of a 7-day plan. Under no circumstances can you output more than 7 days.
        3. If the user asks for a general meal plan without specifying days (e.g., "give me a meal plan", "create a diet for me"), default to a 7-day plan.
        4. If the user asks for a single day (e.g., "what should I eat today"), generate ONLY a 1-day plan.
        5. For each day, the `explanation` field MUST summarize the goal of that day (e.g., "High Protein", "Low Carb", "Cheat Day"). Do not leave it blank.
        
        Respond STRICTLY in valid JSON matching this schema:
        {{
          "days": [
            {{
              "day": 1,
              "breakfast": ["Oatmeal with berries (300 kcal)", "Black coffee"],
              "meals": [
                {{
                  "id": "meal_1",
                  "name": "Grilled Chicken Salad",
                  "calories": 450,
                  "protein": 40,
                  "carbs": 20,
                  "fat": 15,
                  "notes": "Use light dressing"
                }}
              ],
              "snacks": ["Apple and almonds"],
              "total_calories": 2000,
              "explanation": "High protein focus"
            }}
          ],
          "general_advice": "Drink lots of water"
        }}
        """
    else:
        prompt = f"""
        You are FitBuddy, an expert AI fitness coach with live internet search capabilities.
        Based on our conversation history and live online research below, dynamically generate a structured workout session plan.
        Tailor exercises to the user's requested muscle groups, equipment, and fitness level.
        
        Conversation History:
        {history_str}
        
        Live Online Research Insights:
        {online_findings if online_findings else "Utilize current exercise science and optimal hypertrophy/strength protocols."}
        
        CRITICAL INSTRUCTION: If the user is asking for a "different", "new", or "changed" plan, you MUST select completely different exercises and/or structure compared to what was discussed previously in the chat history. Provide a novel variation!
        CRITICAL INSTRUCTION: If the user specified an experience level (beginner, intermediate, professional) in the chat history, you MUST strictly adjust the exercises, sets, reps, and explanations to match that level (e.g., fundamentals for beginners, advanced techniques for professionals).
        
        PLAN LENGTH RULES:
        1. If the user asks for a weekly schedule (e.g., "4 days workout with 3 rest days"), generate exactly a 7-day plan. CRITICAL: You MUST strictly count your generated sessions. Ensure the number of active workout days EXACTLY matches what the user requested (e.g., 4), and the number of "Rest Day" sessions EXACTLY matches what they requested (e.g., 3). Do not output extra workout days.
        2. If the user asks for a specific number of days (e.g., "4-day plan") without mentioning rest days, generate EXACTLY that number of sessions in the array.
        3. For rest days, include a session with explanation "Rest Day". If the user requested "active rest", include light mobility exercises; if "complete rest", leave the exercises array completely empty.
        4. If the user asks for a plan exceeding 7 days (e.g., "30-day plan"), generate a maximum of a 7-day plan.
        5. If the user asks for a general plan without specifying days, default to a 7-day plan.
        6. For each session, the `explanation` field MUST describe the muscle target for that day (e.g., "Chest & Triceps", "Legs", or "Rest Day"). Do not leave it blank.

        Do NOT restrict yourself to any static list. Select the best, scientifically validated exercises from the web for the user's equipment and targets.
        
        Respond STRICTLY in valid JSON matching this schema:
        {{
          "sessions": [
            {{
              "day": 1,
              "warmup": ["Dynamic arm circles (30s)", "Light cardio (2 mins)"],
              "exercises": [
                {{
                  "id": "ex_1",
                  "name": "Exercise Name",
                  "sets": 3,
                  "reps": "10-12",
                  "duration_seconds": null,
                  "rest_seconds": 60,
                  "notes": "Coaching form tip"
                }}
              ],
              "cooldown": ["Static stretches (2 mins)"],
              "estimated_time_minutes": 45,
              "explanation": "Chest & Triceps"
            }}
          ],
          "general_advice": "Key coaching tip for consistency and safety"
        }}
        """
    
    completion = _groq_call_with_fallback(
        client,
        [{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.7,
        max_tokens=4000
    )
        
    raw = completion.choices[0].message.content.strip()
    data = json.loads(raw)
    if "workout_plan" in data and isinstance(data["workout_plan"], dict):
        data = data["workout_plan"]
    elif "plan" in data and isinstance(data["plan"], dict):
        data = data["plan"]
        
    return MealPlanData(**data) if mode == "nutrition" else WorkoutPlanData(**data)

def _generate_gemini_dynamic_plan_from_chat(chat_history: List[Dict[str, str]], mode: str = "fitness") -> Union[WorkoutPlanData, MealPlanData]:
    model = get_gemini_model()
    history_str = "\n".join([f"{msg['role'].capitalize()}: {msg['content']}" for msg in chat_history])
    user_msgs = [msg['content'] for msg in chat_history if msg['role'] == 'user']
    search_query = user_msgs[-1] if user_msgs else "best workout routine"
    online_findings = search_online_fitness(search_query, max_results=2)
    
    if mode == "nutrition":
        prompt = f"""
        You are MealBuddy, an expert AI nutrition coach.
        Based on our conversation history and online research below, dynamically generate a structured daily meal plan in JSON format.
        
        Conversation History:
        {history_str}
        
        Live Online Research Insights:
        {online_findings if online_findings else "Utilize current nutritional science."}
        
        PLAN LENGTH RULES:
        1. If the user asks for a specific number of days (e.g., "4-day plan", "3 days"), you MUST generate EXACTLY that number of days in the array.
        2. If the user asks for a plan exceeding 7 days (e.g., "30-day plan"), you MUST generate a maximum of a 7-day plan. Under no circumstances can you output more than 7 days.
        3. If the user asks for a general meal plan without specifying days (e.g., "give me a meal plan", "create a diet for me"), default to a 7-day plan.
        4. If the user asks for a single day (e.g., "what should I eat today"), generate ONLY a 1-day plan.
        5. For each day, the `explanation` field MUST summarize the goal of that day (e.g., "High Protein", "Low Carb", "Cheat Day"). Do not leave it blank.
        
        Respond STRICTLY in valid JSON matching this schema:
        {{
          "days": [
            {{
              "day": 1,
              "breakfast": ["Oatmeal with berries (300 kcal)", "Black coffee"],
              "meals": [
                {{
                  "id": "meal_1",
                  "name": "Grilled Chicken Salad",
                  "calories": 450,
                  "protein": 40,
                  "carbs": 20,
                  "fat": 15,
                  "notes": "Use light dressing"
                }}
              ],
              "snacks": ["Apple and almonds"],
              "total_calories": 2000,
              "explanation": "High protein focus"
            }}
          ],
          "general_advice": "Drink lots of water"
        }}
        """
    else:
        prompt = f"""
        You are FitBuddy, an expert AI fitness coach with live internet access.
        Based on our conversation history and online research below, dynamically generate a structured workout session plan in JSON format.
        
        Conversation History:
        {history_str}
        
        Live Online Research Insights:
        {online_findings if online_findings else "Utilize evidence-based fitness science."}
        
        CRITICAL INSTRUCTION: If the user is asking for a "different", "new", or "changed" plan, you MUST select completely different exercises and/or structure compared to what was discussed previously in the chat history. Provide a novel variation!
        CRITICAL INSTRUCTION: If the user specified an experience level (beginner, intermediate, professional) in the chat history, you MUST strictly adjust the exercises, sets, reps, and explanations to match that level (e.g., fundamentals for beginners, advanced techniques for professionals).
        
        PLAN LENGTH RULES:
        1. If the user asks for a weekly schedule (e.g., "4 days workout with 3 rest days"), generate exactly a 7-day plan. CRITICAL: You MUST strictly count your generated sessions. Ensure the number of active workout days EXACTLY matches what the user requested (e.g., 4), and the number of "Rest Day" sessions EXACTLY matches what they requested (e.g., 3). Do not output extra workout days.
        2. If the user asks for a specific number of days (e.g., "4-day plan") without mentioning rest days, generate EXACTLY that number of sessions in the array.
        3. For rest days, include a session with explanation "Rest Day". If the user requested "active rest", include light mobility exercises; if "complete rest", leave the exercises array completely empty.
        4. If the user asks for a plan exceeding 7 days (e.g., "30-day plan"), generate a maximum of a 7-day plan.
        5. If the user asks for a general plan without specifying days, default to a 7-day plan.
        6. For each session, the `explanation` field MUST describe the muscle target for that day (e.g., "Chest & Triceps", "Legs", or "Rest Day"). Do not leave it blank.
        
        Respond STRICTLY in valid JSON matching this schema:
        {{
          "sessions": [
            {{
              "day": 1,
              "warmup": ["string"],
              "exercises": [
                {{
                  "id": "ex_1",
                  "name": "Exercise Name",
                  "sets": 3,
                  "reps": "10-12",
                  "duration_seconds": null,
                  "rest_seconds": 60,
                  "notes": "Form tip"
                }}
              ],
              "cooldown": ["string"],
              "estimated_time_minutes": 45,
              "explanation": "Chest & Triceps"
            }}
          ],
          "general_advice": "Key coaching tip"
        }}
        """
    
    response = model.generate_content(prompt)
    text = response.text.strip()
    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    data = json.loads(text.strip())
    if "workout_plan" in data and isinstance(data["workout_plan"], dict):
        data = data["workout_plan"]
    elif "plan" in data and isinstance(data["plan"], dict):
        data = data["plan"]
    return MealPlanData(**data) if mode == "nutrition" else WorkoutPlanData(**data)

def _get_system_prompt_for_mode(mode: str) -> str:
    if mode == "nutrition":
        return """You are MealBuddy — a highly knowledgeable, energetic, and conversational AI nutrition and diet coach.

Your personality:
- You speak naturally and warmly, like a real chef or dietitian talking to a client.
- You respond DIRECTLY to exactly what the user just said — never give generic filler.
- You have a great memory: you track everything from the conversation.
- You give SPECIFIC, actionable advice on food, macros, and diet.

CRITICAL DOMAIN RESTRICTION:
- You are STRICTLY a nutrition and diet coach. 
- You MUST ONLY answer questions related to food, cooking, diet, macros, and meal planning. 
- If the user asks about workouts, gym routines, lifting, exercises, or anything physical, YOU MUST POLITELY DECLINE. Tell them you are a chef/nutrition coach and suggest they click the 'Workout' tab at the top of the screen to talk to FitBuddy for exercise advice. Do NOT give them a workout plan.
"""
    
    return """You are FitBuddy — a highly knowledgeable, energetic, and conversational AI fitness coach.

Your personality:
- You speak naturally and warmly, like a real personal trainer talking to a client.
- You respond DIRECTLY to exactly what the user just said — never give generic filler.
- You have a great memory: you track everything from the conversation (equipment mentioned, muscle groups, goals, level).
- You give SPECIFIC, actionable advice — not vague platitudes.

CRITICAL DOMAIN RESTRICTION:
- You are STRICTLY a fitness and gym coach. 
- You MUST ONLY answer questions related to fitness, workouts, exercises, recovery, and gym equipment. 
- If the user asks about food, diet, macros, cooking, or meal plans, YOU MUST POLITELY DECLINE. Tell them you are a gym coach and suggest they click the 'Nutrition' tab at the top of the screen to talk to MealBuddy for diet advice. Do NOT give them a meal plan.
"""


def _get_voice_rules_for_mode(mode: str) -> str:
    if mode == "nutrition":
        return """
Voice rules (replies will be read aloud via text-to-speech):
- Keep responses to 1-3 focused sentences. Be punchy, clear, energetic.
- Never use bullet points, markdown, or lists in your spoken reply.
- If a user mentions a specific food or diet, give a KEY nutritional tip immediately.
- If a user asks for a meal plan or daily meals, DO NOT list out all the meals, calories, or recipes in your spoken response. You MUST use the visual plan interface instead!
- If a user asks for a meal plan exceeding 7 days, you MUST politely inform them that you can only generate a maximum of a 7-day plan, and then proceed to generate a 7-day plan for them.

CRITICAL SYSTEM INSTRUCTION regarding Meal Plans:
You have a connected app interface that can display a meal plan visually to the user.
Whenever the user asks you to:
1. Create a meal plan
2. Make a diet routine
3. Change their current meal plan
4. Give them a new day of meals
5. Update or modify an existing plan (e.g., changing the number of days, swapping foods, adjusting macros, changing budget).
6. Or any variation of asking for a list of what to eat.

You MUST NOT speak the meal plan. Instead, you MUST, WITHOUT FAIL, append this exact string to the very end of your response:
[GENERATE_PLAN]

Example: 'Let\'s switch gears and build some serious muscle with a high-protein diet! Click the "Your Meal Plan" button to view it. [GENERATE_PLAN]'

- CRITICAL SUGGESTION PILLS INSTRUCTION:
At the very end of your response, ALWAYS provide 2 to 4 concise, context-aware suggestion pills (1-4 words each) representing the exact options or follow-ups the user would want next based on your response and question.
Format strictly at the very end as:
[SUGGESTIONS: Option 1 | Option 2 | Option 3]
Examples:
- If you ask about meal goals or preferences: [SUGGESTIONS: High protein | Low carb | Quick meal prep | Under 500 kcal]
- If you just generated a meal plan: [SUGGESTIONS: More protein | Easy prep tips | Adjust macros | Add healthy snacks]
- If you ask about budget or ingredients: [SUGGESTIONS: Budget friendly | Chicken & rice | Plant based | No dairy]

Do NOT add the tag for simple food tips or single recipe questions.
Never say "I heard you say..." — respond naturally as a chef would."""
    
    return """
Voice rules (replies will be read aloud via text-to-speech):
- Keep responses to 1-3 focused sentences. Be punchy, clear, energetic.
- Never use bullet points, markdown, or lists in your spoken reply.
- If a user mentions a specific exercise (e.g., bench press, squat), give a KEY form cue immediately.
- If a user asks for a workout plan or routine, DO NOT list the exercises, sets, or reps in your spoken response. You MUST use the visual plan interface instead!
- If a user asks for a workout plan exceeding 7 days, you MUST politely inform them that you can only generate a maximum of a 7-day plan, and then proceed to generate a 7-day plan for them.
- If a user asks for a workout plan and hasn't told you their experience level, you MUST first ask if they are a beginner, intermediate, or professional. Do NOT output [GENERATE_PLAN] until they have answered this question.
- If a user asks to include rest days in their plan, you MUST first ask them to clarify if they want "active rest" (no heavy lifting) or "complete rest" (doing nothing). Do NOT output [GENERATE_PLAN] until they have answered this question.

CRITICAL SYSTEM INSTRUCTION regarding Workout Plans:
You have a connected app interface that can display a workout plan visually to the user.
Whenever the user asks you to:
1. Create a workout plan
2. Make a routine
3. Change their current workout plan
4. Give them a new day (e.g. "give me a leg day", "give me an arm plan")
5. Update or modify an existing plan (e.g., changing the number of days, swapping exercises, adjusting difficulty).
6. Or any variation of asking for a list of exercises to do.
7. When the user answers your clarification questions (e.g., about rest days or experience level).

You MUST NOT speak the routine. Instead, you MUST, WITHOUT FAIL, append this exact string to the very end of your response:
[GENERATE_PLAN]

Example: 'Sure thing, here is a David Laid style 3-day arm split! Click the "Your Workout" button to view it. [GENERATE_PLAN]'

- CRITICAL SUGGESTION PILLS INSTRUCTION:
At the very end of your response, ALWAYS provide 2 to 4 concise, context-aware suggestion pills (1-4 words each) representing the exact options or follow-ups the user would want next based on your response and question.
Format strictly at the very end as:
[SUGGESTIONS: Option 1 | Option 2 | Option 3]
Examples:
- If you ask about experience level: [SUGGESTIONS: Beginner | Intermediate | Professional]
- If you ask about making a routine harder: [SUGGESTIONS: Add more volume | Increase intensity | Advanced techniques | Chest & Triceps]
- If you ask which muscle group or day: [SUGGESTIONS: Chest & Triceps | Back & Biceps | Leg day | Shoulders]
- If you ask about rest days: [SUGGESTIONS: Active rest | Complete rest]
- If the user asks about an exercise or form: [SUGGESTIONS: How many sets & reps? | Alternative exercise | Form cues | Next workout]
Never say "I heard you say..." — respond naturally as a coach would."""

def _extract_suggestions_from_text(text: str) -> tuple[str, List[str]]:
    suggestions = []
    match = re.search(r'\[SUGGESTIONS:\s*(.*?)\]', text, re.IGNORECASE)
    if match:
        raw_items = match.group(1).split('|')
        suggestions = [item.strip().strip('"').strip("'") for item in raw_items if item.strip()]
        text = re.sub(r'\[SUGGESTIONS:\s*.*?\]', '', text, flags=re.IGNORECASE).strip()
    return text, suggestions

def _generate_groq_chat(chat_history: List[Dict[str, str]], mode: str = "fitness") -> Dict[str, Any]:
    client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    
    # Run live web research — always search to keep answers fresh and non-static
    last_msg = chat_history[-1]["content"]
    online_context = search_online_fitness(last_msg, max_results=2)

    system_prompt = _get_system_prompt_for_mode(mode) + _get_voice_rules_for_mode(mode)

    if online_context:
        system_prompt += f"\n\nLatest fitness research you can reference:\n{online_context}"
    
    # Build messages — map "assistant" correctly, skip any non-standard roles
    messages = [{"role": "system", "content": system_prompt}]
    for msg in chat_history:
        role = msg["role"]
        if role not in ("user", "assistant"):
            continue
        messages.append({"role": role, "content": msg["content"]})
        
    # Final strict reminder to prevent the LLM from forgetting the tag
    messages.append({
        "role": "system",
        "content": "CRITICAL REMINDER: If the user just asked you to create, modify, update, or change a plan, you MUST append the exact string [GENERATE_PLAN] at the very end of your response. Also append [SUGGESTIONS: Option 1 | Option 2 | Option 3] with 2-4 relevant options for what the user wants next!"
    })
        
    completion = _groq_call_with_fallback(client, messages, temperature=0.75, max_tokens=300)
    raw_text = completion.choices[0].message.content.strip()
    text, suggestions = _extract_suggestions_from_text(raw_text)
    
    if "[GENERATE_PLAN]" in text:
        clean_text = text.replace("[GENERATE_PLAN]", "").strip()
        if not clean_text:
            if mode == 'nutrition':
                clean_text = 'I\'ve created a new personalized meal plan for you! Click the "Your Meal Plan" button to view it.'
            else:
                clean_text = 'I\'ve created a new personalized workout plan for you! Click the "Your Workout" button to view it.'
            
        try:
            plan = _generate_groq_dynamic_plan_from_chat(chat_history, mode)
            return {"text": clean_text, "plan_data": plan, "suggestions": suggestions}
        except Exception as e:
            print(f"Error dynamically generating Groq plan: {e}")
            all_user_text = " ".join([m["content"] for m in chat_history if m["role"] == "user"])
            detected_equip = _detect_equipment_in_text(all_user_text)
            eligible = get_eligible_exercises(user_equipment=detected_equip)
            if mode == 'nutrition':
                plan = _generate_mock_meal_plan(None)
                return {"text": clean_text, "plan_data": plan, "suggestions": suggestions}
            else:
                if not eligible:
                    eligible = [e for e in EXERCISE_CATALOG if not e.get("required_equipment")]
                plan = _generate_mock_plan(None, eligible)
                return {"text": clean_text, "plan_data": plan, "suggestions": suggestions}
        
    return {"text": text, "suggestions": suggestions}

def _generate_gemini_chat(chat_history: List[Dict[str, str]], mode: str = "fitness") -> Dict[str, Any]:
    model = get_gemini_model()
    
    history_str = "\n".join([f"{msg['role'].capitalize()}: {msg['content']}" for msg in chat_history])
    
    prompt = f"""
    {_get_system_prompt_for_mode(mode)}
    
    You are speaking with the user through voice synthesis (text-to-speech).
    Keep your replies concise, natural, and direct (1 to 3 sentences max) so they sound great when read aloud.
    Directly address and answer what the user asked or said.
    
    Conversation history:
    {history_str}
    
    Respond directly to the last message, continuing the persona:
    
    {_get_voice_rules_for_mode(mode)}
    
    CRITICAL REMINDER: If the user just asked you to create, modify, update, or change a plan, you MUST append the exact string [GENERATE_PLAN] at the very end of your response. Also append [SUGGESTIONS: Option 1 | Option 2 | Option 3] with 2-4 relevant options for what the user wants next!
    """
    
    response = model.generate_content(prompt)
    raw_text = response.text.strip()
    text, suggestions = _extract_suggestions_from_text(raw_text)
    
    if "[GENERATE_PLAN]" in text:
        clean_text = text.replace("[GENERATE_PLAN]", "").strip()
        if not clean_text:
            if mode == 'nutrition':
                clean_text = 'I\'ve created a new personalized meal plan for you! Click the "Your Meal Plan" button to view it.'
            else:
                clean_text = 'I\'ve created a new personalized workout plan for you! Click the "Your Workout" button to view it.'
            
        try:
            plan = _generate_gemini_dynamic_plan_from_chat(chat_history, mode)
            return {"text": clean_text, "plan_data": plan, "suggestions": suggestions}
        except Exception as e:
            print(f"Error dynamically generating Gemini plan: {e}")
            all_user_text = " ".join([m["content"] for m in chat_history if m["role"] == "user"])
            detected_equip = _detect_equipment_in_text(all_user_text)
            eligible = get_eligible_exercises(user_equipment=detected_equip)
            if mode == 'nutrition':
                plan = _generate_mock_meal_plan(None)
                return {"text": clean_text, "plan_data": plan, "suggestions": suggestions}
            else:
                if not eligible:
                    eligible = [e for e in EXERCISE_CATALOG if not e.get("required_equipment")]
                plan = _generate_mock_plan(None, eligible)
                return {"text": clean_text, "plan_data": plan, "suggestions": suggestions}
        
    return {"text": text, "suggestions": suggestions}

def generate_conversational_response(chat_history: List[Dict[str, str]], mode: str = "fitness") -> Dict[str, Any]:
    provider = get_ai_provider()
    
    if provider == "groq" and GROQ_AVAILABLE:
        try:
            return _generate_groq_chat(chat_history, mode)
        except Exception as e:
            print(f"Groq chat error: {e}. Falling back to conversational dialogue engine.")
            return _conversational_offline_engine(chat_history, mode)
            
    if provider == "gemini" and GENAI_AVAILABLE:
        try:
            return _generate_gemini_chat(chat_history, mode)
        except Exception as e:
            print(f"Gemini live error: {e}. Falling back to conversational dialogue engine.")
            return _conversational_offline_engine(chat_history, mode)
            
    return _conversational_offline_engine(chat_history, mode)
