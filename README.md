# Adaptive AI Tutor App

Local MVP of the Adaptive AI Simulation Tutor.

## Current Features

- diagnostic question generation
- answer grading with a local tutor engine
- weak/strong concept detection
- targeted lessons
- Anki-style revision dates
- memory dashboard
- notes-to-flashcards
- exam calendar and daily plan
- Study City home screen
- XP, levels, streaks, and challenge badges
- topic simulations
- local whiteboard workspace

This version is intentionally local-first and does not require an API key yet.
The tutor logic is rule-based so the product can run immediately on this machine.

## Run

```powershell
python -m pip install -r requirements.txt
python -m uvicorn server:app --host 127.0.0.1 --port 8790
```

Then open:

```text
http://127.0.0.1:8790
```
