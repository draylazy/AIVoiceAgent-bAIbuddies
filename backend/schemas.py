from pydantic import BaseModel, Field
from typing import List, Optional, Any

class UserBase(BaseModel):
    display_name: str
    age_confirmed: bool
    goal: str
    experience_level: str
    workout_days: int = 3
    minutes_per_session: int = 30
    preferences: Optional[str] = None
    avoid_movements: Optional[str] = None

class UserCreate(UserBase):
    pass

class UserResponse(UserBase):
    id: int

    class Config:
        from_attributes = True

class EquipmentProfileBase(BaseModel):
    name: str
    equipment_list: str # Stored as JSON string
    space_limitations: Optional[str] = None

class EquipmentProfileCreate(EquipmentProfileBase):
    pass

class EquipmentProfileResponse(EquipmentProfileBase):
    id: int
    user_id: int

    class Config:
        from_attributes = True

from typing import List, Optional, Any, Union

class ExerciseSchema(BaseModel):
    id: str = "exercise"
    name: str
    sets: Optional[Union[int, str]] = None
    reps: Optional[Union[int, str]] = None
    duration_seconds: Optional[Union[int, str]] = None
    rest_seconds: Optional[Union[int, str]] = 60
    notes: Optional[str] = None

class WorkoutSessionSchema(BaseModel):
    day: Union[int, str] = 1
    warmup: Union[List[str], str] = Field(default_factory=list)
    exercises: List[ExerciseSchema]
    cooldown: Union[List[str], str] = Field(default_factory=list)
    estimated_time_minutes: Union[int, str] = 30
    explanation: str = "Personalized dynamic workout session"

class WorkoutPlanData(BaseModel):
    sessions: List[WorkoutSessionSchema]
    general_advice: Union[str, List[str]] = "Focus on form, hydration, and steady progress."

class MealSchema(BaseModel):
    id: str = "meal"
    name: str
    calories: Optional[Union[int, str]] = None
    protein: Optional[Union[int, str]] = None
    carbs: Optional[Union[int, str]] = None
    fat: Optional[Union[int, str]] = None
    notes: Optional[str] = None

class DailyMealPlanSchema(BaseModel):
    day: Union[int, str] = 1
    breakfast: Union[List[str], str] = Field(default_factory=list)
    meals: List[MealSchema]
    snacks: Union[List[str], str] = Field(default_factory=list)
    total_calories: Union[int, str] = 2000
    explanation: str = "Personalized daily meal plan"

class MealPlanData(BaseModel):
    days: List[DailyMealPlanSchema]
    general_advice: Union[str, List[str]] = "Focus on hydration and balanced macros."

class ChatMessage(BaseModel):
    role: str # "user" or "coach"
    content: str

class ChatRequest(BaseModel):
    message: str
    session_id: str
    mode: str = "fitness"

class ChatResponse(BaseModel):
    response: str
    audio_url: Optional[str] = None
    plan_data: Optional[Union[WorkoutPlanData, MealPlanData]] = None
    suggestions: Optional[List[str]] = None
