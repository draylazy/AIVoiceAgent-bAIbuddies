const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000'
    : window.location.origin;

const DEFAULT_CHAT_DATA = {
    fitness: [
        { role: "coach", text: "Hi there! I'm FitBuddy. Tell me what equipment you have and your fitness goals, and I'll create a plan for you!" },
        { role: "coach", text: "💡 Hint: Try asking for modifications, a harder version, or a plan for a specific goal." }
    ],
    nutrition: [
        { role: "coach", text: "Hi there! I'm MealBuddy. Tell me your goals and dietary preferences, and I'll create a plan for you!" },
        { role: "coach", text: "💡 Hint: Try asking for recipe ideas, macro adjustments, or a meal plan for a specific goal." }
    ]
};

let sessions = {
    fitness: "fit_" + Math.floor(Math.random() * 10000),
    nutrition: "nutri_" + Math.floor(Math.random() * 10000)
};

let chatData = JSON.parse(JSON.stringify(DEFAULT_CHAT_DATA));

let planDataStore = {
    fitness: null,
    nutrition: null
};

// Safe localStorage persistence (fail-safe wrapped in try/catch)
function loadStoredState() {
    try {
        const storedSessions = localStorage.getItem('fitbuddy_sessions');
        if (storedSessions) {
            const parsed = JSON.parse(storedSessions);
            if (parsed && typeof parsed === 'object') sessions = parsed;
        }

        const storedChat = localStorage.getItem('fitbuddy_chat_data');
        if (storedChat) {
            const parsedChat = JSON.parse(storedChat);
            if (parsedChat && Array.isArray(parsedChat.fitness) && Array.isArray(parsedChat.nutrition)) {
                chatData = parsedChat;
            }
        }

        const storedPlans = localStorage.getItem('fitbuddy_plan_data');
        if (storedPlans) {
            const parsedPlans = JSON.parse(storedPlans);
            if (parsedPlans && typeof parsedPlans === 'object') {
                planDataStore = parsedPlans;
            }
        }
    } catch (e) {
        console.warn("Could not load from localStorage:", e);
    }
}

function saveStoredState() {
    try {
        localStorage.setItem('fitbuddy_sessions', JSON.stringify(sessions));
        localStorage.setItem('fitbuddy_chat_data', JSON.stringify(chatData));
        localStorage.setItem('fitbuddy_plan_data', JSON.stringify(planDataStore));
    } catch (e) {
        console.warn("Could not save to localStorage:", e);
    }
}

loadStoredState();
// Speech APIs
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const synthesis = window.speechSynthesis;
let recognition = null;
let isListening = false;

// Speech Synthesis mobile unlock
let speechUnlocked = false;
function unlockSpeech() {
    if (!speechUnlocked && synthesis) {
        const u = new SpeechSynthesisUtterance("");
        u.volume = 0;
        synthesis.speak(u);
        speechUnlocked = true;
    }
}

function updateMicIcon(state) {
    if (state === "stop") {
        btnMic.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12"></rect></svg>`;
        btnMic.classList.add("mic-stop");
    } else {
        btnMic.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`;
        btnMic.classList.remove("mic-stop");
    }
}

// UI Elements
const coachArea = document.getElementById("coach-area");
const coachStatus = document.getElementById("coach-status");
const btnMic = document.getElementById("btn-mic");
const chatInput = document.getElementById("chat-input");
const btnSend = document.getElementById("btn-send");
const chatHistory = document.getElementById("chat-history");
const planDisplay = document.getElementById("plan-display");

let silenceTimer = null;
let finalTranscript = ''; // Store finalized sentences
let tempUserMsgWrapper = null;
let tempUserMsgBubble = null;

// Initialize Speech
if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true; // Keep listening until we stop it
    recognition.interimResults = true; // Show words as they are spoken
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        isListening = true;
        updateMicIcon("stop");
        btnMic.classList.add("mic-active");
        finalTranscript = ''; // Clear previous finalized text
        setAvatarState("listening");
        coachStatus.textContent = "Listening...";
        btnMic.style.opacity = "1";
        chatInput.value = "";
        btnSend.disabled = true;
        chatInput.disabled = true;
        document.querySelector('.dashboard-grid')?.classList.add('has-conversation');
        updateMobileHUD("user", "Listening...", true);

        // Create temporary message bubble
        tempUserMsgWrapper = document.createElement("div");
        tempUserMsgWrapper.className = `chat-msg-wrapper wrapper-user`;
        const avatar = document.createElement("div");
        avatar.className = `chat-avatar avatar-user`;
        avatar.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
        tempUserMsgBubble = document.createElement("div");
        tempUserMsgBubble.className = `chat-msg msg-user temp-msg`;
        tempUserMsgWrapper.appendChild(avatar);
        tempUserMsgWrapper.appendChild(tempUserMsgBubble);
        chatHistory.appendChild(tempUserMsgWrapper);
        chatHistory.scrollTop = chatHistory.scrollHeight;
    };

    recognition.onresult = (event) => {
        let interimTranscript = '';

        // Loop through the results starting from the current index
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript + " "; // Add space between sentences
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }

        // Get both finalized text and currently spoken text
        let fullText = (finalTranscript + interimTranscript).trim();
        updateMobileHUD("user", fullText ? (fullText + "...") : "Listening...", true);
        if (tempUserMsgBubble) {
            tempUserMsgBubble.textContent = fullText + "...";
            tempUserMsgBubble.dataset.fullText = fullText;
            chatHistory.scrollTop = chatHistory.scrollHeight;
        }

        // Reset the silence timer every time we hear a new word
        clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
            // 2 seconds of silence detected, stop listening and send
            if (isListening) {
                recognition.stop();
            }
        }, 2000);
    };

    recognition.onerror = (event) => {
        console.error("Speech recognition error", event.error);
        if (event.error === 'not-allowed' || event.error === 'audio-capture') {
            showToast("Microphone not detected or permission denied. Please check your microphone settings.", "error");
        }
        
        if (tempUserMsgWrapper) {
            tempUserMsgWrapper.remove();
            tempUserMsgWrapper = null;
            tempUserMsgBubble = null;
        }
        setAvatarState("error");
        coachStatus.textContent = "Microphone error";
        btnMic.classList.remove("mic-active");
        setTimeout(() => setAvatarState("idle"), 2000);
        clearTimeout(silenceTimer);
        btnSend.disabled = false;
        chatInput.disabled = false;
        resetChatControls();
    };

    recognition.onend = () => {
        isListening = false;
        btnMic.classList.remove("mic-active");
        clearTimeout(silenceTimer);
        btnSend.disabled = false;
        chatInput.disabled = false;

        let spokenText = "";
        if (tempUserMsgBubble && tempUserMsgBubble.dataset.fullText) {
            spokenText = tempUserMsgBubble.dataset.fullText;
        } else if (finalTranscript) {
            spokenText = finalTranscript.trim();
        }

        if (tempUserMsgWrapper) {
            tempUserMsgWrapper.remove();
            tempUserMsgWrapper = null;
            tempUserMsgBubble = null;
        }

        if (spokenText.trim() !== "") {
            updateMobileHUD("user", spokenText, false);
            chatInput.value = spokenText;
            setAvatarState("idle");
            coachStatus.textContent = "Sending...";
            setTimeout(() => btnSend.click(), 100);
        } else {
            resetChatControls();
        }
    };
} else {
    btnMic.disabled = true;
    btnMic.textContent = "Microphone not supported";
}

// We don't need amplitude interval anymore since audio visualizer is removed.

let idleTimeout = null;

function resetIdleTimer() {
    clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => {
        if (coachArea.className.includes('state-idle') && window.bullAvatar) {
            window.bullAvatar.react('random');
            resetIdleTimer(); // wait another 15s before the next random move
        }
    }, 15000); // 15 seconds of idle time
}

// Hook into the avatar.js click handler so user clicks also reset the idle timer
window.onAvatarAction = function (action) {
    if (action !== 'idle' && action !== 'talk') {
        resetIdleTimer();
    }
};

function setAvatarState(state) {
    coachArea.className = `coach-area state-${state}`;

    if (window.bullAvatar) {
        if (state === "listening") {
            window.bullAvatar.react('nod');
        } else if (state === "thinking") {
            window.bullAvatar.react('think'); // Use the new think animation!
        } else if (state === "speaking") {
            window.bullAvatar.react('talk');
        } else if (state === "idle" || state === "error") {
            window.bullAvatar.react('reset');
        } else if (state === "celebrate") {
            window.bullAvatar.react('jump');
        }
    }

    // Manage idle timer
    if (state === "idle") {
        resetIdleTimer();
    } else {
        clearTimeout(idleTimeout);
    }
}

function resetChatControls() {
    btnMic.style.opacity = "1";
    updateMicIcon("mic");
    chatInput.value = "";
    const isSpeaking = (currentAudio && !currentAudio.paused) || (synthesis && synthesis.speaking);
    if (!isSpeaking) {
        setAvatarState("idle");
        coachStatus.textContent = "Ready";
    }
}

function extractChoicesFromText(text) {
    if (!text) return null;
    const match = text.match(/(?:such as|like|prefer|choose|between|either)\s+([^.?!]+\?)/i) || 
                  text.match(/([A-Za-z0-9\s/-]+(?:,\s*[A-Za-z0-9\s/-]+)*\s+or\s+[A-Za-z0-9\s/-]+\?)/i);
    if (match) {
        let raw = match[1].replace(/\?$/, '').trim();
        raw = raw.replace(/^(either|both|between|any)\s+/i, '');
        const items = raw.split(/,\s*or\s+|,\s*|\s+or\s+/i)
            .map(s => s.trim().replace(/^(a|an|the)\s+/i, ''))
            .filter(s => s.length >= 2 && s.length <= 32 && !/^(which|what|how|why|when|who)\b/i.test(s));
        if (items.length >= 2 && items.length <= 4) {
            return items.map(item => item.charAt(0).toUpperCase() + item.slice(1));
        }
    }
    return null;
}

function getSuggestionsForCoachMessage(text, mode, lastUserPrompt = "") {
    if (!text) return [];
    const lower = text.toLowerCase();

    // 1. Direct user intent matching — suggestions must directly answer what the user asked/wants
    if (lastUserPrompt) {
        const uLower = lastUserPrompt.toLowerCase();
        if (uLower.includes('harder') || uLower.includes('intensity') || uLower.includes('difficult') || uLower.includes('challenge') || uLower.includes('too easy')) {
            return ["Increase volume & sets", "Shorter rest periods", "Supersets & drop sets", "Heavier weight"];
        }
        if (uLower.includes('swap') || uLower.includes('replace') || uLower.includes('substitute') || uLower.includes('different exercise')) {
            return ["Swap for dumbbells", "Bodyweight alternative", "Low impact variation", "Focus on arms"];
        }
        if (uLower.includes('rest day') || uLower.includes('recovery')) {
            return ["Active rest & walking", "Complete rest day", "Mobility & stretching"];
        }
        if (uLower.includes('dumbbell') || uLower.includes('home') || uLower.includes('equipment') || uLower.includes('gear')) {
            return ["Full-body workout", "Chest & Triceps", "Back & Biceps", "Leg day"];
        }
        if (uLower.includes('split') || uLower.includes('schedule') || (uLower.includes('day') && (uLower.includes('3') || uLower.includes('4') || uLower.includes('5')))) {
            return ["Push Pull Legs (PPL)", "Upper / Lower split", "3-Day Full Body", "Bro split"];
        }
        if (uLower.includes('cardio') || uLower.includes('fat') || uLower.includes('lose weight')) {
            return ["HIIT workout", "Steady state cardio", "Caloric deficit guide", "Daily 10k steps"];
        }
        if (mode === 'nutrition') {
            if (uLower.includes('protein') || uLower.includes('muscle')) {
                return ["High protein meals", "Protein shake recipe", "Macro breakdown", "Quick prep snacks"];
            }
            if (uLower.includes('diet') || uLower.includes('meal') || uLower.includes('eat') || uLower.includes('food')) {
                return ["Higher protein options", "Quick 15-min prep", "Under 500 calories", "Healthy snack ideas"];
            }
        }
    }

    // 2. Dynamic choice extraction from the coach question (e.g., "A, B, or C?")
    const dynamicChoices = extractChoicesFromText(text);
    if (dynamicChoices && dynamicChoices.length >= 2) {
        return dynamicChoices;
    }

    // 3. Experience level question
    if (lower.includes('beginner') && (lower.includes('intermediate') || lower.includes('professional') || lower.includes('advanced'))) {
        return ["Beginner", "Intermediate", "Professional"];
    }

    // 4. Rest days question (active vs complete rest)
    if (lower.includes('active rest') || lower.includes('complete rest')) {
        return ["Active rest", "Complete rest", "No rest days"];
    }

    // 5. Equipment question
    if (lower.includes('what equipment') || lower.includes('what gear') || lower.includes('what do you have') || lower.includes('gear do you have')) {
        if (mode === 'nutrition') {
            return ["Basic kitchen gear", "Air fryer & blender", "Full meal prep kitchen"];
        }
        return ["Dumbbells only", "Full gym equipment", "Bodyweight / no equipment", "Resistance bands & mat"];
    }

    // 6. Days split question
    if (lower.includes('how many days') || (lower.includes('split') && (lower.includes('day') || lower.includes('schedule')))) {
        return ["3 days a week", "4 days a week", "5 days a week"];
    }

    // 7. Goals question
    if (lower.includes('what are your goals') || lower.includes('fitness goals') || lower.includes('what are we training') || lower.includes('what are we eating today')) {
        if (mode === 'nutrition') {
            return ["Build muscle / high protein", "Fat loss & deficit", "Quick meal prep", "Clean eating"];
        }
        return ["Build muscle", "Lose body fat", "Increase strength", "Cardio & stamina"];
    }

    // 8. Plan was just generated or modified
    if (lower.includes('here is your plan') || lower.includes('plan for you') || lower.includes('created a plan') || lower.includes('routine') || lower.includes('click the "your workout"')) {
        if (mode === 'nutrition') {
            return ["Higher protein options", "Make it easier to prep", "Adjust my calories", "Add healthy snacks"];
        }
        return ["Make it harder", "Swap an exercise", "Add a 4th day", "Include warmups"];
    }

    // 9. Diet / food preferences (nutrition mode)
    if (mode === 'nutrition') {
        if (lower.includes('breakfast') || lower.includes('morning')) {
            return ["High protein breakfast", "Quick 5-min idea", "Smoothie recipe"];
        }
        if (lower.includes('dinner') || lower.includes('lunch')) {
            return ["High protein dinner", "Quick prep meal", "Low carb options"];
        }
        if (lower.includes('dietary') || lower.includes('allergies') || lower.includes('vegetarian')) {
            return ["Vegetarian", "High protein", "Low carb", "No dairy"];
        }
        return ["Make a full meal plan", "High protein snack ideas", "How many calories?", "Quick dinner recipe"];
    }

    // 10. Form tips / exercise cues
    if (lower.includes('form') || lower.includes('technique') || lower.includes('cue') || lower.includes('bench') || lower.includes('squat')) {
        return ["Give me another exercise", "How many sets & reps?", "Make it harder"];
    }

    // 11. Initial greeting / hints (do not duplicate pills in chat since they are already above)
    if (lower.includes("hi there") || lower.includes("hint:") || lower.includes("i'm fitbuddy") || lower.includes("i'm mealbuddy")) {
        return [];
    }

    // Default fallback
    return ["Make it harder", "Swap an exercise", "Plan a 3-day split", "Focus on arms"];
}

function resetMobileHUD(mode) {
    const heroInitialIntro = document.getElementById("hero-initial-intro");
    const heroActiveDialogue = document.getElementById("hero-active-dialogue");
    const userCard = document.getElementById("dialogue-user-card");
    const coachCard = document.getElementById("dialogue-coach-card");
    const dynamicPillsGroup = document.getElementById("dynamic-pills-group");
    const pillGroupFit = document.getElementById("pill-group-fit");
    const pillGroupMeal = document.getElementById("pill-group-meal");

    if (heroInitialIntro) heroInitialIntro.style.display = 'block';
    if (heroActiveDialogue) heroActiveDialogue.style.display = 'none';
    if (userCard) userCard.style.display = 'none';
    if (coachCard) coachCard.style.display = 'none';
    if (dynamicPillsGroup) {
        dynamicPillsGroup.style.display = 'none';
        dynamicPillsGroup.innerHTML = '';
    }
    if (pillGroupFit) pillGroupFit.style.display = (mode === 'nutrition') ? 'none' : 'contents';
    if (pillGroupMeal) pillGroupMeal.style.display = (mode === 'nutrition') ? 'contents' : 'none';
}

function updateMobileHUD(speaker, text, isInterim = false, suggestions = null) {
    const heroInitialIntro = document.getElementById("hero-initial-intro");
    const heroActiveDialogue = document.getElementById("hero-active-dialogue");
    const userCard = document.getElementById("dialogue-user-card");
    const userText = document.getElementById("user-dialogue-text");
    const userTag = document.getElementById("user-speaker-tag");
    const coachCard = document.getElementById("dialogue-coach-card");
    const coachText = document.getElementById("coach-dialogue-text");
    const coachTag = document.getElementById("coach-speaker-tag");
    const coachSpeakerName = document.getElementById("coach-speaker-name");
    const dynamicPillsGroup = document.getElementById("dynamic-pills-group");
    const pillGroupFit = document.getElementById("pill-group-fit");
    const pillGroupMeal = document.getElementById("pill-group-meal");

    if (!heroActiveDialogue) return;

    if (heroInitialIntro) heroInitialIntro.style.display = 'none';
    heroActiveDialogue.style.display = 'block';

    const currentMode = document.body.classList.contains('mealbuddy-page') ? 'nutrition' : 'fitness';

    if (speaker === 'user') {
        if (userCard && userText) {
            userCard.style.display = 'flex';
            userText.textContent = text;
            userText.className = 'dialogue-text user-text' + (isInterim ? ' is-interim' : '');
            if (userTag) {
                userTag.className = 'dialogue-speaker-tag is-user' + (isInterim ? ' is-speaking' : '');
            }
        }
    } else if (speaker === 'coach') {
        const coachName = currentMode === 'nutrition' ? 'MealBuddy' : 'FitBuddy';
        if (coachCard && coachText) {
            coachCard.style.display = 'flex';
            coachText.textContent = text;
            coachText.className = 'dialogue-text coach-text' + (isInterim ? ' is-interim' : '');
            if (coachSpeakerName) coachSpeakerName.textContent = coachName;
            if (coachTag) {
                coachTag.className = 'dialogue-speaker-tag is-coach' + (isInterim ? ' is-speaking' : '');
            }
        }
    }

    if (userCard) userCard.scrollTop = 0;
    if (coachCard) coachCard.scrollTop = 0;

    // Update dynamic pills in phone view if suggestions provided
    if (suggestions && Array.isArray(suggestions) && suggestions.length > 0) {
        if (pillGroupFit) pillGroupFit.style.display = 'none';
        if (pillGroupMeal) pillGroupMeal.style.display = 'none';
        if (dynamicPillsGroup) {
            dynamicPillsGroup.style.display = 'contents';
            dynamicPillsGroup.innerHTML = '';
            suggestions.forEach(sugText => {
                const pill = document.createElement("button");
                pill.type = "button";
                pill.className = "pill dynamic-pill";
                pill.textContent = sugText;
                pill.addEventListener("click", () => {
                    if (chatInput.disabled || btnSend.classList.contains("btn-stop")) return;
                    chatInput.value = sugText;
                    updateMobileHUD("user", sugText, false);
                    document.querySelector('.dashboard-grid')?.classList.add('has-conversation');
                    btnSend.click();
                });
                dynamicPillsGroup.appendChild(pill);
            });
        }
    }
}

function addChatMessage(role, text, isLoad = false, modeOverride = null, showSuggestions = true, serverSuggestions = null) {
    let currentActiveMode = document.body.classList.contains('mealbuddy-page') ? 'nutrition' : 'fitness';
    let targetMode = modeOverride || currentActiveMode;

    if (!isLoad) {
        chatData[targetMode].push({ role, text, suggestions: serverSuggestions });
        saveStoredState();
        if (role === "user") {
            const introEl = document.querySelector('.intro-blur');
            if (introEl) introEl.classList.add('is-blurred');
            const twEl = document.querySelector('.typewriter');
            if (twEl) twEl.classList.add('is-blurred');
            document.querySelector('.dashboard-grid')?.classList.add('has-conversation');
            chatHistory.querySelectorAll('.chat-suggestions').forEach(el => el.remove());
        }
    }

    // Only append to DOM if the target mode matches the currently active mode
    if (targetMode !== currentActiveMode) {
        return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = `chat-msg-wrapper wrapper-${role}`;
    
    const avatar = document.createElement("div");
    avatar.className = `chat-avatar avatar-${role}`;
    
    if (role === 'coach') {
        if (targetMode === 'nutrition') {
            avatar.innerHTML = `<img src="avatar-rhino.png" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        } else {
            avatar.innerHTML = `<img src="avatar-bull.png" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        }
    } else {
        avatar.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
    }

    if (role === 'coach') {
        const contentCol = document.createElement("div");
        contentCol.className = `chat-msg-column`;

        const msgBubble = document.createElement("div");
        msgBubble.className = `chat-msg msg-${role}`;
        msgBubble.textContent = text;
        contentCol.appendChild(msgBubble);

        const hasInteracted = chatData[targetMode].some(m => m.role === 'user') || document.querySelector('.dashboard-grid')?.classList.contains('has-conversation');
        let suggestions = [];
        if (showSuggestions && hasInteracted) {
            const userMsgs = chatData[targetMode].filter(m => m.role === 'user');
            const lastUserMessage = userMsgs.length > 0 ? userMsgs[userMsgs.length - 1].text : '';
            suggestions = (serverSuggestions && Array.isArray(serverSuggestions) && serverSuggestions.length > 0)
                ? serverSuggestions
                : getSuggestionsForCoachMessage(text, targetMode, lastUserMessage);

            if (suggestions && suggestions.length > 0) {
                chatHistory.querySelectorAll('.chat-suggestions').forEach(el => el.remove());
                const sugContainer = document.createElement("div");
                sugContainer.className = "chat-suggestions";
                suggestions.forEach(sugText => {
                    const pill = document.createElement("button");
                    pill.type = "button";
                    pill.className = "suggestion-pill";
                    pill.textContent = sugText;
                    pill.addEventListener("click", () => {
                        if (chatInput.disabled || btnSend.classList.contains("btn-stop")) return;
                        chatInput.value = sugText;
                        document.querySelector('.dashboard-grid')?.classList.add('has-conversation');
                        btnSend.click();
                    });
                    sugContainer.appendChild(pill);
                });
                contentCol.appendChild(sugContainer);
            }
        }

        wrapper.appendChild(avatar);
        wrapper.appendChild(contentCol);

        if (targetMode === currentActiveMode) {
            updateMobileHUD('coach', text, false, (suggestions && suggestions.length > 0) ? suggestions : null);
        }
    } else {
        const msgBubble = document.createElement("div");
        msgBubble.className = `chat-msg msg-${role}`;
        msgBubble.textContent = text;
        wrapper.appendChild(avatar);
        wrapper.appendChild(msgBubble);

        if (targetMode === currentActiveMode) {
            updateMobileHUD('user', text, false);
        }
    }

    chatHistory.appendChild(wrapper);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

let typingIndicator = null;

function showTypingIndicator() {
    if (typingIndicator) return;
    chatHistory.querySelectorAll('.chat-suggestions').forEach(el => el.remove());
    typingIndicator = document.createElement("div");
    typingIndicator.className = `chat-msg-wrapper wrapper-coach typing-indicator-wrapper`;
    
    let currentMode = document.body.classList.contains('mealbuddy-page') ? 'nutrition' : 'fitness';
    const avatar = document.createElement("div");
    avatar.className = `chat-avatar avatar-coach`;
    if (currentMode === 'nutrition') {
        avatar.innerHTML = `<img src="avatar-rhino.png" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
    } else {
        avatar.innerHTML = `<img src="avatar-bull.png" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
    }

    const msgBubble = document.createElement("div");
    msgBubble.className = `chat-msg msg-coach typing-bubble`;
    msgBubble.innerHTML = `<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>`;
    
    typingIndicator.appendChild(avatar);
    typingIndicator.appendChild(msgBubble);
    chatHistory.appendChild(typingIndicator);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function removeTypingIndicator() {
    if (typingIndicator) {
        typingIndicator.remove();
        typingIndicator = null;
    }
}

function loadChatHistory(mode) {
    chatHistory.innerHTML = '';
    const messages = chatData[mode];
    const hasUserMsg = chatData[mode].some(m => m.role === 'user');
    
    let lastCoachIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'coach') {
            lastCoachIndex = i;
            break;
        }
    }

    messages.forEach((msg, idx) => {
        const isLastCoach = (idx === lastCoachIndex);
        addChatMessage(msg.role, msg.text, true, mode, isLastCoach && hasUserMsg, msg.suggestions);
    });
    
    // Toggle has-conversation based on whether user has messages
    const dashboardGrid = document.querySelector('.dashboard-grid');
    if (dashboardGrid) {
        dashboardGrid.classList.toggle('has-conversation', hasUserMsg);
    }

    if (hasUserMsg) {
        let lastUser = null;
        let lastCoach = null;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (!lastCoach && messages[i].role === 'coach') lastCoach = messages[i];
            if (!lastUser && messages[i].role === 'user') lastUser = messages[i];
            if (lastCoach && lastUser) break;
        }
        if (lastUser) updateMobileHUD('user', lastUser.text, false);
        if (lastCoach) {
            const sugs = lastCoach.suggestions || getSuggestionsForCoachMessage(lastCoach.text, mode, lastUser ? lastUser.text : '');
            updateMobileHUD('coach', lastCoach.text, false, sugs);
        }
    } else {
        resetMobileHUD(mode);
    }
}

// Voice Selection logic
let preferredVoice = null;
function loadVoices() {
    const voices = synthesis.getVoices();
    if (!voices.length) return;

    // Attempt to find a suitable high-quality male voice
    preferredVoice =
        voices.find(v => v.name.includes('Microsoft David')) ||
        voices.find(v => v.name.includes('Google US English Male')) ||
        voices.find(v => v.name.includes('Microsoft Mark')) ||
        voices.find(v => v.name.toLowerCase().includes('male') && v.lang.includes('en-US')) ||
        voices.find(v => v.lang === 'en-US' && !v.name.includes('Fred')) || // Avoid 'Fred' (very robotic)
        voices.find(v => v.lang === 'en-US') ||
        voices[0];
}

let currentAudio = document.createElement('audio');
currentAudio.crossOrigin = "anonymous";
document.body.appendChild(currentAudio);

let audioContext = null;
let audioAnalyzer = null;
let lipSyncInterval = null;
let edgeTtsPulseInterval = null;

function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioAnalyzer = audioContext.createAnalyser();
        audioAnalyzer.fftSize = 256;
        const source = audioContext.createMediaElementSource(currentAudio);
        source.connect(audioAnalyzer);
        audioAnalyzer.connect(audioContext.destination);
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

function stopAudioPlayback() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
    }
    if (lipSyncInterval) {
        clearInterval(lipSyncInterval);
        lipSyncInterval = null;
        
        // Reset avatar transform
        const avatarImg = document.querySelector('.avatar-character');
        if (avatarImg) {
            avatarImg.style.transform = '';
            avatarImg.style.transition = 'transform 0.3s ease-out';
        }
    }
    if (edgeTtsPulseInterval) {
        clearInterval(edgeTtsPulseInterval);
        edgeTtsPulseInterval = null;
    }
    if (synthesis && synthesis.speaking) {
        synthesis.cancel();
    }
}

function playAudio(text, audioUrl, mode) {
    stopAudioPlayback();

    if (audioUrl) {
        const fullAudioUrl = audioUrl.startsWith('http') ? audioUrl : `${API_URL}${audioUrl}`;
        currentAudio.src = fullAudioUrl;

        currentAudio.onplay = () => {
            setAvatarState("speaking");
            coachStatus.textContent = "Speaking...";
            updateMicIcon("stop");// Rhythmic avatar lip-sync pulse while playing Edge TTS audio (fallback/legacy)
            document.getElementById("dialogue-speaker-tag")?.classList.add("is-speaking");
            edgeTtsPulseInterval = setInterval(() => {
                if (window.bullAvatar && window.bullAvatar.wordPulse) {
                    window.bullAvatar.wordPulse(mode);
                }
            }, 180);
        };

        currentAudio.onended = () => {
            stopAudioPlayback();
            setAvatarState("idle");
            coachStatus.textContent = "Ready";
            updateMicIcon("mic");
            document.getElementById("dialogue-speaker-tag")?.classList.remove("is-speaking");
        };

        currentAudio.onerror = (err) => {
            console.warn("Edge TTS audio playback failed, falling back to Web Speech API:", err);
            stopAudioPlayback();
            speakText(text, mode);
        };

        currentAudio.play().catch(err => {
            console.warn("Edge TTS playback blocked or error, falling back to Web Speech API:", err);
            stopAudioPlayback();
            speakText(text, mode);
        });
    } else {
        speakText(text, mode);
    }
}

function speakText(text, mode) {
    if (!synthesis) return;
    synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    if (preferredVoice) {
        utterance.voice = preferredVoice;
    }

    // STRICTLY use 1.0 on mobile. Modifying pitch or rate on iOS often forces 
    // the browser to fall back to a laggy, low-quality software synthesizer.
    utterance.pitch = 1.0;
    utterance.rate = 1.0;

    utterance.onstart = () => {
        setAvatarState("speaking");
        coachStatus.textContent = "Speaking...";
        updateMicIcon("stop");
        document.getElementById("dialogue-speaker-tag")?.classList.add("is-speaking");
    };

    // Trigger the avatar's word pulse precisely when each word is spoken!
    utterance.onboundary = (event) => {
        if (event.name === 'word' && window.bullAvatar && window.bullAvatar.wordPulse) {
            window.bullAvatar.wordPulse(mode);
        }
    };

    utterance.onend = () => {
        setAvatarState("idle");
        coachStatus.textContent = "Ready";
        updateMicIcon("mic");
        document.getElementById("dialogue-speaker-tag")?.classList.remove("is-speaking");
    };

    utterance.onerror = (event) => {
        // If it was canceled by the user, or if iOS silently drops it, 
        // just quietly reset to ready instead of showing an error.
        setAvatarState("idle");
        coachStatus.textContent = "Ready";
        updateMicIcon("mic");
        document.getElementById("dialogue-speaker-tag")?.classList.remove("is-speaking");
    };

    synthesis.speak(utterance);
}

// Event Listeners
btnMic.addEventListener("click", () => {
    const wasSpeaking = (currentAudio && !currentAudio.paused) || (synthesis && synthesis.speaking);
    unlockSpeech();

    if (isListening) {
        recognition.stop();
        return;
    }

    if (wasSpeaking) {
        stopAudioPlayback();
        setAvatarState("idle");
        coachStatus.textContent = "Ready";
        updateMicIcon("mic");
        return;
    }

    if (recognition && !isListening) {
        stopAudioPlayback();
        try {
            recognition.start();
        } catch (e) {
            console.error(e);
            showToast("Microphone could not be started. Please check your settings.", "error");
        }
    } else if (!recognition) {
        showToast("Speech recognition is not supported in this browser.", "error");
    }
});

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        btnSend.click();
    }
});

let abortController = null;

btnSend.addEventListener("click", async () => {
    if (abortController) {
        removeTypingIndicator();
        abortController.abort();
        abortController = null;
        setAvatarState("idle");
        coachStatus.textContent = "Canceled";
        setTimeout(() => { if (coachStatus.textContent === "Canceled") coachStatus.textContent = "Ready"; }, 2000);
        btnSend.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
        btnSend.classList.remove("btn-stop");
        return;
    }

    unlockSpeech();
    const text = chatInput.value.trim();
    if (!text) return;

    let currentMode = document.body.classList.contains('mealbuddy-page') ? 'nutrition' : 'fitness';

    addChatMessage("user", text, false, currentMode);
    resetChatControls();
    setAvatarState("thinking");
    coachStatus.textContent = "Thinking...";
    updateMobileHUD("coach", "Thinking...", true);
    showTypingIndicator();
    btnSend.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12"></rect></svg>`;
    btnSend.classList.add("btn-stop");

    abortController = new AbortController();

    try {
        const response = await fetch(`${API_URL}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: text,
                session_id: sessions[currentMode],
                mode: currentMode
            }),
            signal: abortController.signal
        });

        removeTypingIndicator();
        abortController = null;
        btnSend.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
        btnSend.classList.remove("btn-stop");

        if (response.ok) {
            const data = await response.json();
            const coachText = data.response || "Here is your plan!";
            addChatMessage("coach", coachText, false, currentMode, true, data.suggestions);
            
            let currentActiveMode = document.body.classList.contains('mealbuddy-page') ? 'nutrition' : 'fitness';
            if (currentMode === currentActiveMode) {
                playAudio(coachText, data.audio_url, currentMode);
            } else {
                setAvatarState("idle");
                coachStatus.textContent = "Ready";
            }

            // If the AI generated a plan, display it
            if (data.plan_data) {
                planDataStore[currentMode] = data.plan_data;
                saveStoredState();
                
                // Show notification dot for new plan
                const desktopNotif = document.getElementById("desktop-plan-notif");
                const mobileNotif = document.getElementById("mobile-plan-notif");
                
                // Only show dot if the plan sheet is not currently open
                const planSheet = document.getElementById('plan-sheet');
                if (planSheet && !planSheet.classList.contains('open')) {
                    if (desktopNotif) desktopNotif.style.display = "block";
                    if (mobileNotif) mobileNotif.style.display = "block";
                }
                
                if (currentMode === currentActiveMode) {
                    renderPlan(data.plan_data);
                    setAvatarState("celebrate");
                    // Wait for the jump animation before waving while speaking
                    setTimeout(() => setAvatarState("speaking"), 2500);
                }
            }
        } else {
            throw new Error("API Error");
        }
    } catch (e) {
        removeTypingIndicator();
        abortController = null;
        btnSend.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
        btnSend.classList.remove("btn-stop");

        if (e.name === 'AbortError') {
            console.log('Request aborted by user');
            return;
        }

        console.error(e);
        setAvatarState("error");
        coachStatus.textContent = "Connection error";
        addChatMessage("coach", "Sorry, I couldn't connect to the server.", false, currentMode);
        setTimeout(() => setAvatarState("idle"), 3000);
    }
});

function renderPlan(planData) {
    if (!planData) {
        planDisplay.innerHTML = `
            <p style="color: var(--text-secondary); text-align: center; margin-top: 2rem;">
                Tell me your goals, and I'll create a plan for you!
            </p>`;
        return;
    }

    if (planData.days) {
        renderMealPlan(planData);
        return;
    }

    if (!planData.sessions || planData.sessions.length === 0) {
        planDisplay.innerHTML = `
            <p style="color: var(--text-secondary); text-align: center; margin-top: 2rem;">
                Tell me your goals, and I'll create a plan for you!
            </p>`;
        return;
    }

    const renderSessionContent = (session, container) => {
        let html = `
            <h3>${session.explanation || 'Targeted Workout'}</h3>
            <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1rem;">
                Estimated time: ${session.estimated_time_minutes || 30} min
            </p>
            <div class="exercises-list">
        `;

        let exNum = 1;

        // Warmup
        const warmupText = Array.isArray(session.warmup) ? session.warmup.join(", ") : (session.warmup || "Dynamic stretching");
        html += `
            <div class="exercise-row">
                <span class="ex-number">${exNum++}</span>
                <div class="ex-details">
                    <strong>Warm-up</strong>
                    <span>${warmupText}</span>
                </div>
            </div>
        `;

        // Exercises
        (session.exercises || []).forEach(ex => {
            const details = [
                ex.sets ? `${ex.sets} sets` : '',
                ex.reps ? `${ex.reps} reps` : '',
                ex.duration_seconds ? `${ex.duration_seconds}s` : ''
            ].filter(Boolean).join(' × ');

            html += `
                <div class="exercise-row">
                    <span class="ex-number">${exNum++}</span>
                    <div class="ex-details">
                        <strong>${ex.name}</strong>
                        <span>${details || 'Follow coach instructions'}</span>
                        <span style="font-size: 0.75rem; display: block; margin-top: 4px;">Tip: ${ex.notes || 'Control the tempo'}</span>
                    </div>
                </div>
            `;
        });

        // Cooldown
        const cooldownText = Array.isArray(session.cooldown) ? session.cooldown.join(", ") : (session.cooldown || "Static stretches");
        html += `
            <div class="exercise-row">
                <span class="ex-number">${exNum++}</span>
                <div class="ex-details">
                    <strong>Cooldown</strong>
                    <span>${cooldownText}</span>
                </div>
            </div>
        `;

        html += `</div>`;

        const adviceText = Array.isArray(planData.general_advice) ? planData.general_advice.join(" ") : planData.general_advice;
        if (adviceText) {
            html += `<p style="margin-top: 1rem; font-size: 0.85rem; padding: 1rem; background: var(--accent-pale-green); border-radius: 12px;"><strong>Coach's Note:</strong> ${adviceText}</p>`;
        }
        
        container.innerHTML = html;
    };

    if (planData.sessions.length > 1) {
        let tabsHTML = `<div class="plan-tabs" style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; padding-bottom: 0.5rem;">`;
        planData.sessions.forEach((sess, idx) => {
            // Use explanation as the muscle target for the button
            const target = sess.explanation ? ` - ${sess.explanation}` : '';
            tabsHTML += `<button class="plan-tab-btn" data-index="${idx}" style="white-space: normal; text-align: left; line-height: 1.4; height: auto; padding: 0.5rem 1rem; border: 1px solid var(--glass-border); border-radius: 20px; background: ${idx === 0 ? 'var(--accent-dark-green)' : 'transparent'}; color: ${idx === 0 ? '#fff' : 'var(--text-primary)'}; cursor: pointer; font-weight: 600;">Day ${sess.day}${target}</button>`;
        });
        tabsHTML += `</div><div id="session-display-area"></div>`;
        planDisplay.innerHTML = tabsHTML;

        const displayArea = document.getElementById('session-display-area');
        renderSessionContent(planData.sessions[0], displayArea);

        // Add event listeners
        const tabBtns = planDisplay.querySelectorAll('.plan-tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.getAttribute('data-index'));
                renderSessionContent(planData.sessions[idx], displayArea);
                tabBtns.forEach(b => {
                    b.style.background = 'transparent';
                    b.style.color = 'var(--text-primary)';
                });
                e.target.style.background = 'var(--accent-dark-green)';
                e.target.style.color = '#fff';
            });
        });
    } else {
        renderSessionContent(planData.sessions[0], planDisplay);
    }
}

function renderMealPlan(planData) {
    if (!planData || !planData.days || planData.days.length === 0) {
        planDisplay.innerHTML = `
            <p style="color: var(--text-secondary); text-align: center; margin-top: 2rem;">
                Tell me your dietary goals, and I'll create a meal plan for you!
            </p>`;
        return;
    }

    const renderDayContent = (day, container) => {
        let html = `
            <h3>${day.explanation || 'Daily Nutrition'}</h3>
            <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1rem;">
                Target calories: ${day.total_calories || 2000} kcal
            </p>
            <div class="exercises-list">
        `;

        let exNum = 1;

        const breakfastText = Array.isArray(day.breakfast) ? day.breakfast.join(", ") : (day.breakfast || "Standard breakfast");
        html += `
            <div class="exercise-row">
                <span class="ex-number">${exNum++}</span>
                <div class="ex-details">
                    <strong>Breakfast</strong>
                    <span>${breakfastText}</span>
                </div>
            </div>
        `;

        (day.meals || []).forEach(meal => {
            const details = [
                meal.calories ? `${meal.calories} kcal` : '',
                meal.protein ? `${meal.protein}g P` : '',
                meal.carbs ? `${meal.carbs}g C` : '',
                meal.fat ? `${meal.fat}g F` : ''
            ].filter(Boolean).join(' | ');

            html += `
                <div class="exercise-row">
                    <span class="ex-number">${exNum++}</span>
                    <div class="ex-details">
                        <strong>${meal.name}</strong>
                        <span>${details || 'Follow chef instructions'}</span>
                        <span style="font-size: 0.75rem; display: block; margin-top: 4px;">Tip: ${meal.notes || 'Enjoy your meal'}</span>
                    </div>
                </div>
            `;
        });

        const snacksText = Array.isArray(day.snacks) ? day.snacks.join(", ") : (day.snacks || "Healthy snacks");
        html += `
            <div class="exercise-row">
                <span class="ex-number">${exNum++}</span>
                <div class="ex-details">
                    <strong>Snacks / Dinner</strong>
                    <span>${snacksText}</span>
                </div>
            </div>
        `;

        html += `</div>`;

        const adviceText = Array.isArray(planData.general_advice) ? planData.general_advice.join(" ") : planData.general_advice;
        if (adviceText) {
            html += `<p style="margin-top: 1rem; font-size: 0.85rem; padding: 1rem; background: var(--accent-pale-green); border-radius: 12px;"><strong>Chef's Note:</strong> ${adviceText}</p>`;
        }

        container.innerHTML = html;
    };

    if (planData.days.length > 1) {
        let tabsHTML = `<div class="plan-tabs" style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; padding-bottom: 0.5rem;">`;
        planData.days.forEach((day, idx) => {
            const target = day.explanation ? ` - ${day.explanation}` : '';
            tabsHTML += `<button class="plan-tab-btn" data-index="${idx}" style="white-space: normal; text-align: left; line-height: 1.4; height: auto; padding: 0.5rem 1rem; border: 1px solid var(--glass-border); border-radius: 20px; background: ${idx === 0 ? 'var(--accent-dark-green)' : 'transparent'}; color: ${idx === 0 ? '#fff' : 'var(--text-primary)'}; cursor: pointer; font-weight: 600;">Day ${day.day}${target}</button>`;
        });
        tabsHTML += `</div><div id="meal-display-area"></div>`;
        planDisplay.innerHTML = tabsHTML;

        const displayArea = document.getElementById('meal-display-area');
        renderDayContent(planData.days[0], displayArea);

        const tabBtns = planDisplay.querySelectorAll('.plan-tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                tabBtns.forEach(b => {
                    b.style.background = 'transparent';
                    b.style.color = 'var(--text-primary)';
                });
                e.target.style.background = 'var(--accent-dark-green)';
                e.target.style.color = '#fff';

                const idx = parseInt(e.target.getAttribute('data-index'));
                renderDayContent(planData.days[idx], displayArea);
            });
        });
    } else {
        renderDayContent(planData.days[0], planDisplay);
    }
}

// Initial greeting and Theme Setup
window.addEventListener('DOMContentLoaded', () => {
    const isMealBuddy = document.body.classList.contains("mealbuddy-page");
    if (isMealBuddy) {
        const navNut = document.getElementById('nav-nutrition');
        if (navNut) navNut.classList.add('active');
        const navWork = document.getElementById('nav-workout');
        if (navWork) navWork.classList.remove('active');
        
        // Initialize text headers
        const planTitle = document.getElementById('plan-title');
        const planIndicatorText = document.getElementById('plan-indicator-text');
        const chatHeaderSub = document.getElementById('chat-header-sub');
        const chatHeaderMain = document.getElementById('chat-header-main');
        const chatLiveIndicator = document.getElementById('chat-live-indicator');
        const floatieMainText = document.getElementById('floatie-main-text');
        const floatieIcon = document.getElementById('floatie-icon');
        
        if (planTitle) planTitle.textContent = "Your meal plan";
        if (planIndicatorText) planIndicatorText.textContent = "Calorie-Aware";
        if (chatHeaderSub) chatHeaderSub.textContent = "Let's build your meal plan";
        if (chatHeaderMain) chatHeaderMain.innerHTML = `What are we <span style="color: var(--accent-dark-green);">eating</span> today?`;
        if (chatLiveIndicator) chatLiveIndicator.innerHTML = `<span class="dot"></span> Live chef`;
        if (floatieMainText) floatieMainText.innerHTML = `Your Meal Plan <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg><span id="desktop-plan-notif" class="pulse-notif" style="display: none; width: 8px; height: 8px; background: #e74c3c; border-radius: 50%; margin-left: 2px;"></span>`;
        if (floatieIcon) floatieIcon.innerHTML = `<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"></path><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"></path>`;
    }
    const activeMode = isMealBuddy ? 'nutrition' : 'fitness';
    loadChatHistory(activeMode);
    if (planDataStore[activeMode]) {
        renderPlan(planDataStore[activeMode]);
    }
    // Don't auto-speak on load to prevent browser autoplay blocking, wait for user interaction

    // Attach click listeners to initial pills
    document.querySelectorAll('#pill-row .pill[data-prompt]').forEach(pill => {
        pill.addEventListener('click', () => {
            if (chatInput.disabled || btnSend.classList.contains('btn-stop')) return;
            const prompt = pill.dataset.prompt;
            chatInput.value = prompt;
            updateMobileHUD('user', prompt, false);
            document.querySelector('.dashboard-grid')?.classList.add('has-conversation');
            btnSend.click();
        });
    });



    // --- Mobile Bottom Sheets Logic ---
    const btnOpenChat = document.getElementById('btn-open-chat');
    const btnOpenPlan = document.getElementById('btn-open-plan');
    const btnCloseChat = document.getElementById('btn-close-chat');
    const btnClosePlan = document.getElementById('btn-close-plan');
    const chatSheet = document.getElementById('chat-sheet');
    const planSheet = document.getElementById('plan-sheet');
    const sheetBackdrop = document.getElementById('sheet-backdrop');

    function closeAllSheets() {
        if (chatSheet) chatSheet.classList.remove('open');
        if (planSheet) planSheet.classList.remove('open');
        if (sheetBackdrop) sheetBackdrop.classList.remove('active');
        // Restore focus to opening button could be added here
    }

    const desktopBtnOpenPlan = document.getElementById('desktop-btn-open-plan');
    const desktopPlanTitle = document.getElementById('desktop-plan-title');

    if (desktopBtnOpenPlan) {
        desktopBtnOpenPlan.addEventListener('click', () => {
            const desktopNotif = document.getElementById("desktop-plan-notif");
            const mobileNotif = document.getElementById("mobile-plan-notif");
            if (desktopNotif) desktopNotif.style.display = "none";
            if (mobileNotif) mobileNotif.style.display = "none";

            closeAllSheets();
            planSheet.classList.add('open');
            sheetBackdrop.classList.add('active');
        });
    }

    if (btnOpenChat) {
        btnOpenChat.addEventListener('click', () => {
            closeAllSheets();
            chatSheet.classList.add('open');
            sheetBackdrop.classList.add('active');
        });
    }

    if (btnOpenPlan) {
        btnOpenPlan.addEventListener('click', () => {
            const desktopNotif = document.getElementById("desktop-plan-notif");
            const mobileNotif = document.getElementById("mobile-plan-notif");
            if (desktopNotif) desktopNotif.style.display = "none";
            if (mobileNotif) mobileNotif.style.display = "none";

            closeAllSheets();
            planSheet.classList.add('open');
            sheetBackdrop.classList.add('active');
        });
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAllSheets();
    });

    if (btnCloseChat) btnCloseChat.addEventListener('click', closeAllSheets);
    if (btnClosePlan) btnClosePlan.addEventListener('click', closeAllSheets);
    if (sheetBackdrop) sheetBackdrop.addEventListener('click', closeAllSheets);

    // Single Page App (SPA) logic to prevent WebGL/3D reload lag
    document.querySelectorAll('.nav-bar a, .mobile-only-switch a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = e.currentTarget.getAttribute('href');
            if (e.currentTarget.classList.contains('active')) return;

            document.querySelectorAll('.nav-bar a, .mobile-only-switch a').forEach(a => a.classList.remove('active'));
            e.currentTarget.classList.add('active');

            const planTitle = document.getElementById('plan-title');
            const planIndicatorText = document.getElementById('plan-indicator-text');

            const chatHeaderSub = document.getElementById('chat-header-sub');
            const chatHeaderMain = document.getElementById('chat-header-main');
            const chatLiveIndicator = document.getElementById('chat-live-indicator');
            const floatieMainText = document.getElementById('floatie-main-text');
            const floatieIcon = document.getElementById('floatie-icon');

            if (target === '#nutrition' || target.includes('nutrition')) {
                document.body.classList.add('mealbuddy-page');
                document.title = "MealBuddy: AI Nutrition Coach";
                const logoImg = document.querySelector('.logo img');
                if (logoImg) {
                    logoImg.src = "mealbuddy-logo.png";
                    logoImg.alt = "MealBuddy Logo";
                }
                if (planTitle) planTitle.textContent = "Your meal plan";
                if (planIndicatorText) planIndicatorText.textContent = "Calorie-Aware";

                if (chatHeaderSub) chatHeaderSub.textContent = "Let's build your meal plan";
                if (chatHeaderMain) chatHeaderMain.innerHTML = `What are we <span style="color: var(--accent-dark-green);">eating</span> today?`;
                if (chatLiveIndicator) chatLiveIndicator.innerHTML = `<span class="dot"></span> Live chef`;

                if (floatieMainText) floatieMainText.innerHTML = `Your Meal Plan <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg><span id="desktop-plan-notif" class="pulse-notif" style="display: none; width: 8px; height: 8px; background: #e74c3c; border-radius: 50%; margin-left: 2px;"></span>`;
                if (floatieIcon) floatieIcon.innerHTML = `<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"></path><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"></path>`;

                if (window.bullAvatar && window.bullAvatar.setMode) window.bullAvatar.setMode('nutrition');
                loadChatHistory('nutrition');
                renderPlan(planDataStore.nutrition);
            } else {
                document.body.classList.remove('mealbuddy-page');
                document.title = "FitBuddy: AI Voice Fitness Coach";
                const logoImg = document.querySelector('.logo img');
                if (logoImg) {
                    logoImg.src = "fitbuddy-logo.png";
                    logoImg.alt = "FitBuddy Logo";
                }
                if (planTitle) planTitle.textContent = "Your Workout";
                if (planIndicatorText) planIndicatorText.textContent = "Equipment-Aware";

                if (chatHeaderSub) chatHeaderSub.textContent = "Let's build your routine";
                if (chatHeaderMain) chatHeaderMain.innerHTML = `What are we <span style="color: var(--accent-dark-green);">training</span> today?`;
                if (chatLiveIndicator) chatLiveIndicator.innerHTML = `<span class="dot"></span> Live coach`;

                if (floatieMainText) floatieMainText.innerHTML = `Your Workout <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg><span id="desktop-plan-notif" class="pulse-notif" style="display: none; width: 8px; height: 8px; background: #e74c3c; border-radius: 50%; margin-left: 2px;"></span>`;
                if (floatieIcon) floatieIcon.innerHTML = `<path d="m14.4 14.4-4.8-4.8"/><path d="M18.65 21.35a2.12 2.12 0 0 1-3-.01L2.66 8.35a2.12 2.12 0 0 1-.01-3l.86-.86a2.12 2.12 0 0 1 3 .01l12.99 12.99a2.12 2.12 0 0 1 .01 3z"/>`;

                if (window.bullAvatar && window.bullAvatar.setMode) window.bullAvatar.setMode('fitness');
                loadChatHistory('fitness');
                renderPlan(planDataStore.fitness);
            }
        });
    });

    // Reset session listeners
    const btnResetChat = document.getElementById('btn-reset-chat');
    const mobileMenuReset = document.getElementById('mobile-menu-reset');
    if (btnResetChat) {
        btnResetChat.addEventListener('click', (e) => {
            e.stopPropagation();
            resetSession();
        });
    }
    if (mobileMenuReset) {
        mobileMenuReset.addEventListener('click', () => {
            const burger = document.getElementById('nav-burger');
            const menu = document.getElementById('mobile-menu');
            if (burger) burger.classList.remove('open');
            if (menu) menu.classList.remove('open');
            resetSession();
        });
    }
});

function resetSession(mode = null) {
    const activeMode = mode || (document.body.classList.contains('mealbuddy-page') ? 'nutrition' : 'fitness');

    // Fresh session ID for backend conversation memory
    sessions[activeMode] = (activeMode === 'nutrition' ? 'nutri_' : 'fit_') + Math.floor(Math.random() * 10000);
    chatData[activeMode] = JSON.parse(JSON.stringify(DEFAULT_CHAT_DATA[activeMode]));
    planDataStore[activeMode] = null;
    saveStoredState();

    // Re-render chat history with initial coach intro
    loadChatHistory(activeMode);
    renderPlan(null);

    // Reset mobile dialogue HUD
    resetMobileHUD(activeMode);

    // Reset hero intro text & blurred state
    const introEl = document.querySelector('.intro-blur');
    if (introEl) introEl.classList.remove('is-blurred');
    const twEl = document.querySelector('.typewriter');
    if (twEl) twEl.classList.remove('is-blurred');
    document.querySelector('.dashboard-grid')?.classList.remove('has-conversation');

    // Hide notification dots
    const desktopNotif = document.getElementById("desktop-plan-notif");
    const mobileNotif = document.getElementById("mobile-plan-notif");
    if (desktopNotif) desktopNotif.style.display = "none";
    if (mobileNotif) mobileNotif.style.display = "none";

    // Close any open bottom sheets
    const chatSheet = document.getElementById('chat-sheet');
    const planSheet = document.getElementById('plan-sheet');
    const sheetBackdrop = document.getElementById('sheet-backdrop');
    if (chatSheet) chatSheet.classList.remove('open');
    if (planSheet) planSheet.classList.remove('open');
    if (sheetBackdrop) sheetBackdrop.classList.remove('active');

    // Reset audio and avatar state
    if (currentAudio && !currentAudio.paused) {
        stopAudioPlayback();
    }
    if (synthesis && synthesis.speaking) {
        synthesis.cancel();
    }
    setAvatarState("idle");
    coachStatus.textContent = "Ready";

    showToast("Started a new conversation!", "success");
}

function showToast(message, type = "error") {
    // Remove existing toast if present
    const existing = document.querySelector('.toast-notification');
    if (existing) {
        existing.remove();
    }

    const toast = document.createElement("div");
    toast.className = `toast-notification ${type}`;
    
    const icon = document.createElement("div");
    icon.className = "toast-icon";
    if (type === "error") {
        icon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else {
        icon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    }
    
    const text = document.createElement("div");
    text.textContent = message;
    
    toast.appendChild(icon);
    toast.appendChild(text);
    document.body.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add("show");
    });
    
    // Remove after 4 seconds
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 400); // Wait for transition
    }, 4000);
}


