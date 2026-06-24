from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from math import ceil
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
DATA_DIR = BASE_DIR / "data"
STATE_FILE = DATA_DIR / "app_state.json"

DEFAULT_STATE: dict[str, Any] = {
    "sessions": [],
    "concept_mastery": [],
    "notes": [],
    "flashcards": [],
    "reviews": [],
    "exam_plans": [],
}


CONCEPT_LIBRARY: dict[str, list[dict[str, Any]]] = {
    "newton": [
        {
            "concept": "Newton's first law",
            "question": "A book is resting on a table. Why does it stay still until something pushes or pulls it?",
            "ideal_answer": "It stays still because an object at rest remains at rest unless acted on by a net external force.",
            "keywords": ["rest", "force", "net", "external", "inertia", "motion"],
            "lesson": "Newton's first law says motion does not change by itself. If an object is still, it stays still unless a net external force acts on it. If it is moving steadily, it keeps moving steadily unless a net force changes that motion.",
            "example": "A notebook on a desk stays there because the forces balance. It moves only when your hand creates an unbalanced force.",
        },
        {
            "concept": "net force",
            "question": "A box has 12 N pushing right and 5 N pushing left. What is the net force and direction?",
            "ideal_answer": "The net force is 7 N to the right because opposite forces subtract.",
            "keywords": ["7", "right", "subtract", "opposite", "net"],
            "lesson": "Net force is the total force after combining direction. Forces in the same direction add. Forces in opposite directions subtract. The object accelerates in the direction of the net force.",
            "example": "12 N right and 5 N left becomes 7 N right.",
        },
        {
            "concept": "force and acceleration",
            "question": "If mass stays the same but force increases, what happens to acceleration?",
            "ideal_answer": "Acceleration increases because acceleration is proportional to force when mass is constant.",
            "keywords": ["increase", "acceleration", "force", "proportional", "same mass"],
            "lesson": "Newton's second law is F = ma. If mass is unchanged, a larger force creates a larger acceleration.",
            "example": "The same cart speeds up more when you push it harder.",
        },
        {
            "concept": "mass and acceleration",
            "question": "If the same force is applied to a light object and a heavy object, which accelerates more and why?",
            "ideal_answer": "The lighter object accelerates more because acceleration decreases when mass increases for the same force.",
            "keywords": ["light", "lighter", "accelerates", "more", "mass", "same force"],
            "lesson": "For the same force, lower mass means higher acceleration. Higher mass resists changes in motion more.",
            "example": "An empty trolley accelerates more easily than a loaded trolley when pushed with the same force.",
        },
        {
            "concept": "friction",
            "question": "What direction does friction act when a box slides across the floor?",
            "ideal_answer": "Friction acts opposite the sliding motion between the surfaces.",
            "keywords": ["opposite", "motion", "sliding", "surface", "resist"],
            "lesson": "Friction is a contact force that opposes relative motion between surfaces. It does not always stop motion immediately, but it reduces the net force in the direction of motion.",
            "example": "If a box slides right, friction on the box acts left.",
        },
    ],
    "derivatives": [
        {
            "concept": "rate of change",
            "question": "What does a derivative tell you about how a quantity is changing?",
            "ideal_answer": "A derivative tells the instantaneous rate of change of one quantity with respect to another.",
            "keywords": ["instantaneous", "rate", "change", "quantity", "respect"],
            "lesson": "A derivative measures how fast something changes at a specific moment. It is not just average change across a long interval.",
            "example": "A speedometer shows instantaneous speed, which is like the derivative of position with respect to time.",
        },
        {
            "concept": "slope of tangent",
            "question": "How is a derivative related to the tangent line on a graph?",
            "ideal_answer": "The derivative at a point is the slope of the tangent line to the curve at that point.",
            "keywords": ["slope", "tangent", "line", "point", "curve"],
            "lesson": "On a graph, the derivative tells the slope of the curve at one exact point. Imagine zooming in until the curve looks almost straight.",
            "example": "For y = x^2 at x = 2, the tangent slope is 4.",
        },
        {
            "concept": "secant to tangent",
            "question": "Why do we bring two points closer together when explaining derivatives?",
            "ideal_answer": "Bringing two points closer turns the secant slope into the tangent slope in the limit.",
            "keywords": ["closer", "secant", "tangent", "slope", "limit"],
            "lesson": "A secant line uses two points. As those points get closer, the secant slope approaches the tangent slope.",
            "example": "Average speed over 10 seconds becomes closer to instant speed as the time interval shrinks.",
        },
        {
            "concept": "power rule",
            "question": "What is the derivative of x^3 using the power rule?",
            "ideal_answer": "The derivative of x^3 is 3x^2.",
            "keywords": ["3x", "3x2", "3x^2", "power", "rule"],
            "lesson": "The power rule says the derivative of x^n is n*x^(n-1). Move the power down, then reduce the power by one.",
            "example": "d/dx of x^5 is 5x^4.",
        },
        {
            "concept": "positive and negative derivative",
            "question": "What does it mean if a function has a negative derivative at a point?",
            "ideal_answer": "A negative derivative means the function is decreasing at that point.",
            "keywords": ["negative", "decreasing", "down", "slope", "point"],
            "lesson": "The sign of the derivative tells direction. Positive means increasing, negative means decreasing, zero means flat at that point.",
            "example": "If height is decreasing over time, its derivative with respect to time is negative.",
        },
    ],
    "photosynthesis": [
        {
            "concept": "photosynthesis purpose",
            "question": "What is the main purpose of photosynthesis in plants?",
            "ideal_answer": "Photosynthesis lets plants use light energy to make glucose, storing energy as food.",
            "keywords": ["light", "energy", "glucose", "food", "plants"],
            "lesson": "Photosynthesis is how plants convert light energy into chemical energy stored in glucose.",
            "example": "A leaf uses sunlight to help make sugar that the plant can use for growth.",
        },
        {
            "concept": "reactants",
            "question": "What raw materials do plants need for photosynthesis?",
            "ideal_answer": "Plants need carbon dioxide, water, and light energy for photosynthesis.",
            "keywords": ["carbon", "dioxide", "water", "light", "energy"],
            "lesson": "The inputs of photosynthesis are carbon dioxide from air, water from roots, and light energy.",
            "example": "CO2 enters leaves through stomata while water comes from the soil.",
        },
        {
            "concept": "products",
            "question": "What are the main products of photosynthesis?",
            "ideal_answer": "The main products are glucose and oxygen.",
            "keywords": ["glucose", "oxygen", "sugar", "product"],
            "lesson": "Photosynthesis produces glucose for stored energy and oxygen that is released into the air.",
            "example": "The oxygen we breathe is partly produced by photosynthetic organisms.",
        },
        {
            "concept": "chlorophyll",
            "question": "What role does chlorophyll play in photosynthesis?",
            "ideal_answer": "Chlorophyll absorbs light energy, especially in chloroplasts, to drive photosynthesis.",
            "keywords": ["chlorophyll", "absorbs", "light", "energy", "chloroplast"],
            "lesson": "Chlorophyll is the green pigment that captures light energy inside chloroplasts.",
            "example": "Leaves look green because chlorophyll reflects green light while absorbing other wavelengths.",
        },
        {
            "concept": "balanced equation",
            "question": "What does the photosynthesis equation show overall?",
            "ideal_answer": "It shows carbon dioxide and water using light energy to form glucose and oxygen.",
            "keywords": ["carbon", "dioxide", "water", "glucose", "oxygen"],
            "lesson": "The equation summarizes the inputs and outputs: carbon dioxide plus water, with light, becomes glucose plus oxygen.",
            "example": "6CO2 + 6H2O + light -> C6H12O6 + 6O2.",
        },
    ],
    "fractions": [
        {
            "concept": "fraction meaning",
            "question": "What does the denominator of a fraction tell you?",
            "ideal_answer": "The denominator tells how many equal parts the whole is divided into.",
            "keywords": ["denominator", "equal", "parts", "whole", "divided"],
            "lesson": "A fraction compares a part to a whole. The denominator names the number of equal pieces in the whole.",
            "example": "In 3/8, the whole is split into 8 equal parts.",
        },
        {
            "concept": "equivalent fractions",
            "question": "Why are 1/2 and 2/4 equivalent fractions?",
            "ideal_answer": "They represent the same amount because multiplying numerator and denominator by the same number keeps the value equal.",
            "keywords": ["same", "amount", "multiply", "numerator", "denominator"],
            "lesson": "Equivalent fractions look different but represent the same value. Multiplying or dividing top and bottom by the same number keeps the fraction equal.",
            "example": "1/2, 2/4, and 4/8 all represent half.",
        },
        {
            "concept": "common denominator",
            "question": "Why do we need a common denominator when adding 1/3 and 1/4?",
            "ideal_answer": "A common denominator makes the parts the same size so the fractions can be added.",
            "keywords": ["common", "denominator", "same", "size", "add"],
            "lesson": "Fractions can be added directly only when the pieces are the same size. A common denominator converts them to matching pieces.",
            "example": "1/3 + 1/4 becomes 4/12 + 3/12 = 7/12.",
        },
        {
            "concept": "improper fractions",
            "question": "What does it mean if a fraction is improper?",
            "ideal_answer": "An improper fraction has a numerator greater than or equal to the denominator.",
            "keywords": ["numerator", "greater", "equal", "denominator", "improper"],
            "lesson": "An improper fraction represents one whole or more than one whole.",
            "example": "7/4 means 1 whole and 3/4 more.",
        },
        {
            "concept": "multiplying fractions",
            "question": "How do you multiply two fractions?",
            "ideal_answer": "Multiply the numerators together and multiply the denominators together.",
            "keywords": ["multiply", "numerators", "denominators", "together"],
            "lesson": "To multiply fractions, multiply straight across: top times top and bottom times bottom.",
            "example": "2/3 x 4/5 = 8/15.",
        },
    ],
}


class StudyStartRequest(BaseModel):
    subject: str = Field(min_length=2, max_length=80)
    topic: str = Field(min_length=2, max_length=120)
    level: str = Field(pattern="^(beginner|intermediate|advanced)$")


class AnswerPayload(BaseModel):
    question_id: str
    answer: str = Field(min_length=1, max_length=1000)


class SubmitAnswersRequest(BaseModel):
    session_id: str
    answers: list[AnswerPayload] = Field(min_length=1)


class NotesRequest(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    body: str = Field(min_length=20, max_length=12000)


class ReviewRequest(BaseModel):
    concept: str
    remembered: bool


class ExamPlanRequest(BaseModel):
    exam_name: str = Field(min_length=2, max_length=120)
    exam_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    syllabus: str = Field(min_length=20, max_length=12000)
    daily_minutes: int = Field(default=90, ge=20, le=480)


app = FastAPI(title="Adaptive AI Tutor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8790", "http://localhost:8790"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def prevent_local_asset_cache(request: Request, call_next):
    response = await call_next(request)
    if request.url.path == "/" or request.url.path.endswith((".html", ".css", ".js")):
      response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
      response.headers["Pragma"] = "no-cache"
      response.headers["Expires"] = "0"
    return response


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def load_state() -> dict[str, Any]:
    if not STATE_FILE.exists():
        return json.loads(json.dumps(DEFAULT_STATE))
    try:
        state = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="App state file is corrupted") from exc
    for key, value in DEFAULT_STATE.items():
        state.setdefault(key, value)
    return state


def save_state(state: dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")


def find_session(state: dict[str, Any], session_id: str) -> dict[str, Any]:
    for session in state["sessions"]:
        if session["id"] == session_id:
            return session
    raise HTTPException(status_code=404, detail="Session not found")


def topic_key(topic: str) -> str:
    lowered = topic.lower()
    if "derivative" in lowered or "calculus" in lowered or "tangent" in lowered:
        return "derivatives"
    if "photo" in lowered or "plant" in lowered or "chlorophyll" in lowered:
        return "photosynthesis"
    if "fraction" in lowered or "denominator" in lowered or "numerator" in lowered:
        return "fractions"
    if "newton" in lowered or "force" in lowered or "motion" in lowered:
        return "newton"
    return "generic"


def generic_concepts(topic: str) -> list[dict[str, Any]]:
    clean_topic = topic.strip() or "this topic"
    return [
        {
            "concept": f"{clean_topic} overview",
            "question": f"In your own words, what is {clean_topic} mainly about?",
            "ideal_answer": f"A good answer explains the central idea of {clean_topic} clearly and accurately.",
            "keywords": sorted(normalize_words(clean_topic) | {"main", "idea", "about", "explain"}),
            "lesson": f"Start by naming the central idea of {clean_topic}, then connect it to one real example. If you cannot define it simply, the foundation is still weak.",
            "example": f"For {clean_topic}, give a short definition and one place where it is used.",
        },
        {
            "concept": f"{clean_topic} key terms",
            "question": f"What are three important terms or parts in {clean_topic}?",
            "ideal_answer": f"A good answer names important terms in {clean_topic} and explains how they connect.",
            "keywords": sorted(normalize_words(clean_topic) | {"terms", "parts", "connect", "important"}),
            "lesson": f"Most topics become easier when you separate the key terms first. List the parts, then explain how each part affects the others.",
            "example": "For a science topic, this might mean inputs, process, output, and result.",
        },
        {
            "concept": f"{clean_topic} cause and effect",
            "question": f"What causes an important change or result in {clean_topic}?",
            "ideal_answer": f"A good answer explains a cause, the result, and why they are connected in {clean_topic}.",
            "keywords": sorted(normalize_words(clean_topic) | {"cause", "effect", "result", "because"}),
            "lesson": f"Look for cause and effect. Ask: what changes, what makes it change, and what happens after that?",
            "example": "In physics, a force can cause acceleration. In biology, a missing input can slow a process.",
        },
        {
            "concept": f"{clean_topic} common mistake",
            "question": f"What is one mistake students often make when learning {clean_topic}?",
            "ideal_answer": f"A good answer identifies a likely misconception and corrects it.",
            "keywords": sorted(normalize_words(clean_topic) | {"mistake", "misconception", "wrong", "correct"}),
            "lesson": f"Finding mistakes is part of understanding. Compare the wrong idea with the correct rule or explanation.",
            "example": "A common mistake is memorizing a formula without knowing when it applies.",
        },
        {
            "concept": f"{clean_topic} example",
            "question": f"Give one example that shows {clean_topic} in action.",
            "ideal_answer": f"A good answer gives a concrete example and explains why it fits {clean_topic}.",
            "keywords": sorted(normalize_words(clean_topic) | {"example", "shows", "real", "action"}),
            "lesson": f"Examples prove whether you can use the idea, not just repeat words. A strong example names the situation and explains the connection.",
            "example": f"Use a real classroom or daily-life situation where {clean_topic} appears.",
        },
    ]


def concept_bank(topic: str) -> list[dict[str, Any]]:
    key = topic_key(topic)
    if key == "generic":
        return generic_concepts(topic)
    return CONCEPT_LIBRARY[key]


def make_questions(topic: str, level: str) -> list[dict[str, Any]]:
    concepts = concept_bank(topic)
    questions = []
    for index, item in enumerate(concepts, start=1):
        questions.append(
            {
                "id": f"q{index}",
                "concept": item["concept"],
                "question": item["question"],
                "ideal_answer": item["ideal_answer"],
                "level": level,
            }
        )
    return questions


def normalize_words(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9']+", text.lower()))


def grade_answer(answer: str, concept_item: dict[str, Any]) -> dict[str, Any]:
    answer_words = normalize_words(answer)
    keywords = {word.lower() for word in concept_item["keywords"]}
    hits = answer_words.intersection(keywords)
    score = min(100, int((len(hits) / max(len(keywords), 1)) * 100) + 15)
    if len(answer.strip()) < 18:
        score = min(score, 45)
    if score >= 76:
        mastery = "strong"
    elif score >= 45:
        mastery = "medium"
    else:
        mastery = "weak"
    if mastery == "strong":
        feedback = f"Good. Your answer shows the main idea of {concept_item['concept']}."
    elif mastery == "medium":
        feedback = f"Partly correct. Add the missing details from the ideal idea: {concept_item['ideal_answer']}"
    else:
        feedback = f"This needs revision. Key idea: {concept_item['ideal_answer']}"
    return {
        "concept": concept_item["concept"],
        "score": score,
        "mastery_level": mastery,
        "feedback": feedback,
        "detected_misconception": "" if mastery != "weak" else f"Unclear or incomplete understanding of {concept_item['concept']}.",
        "matched_keywords": sorted(hits),
    }


def revision_delay(mastery: str, remembered: bool | None = None) -> int:
    if remembered is False:
        return 1
    if remembered is True:
        return 7
    return {"weak": 1, "medium": 3, "strong": 7}.get(mastery, 1)


def upsert_mastery(state: dict[str, Any], session: dict[str, Any], result: dict[str, Any]) -> None:
    existing = None
    for item in state["concept_mastery"]:
        if (
            item["subject"].lower() == session["subject"].lower()
            and item["topic"].lower() == session["topic"].lower()
            and item["concept"].lower() == result["concept"].lower()
        ):
            existing = item
            break

    next_revision = now_utc() + timedelta(days=revision_delay(result["mastery_level"]))
    payload = {
        "subject": session["subject"],
        "topic": session["topic"],
        "concept": result["concept"],
        "mastery_level": result["mastery_level"],
        "last_score": result["score"],
        "last_seen_at": now_utc().isoformat(),
        "next_revision_at": next_revision.isoformat(),
    }
    if existing:
        existing.update(payload)
        existing["times_reviewed"] = existing.get("times_reviewed", 0)
    else:
        payload["id"] = f"mastery-{len(state['concept_mastery']) + 1}"
        payload["times_reviewed"] = 0
        state["concept_mastery"].append(payload)


def build_lesson(results: list[dict[str, Any]], concepts: list[dict[str, Any]]) -> dict[str, Any]:
    weak = [result for result in results if result["mastery_level"] != "strong"]
    selected = weak or results[:2]
    sections = []
    concept_lookup = {item["concept"]: item for item in concepts}
    for result in selected:
        item = concept_lookup[result["concept"]]
        sections.append(
            {
                "concept": item["concept"],
                "explanation": item["lesson"],
                "example": item["example"],
            }
        )
    return {
        "lesson_title": "Targeted Lesson",
        "sections": sections,
        "follow_up_questions": [
            "Explain the weakest concept again in your own words.",
            "Create one real-life example using force, motion, or friction.",
        ],
    }


def extract_flashcards(title: str, body: str) -> list[dict[str, str]]:
    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", body) if len(part.strip()) > 25]
    cards = []
    for index, sentence in enumerate(sentences[:8], start=1):
        words = re.findall(r"[A-Za-z][A-Za-z'-]+", sentence)
        important = max(words, key=len) if words else "concept"
        cards.append(
            {
                "front": f"In {title}, what is the key idea involving {important}?",
                "back": sentence,
                "source": title,
            }
        )
    if not cards:
        cards.append({"front": f"What is the main idea of {title}?", "back": body[:350], "source": title})
    return cards


def syllabus_topics(syllabus: str) -> list[str]:
    raw_parts = re.split(r"[\n,;]+", syllabus)
    topics = []
    for part in raw_parts:
        cleaned = re.sub(r"^\s*[-*\d.)]+", "", part).strip()
        if cleaned:
            topics.append(cleaned[:90])
    if len(topics) == 1:
        words = topics[0].split()
        if len(words) > 12:
            topics = [" ".join(words[index : index + 6]) for index in range(0, len(words), 6)]
    return topics[:30] or ["Revise the full syllabus"]


def build_exam_plan(payload: ExamPlanRequest) -> dict[str, Any]:
    today = datetime.now().date()
    exam_day = datetime.strptime(payload.exam_date, "%Y-%m-%d").date()
    days_left = max((exam_day - today).days, 0)
    study_days = max(days_left, 1)
    topics = syllabus_topics(payload.syllabus)
    days = []

    for index in range(study_days):
        day_number = index + 1
        plan_date = today + timedelta(days=index)
        remaining = study_days - index
        topic = topics[index % len(topics)]
        next_topic = topics[(index + 1) % len(topics)]
        is_revision_day = day_number % 3 == 0 or remaining <= 3
        minutes = payload.daily_minutes
        learn_minutes = max(20, round(minutes * (0.58 if not is_revision_day else 0.35)))
        practice_minutes = max(10, round(minutes * 0.25))
        revise_minutes = max(10, minutes - learn_minutes - practice_minutes)

        if remaining == 1:
            target = "Final light revision and confidence check"
            tasks = [
                "Review summaries and formulas only",
                "Solve one mixed mini-test",
                "Mark 5 last-minute weak points",
                "Sleep on time and avoid learning brand-new chapters",
            ]
        elif is_revision_day:
            target = f"Revise {topic} and connect it with {next_topic}"
            tasks = [
                f"Revise {topic} from your notes",
                f"Do active recall for {next_topic}",
                "Attempt mixed questions without looking at answers",
                "Add weak ideas to the revision list",
            ]
        else:
            target = f"Learn and practice {topic}"
            tasks = [
                f"Study {topic} deeply",
                "Make 5 active-recall questions",
                "Solve practice problems or explain examples aloud",
                f"Quickly preview {next_topic}",
            ]

        days.append(
            {
                "day": day_number,
                "date": plan_date.isoformat(),
                "target": target,
                "focus_topic": topic,
                "tasks": tasks,
                "minutes": {
                    "learn": learn_minutes,
                    "practice": practice_minutes,
                    "revise": revise_minutes,
                },
                "reminder": "Revise yesterday's weak points before starting today's new work.",
            }
        )

    topics_per_week = ceil(len(topics) / max(ceil(study_days / 7), 1))
    return {
        "id": f"exam-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}",
        "exam_name": payload.exam_name.strip(),
        "exam_date": exam_day.isoformat(),
        "created_at": now_utc().isoformat(),
        "days_left": days_left,
        "daily_minutes": payload.daily_minutes,
        "topics": topics,
        "summary": {
            "total_topics": len(topics),
            "study_days": study_days,
            "pace": f"About {topics_per_week} topic(s) per week plus revision",
            "strategy": "Learn new material first, revise every third day, then switch to mixed practice near the exam.",
        },
        "days": days,
    }


@app.get("/")
def index() -> FileResponse:
    return FileResponse(PUBLIC_DIR / "index.html")


@app.post("/api/study/start")
def start_study(payload: StudyStartRequest) -> dict[str, Any]:
    state = load_state()
    created_at = now_utc()
    session_id = f"session-{created_at.strftime('%Y%m%d%H%M%S%f')}"
    questions = make_questions(payload.topic.strip(), payload.level)
    concepts = concept_bank(payload.topic.strip())
    session = {
        "id": session_id,
        "subject": payload.subject.strip(),
        "topic": payload.topic.strip(),
        "level": payload.level,
        "started_at": created_at.isoformat(),
        "completed_at": None,
        "status": "diagnostic_ready",
        "questions": questions,
        "concept_items": concepts,
        "answers": [],
        "results": [],
        "lesson": None,
        "overall_score": None,
    }
    state["sessions"].append(session)
    save_state(state)
    return {
        "session_id": session_id,
        "subject": session["subject"],
        "topic": session["topic"],
        "level": session["level"],
        "status": session["status"],
        "questions": questions,
    }


@app.post("/api/study/submit")
def submit_answers(payload: SubmitAnswersRequest) -> dict[str, Any]:
    state = load_state()
    session = find_session(state, payload.session_id)
    answer_map = {answer.question_id: answer.answer.strip() for answer in payload.answers}
    concepts = session.get("concept_items") or concept_bank(session["topic"])
    concept_lookup = {item["concept"]: item for item in concepts}

    results = []
    saved_answers = []
    for question in session["questions"]:
        answer = answer_map.get(question["id"], "")
        concept_item = concept_lookup[question["concept"]]
        result = grade_answer(answer, concept_item)
        results.append(result)
        saved_answers.append(
            {
                "question_id": question["id"],
                "concept": question["concept"],
                "answer": answer,
                "score": result["score"],
                "feedback": result["feedback"],
            }
        )
        upsert_mastery(state, session, result)

    overall_score = round(sum(result["score"] for result in results) / len(results))
    lesson = build_lesson(results, concepts)
    session.update(
        {
            "answers": saved_answers,
            "results": results,
            "lesson": lesson,
            "overall_score": overall_score,
            "status": "lesson_ready",
            "completed_at": now_utc().isoformat(),
        }
    )
    save_state(state)
    return {
        "session_id": session["id"],
        "overall_score": overall_score,
        "strong_concepts": [r["concept"] for r in results if r["mastery_level"] == "strong"],
        "weak_concepts": [r["concept"] for r in results if r["mastery_level"] != "strong"],
        "concept_results": results,
        "lesson": lesson,
    }


@app.get("/api/dashboard")
def dashboard() -> dict[str, Any]:
    state = load_state()
    today = now_utc()
    mastery = state["concept_mastery"]
    due = [
        item
        for item in mastery
        if datetime.fromisoformat(item["next_revision_at"]) <= today
    ]
    recent_sessions = sorted(state["sessions"], key=lambda item: item["started_at"], reverse=True)[:6]
    return {
        "mastery": mastery,
        "revision_due": due,
        "recent_sessions": recent_sessions,
        "flashcards": state["flashcards"][-12:],
        "notes": state["notes"][-5:],
    }


@app.post("/api/notes")
def create_notes(payload: NotesRequest) -> dict[str, Any]:
    state = load_state()
    note_id = f"note-{len(state['notes']) + 1}"
    cards = extract_flashcards(payload.title.strip(), payload.body.strip())
    note = {
        "id": note_id,
        "title": payload.title.strip(),
        "body": payload.body.strip(),
        "created_at": now_utc().isoformat(),
        "flashcard_count": len(cards),
    }
    for index, card in enumerate(cards, start=1):
        card["id"] = f"{note_id}-card-{index}"
    state["notes"].append(note)
    state["flashcards"].extend(cards)
    save_state(state)
    return {"note": note, "flashcards": cards}


@app.post("/api/review")
def review_concept(payload: ReviewRequest) -> dict[str, Any]:
    state = load_state()
    for item in state["concept_mastery"]:
        if item["concept"].lower() == payload.concept.lower():
            item["times_reviewed"] = item.get("times_reviewed", 0) + 1
            item["last_seen_at"] = now_utc().isoformat()
            if payload.remembered:
                item["mastery_level"] = "strong"
                item["last_score"] = max(item.get("last_score", 0), 85)
            else:
                item["mastery_level"] = "weak"
                item["last_score"] = min(item.get("last_score", 100), 40)
            item["next_revision_at"] = (now_utc() + timedelta(days=revision_delay(item["mastery_level"], payload.remembered))).isoformat()
            save_state(state)
            return {"concept": item}
    raise HTTPException(status_code=404, detail="Concept not found")


@app.post("/api/exam-plans")
def create_exam_plan(payload: ExamPlanRequest) -> dict[str, Any]:
    state = load_state()
    plan = build_exam_plan(payload)
    state["exam_plans"].append(plan)
    save_state(state)
    return {"plan": plan}


@app.get("/api/exam-plans")
def list_exam_plans() -> dict[str, Any]:
    plans = sorted(load_state()["exam_plans"], key=lambda item: item["created_at"], reverse=True)
    return {"plans": plans}


@app.get("/api/study/sessions")
def list_sessions() -> dict[str, list[dict[str, Any]]]:
    return {"sessions": load_state()["sessions"]}


app.mount("/", StaticFiles(directory=PUBLIC_DIR), name="public")
