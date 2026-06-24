let currentSession = null;
let timerInterval = null;
let timerSeconds = 25 * 60;

const studyForm = document.querySelector("#study-form");
const questionForm = document.querySelector("#question-form");
const questionsEl = document.querySelector("#questions");
const resultsEl = document.querySelector("#results");
const homeContent = document.querySelector("#home-content");
const dashboardContent = document.querySelector("#dashboard-content");
const notesForm = document.querySelector("#notes-form");
const notesOutput = document.querySelector("#notes-output");
const examForm = document.querySelector("#exam-form");
const examOutput = document.querySelector("#exam-output");

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || "Request failed");
  }
  return response.json();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setBusy(button, busy, text) {
  button.disabled = busy;
  button.textContent = busy ? text : button.dataset.defaultText;
}

document.querySelectorAll("button").forEach((button) => {
  button.dataset.defaultText = button.textContent;
});

function openView(viewName) {
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active-view"));
  document.querySelector(`#${viewName}`).classList.add("active-view");
  if (viewName === "home") loadHome();
  if (viewName === "dashboard") loadDashboard();
  if (viewName === "calendar") loadExamPlans();
  if (viewName === "simulation") drawSimulation();
  if (viewName === "whiteboard") resizeWhiteboardView();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".view:not(#home)").forEach((view) => {
  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "back-home";
  backButton.textContent = "Back to Home";
  backButton.addEventListener("click", () => openView("home"));
  view.prepend(backButton);
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    openView(tab.dataset.tab);
  });
});

document.querySelectorAll(".subject-card").forEach((card) => {
  card.addEventListener("click", () => {
    const subject = studyForm.querySelector('input[name="subject"]');
    const topic = studyForm.querySelector('input[name="topic"]');
    subject.value = card.dataset.subject;
    topic.value = card.dataset.topic;
    document.querySelectorAll(".subject-card").forEach((item) => item.classList.remove("selected"));
    card.classList.add("selected");
    applySimulationConfig(card.dataset.topic);
  });
});

function getDoneTargets() {
  return JSON.parse(localStorage.getItem("doneStudyTargets") || "[]");
}

function saveDoneTargets(items) {
  localStorage.setItem("doneStudyTargets", JSON.stringify([...new Set(items)]));
}

function getStudentProfile() {
  const saved = JSON.parse(localStorage.getItem("studentProfile") || "{}");
  return {
    name: saved.name || "Student",
    grade: saved.grade || "Class 10",
    energy: saved.energy || "Focused",
    studyTime: saved.studyTime || "Evening",
  };
}

function saveStudentProfile(profile) {
  localStorage.setItem("studentProfile", JSON.stringify(profile));
}

function getActivityFeed() {
  return JSON.parse(localStorage.getItem("studyActivityFeed") || "[]");
}

function addActivity(message) {
  const feed = getActivityFeed();
  feed.unshift({ message, at: new Date().toISOString() });
  localStorage.setItem("studyActivityFeed", JSON.stringify(feed.slice(0, 12)));
}

function targetKey(plan, day) {
  return `${plan.id}:${day.date}:${day.day}`;
}

function calculateStreak(doneKeys) {
  const dates = new Set(doneKeys.map((key) => key.split(":")[1]).filter(Boolean));
  let streak = 0;
  const cursor = new Date();
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function readinessLabel(score) {
  if (score >= 85) return "Exam ready";
  if (score >= 65) return "Getting strong";
  if (score >= 40) return "Needs steady practice";
  return "Start building momentum";
}

function buildBadgeChallenges(model, dashboard) {
  const strongCount = dashboard.mastery.filter((item) => item.mastery_level === "strong").length;
  const flashcardCount = dashboard.flashcards.length;
  const doneCount = getDoneTargets().length;
  const challengeData = [
    ["First Spark", "Complete your first daily target.", doneCount >= 1, `${Math.min(doneCount, 1)}/1`],
    ["Streak Starter", "Finish targets for 3 different days.", model.streak >= 3, `${Math.min(model.streak, 3)}/3`],
    ["Revision Ninja", "Clear 3 revision reminders.", dashboard.revision_due.length === 0 && dashboard.mastery.length >= 3, dashboard.revision_due.length ? "Keep revising" : "Ready"],
    ["Concept Collector", "Make 3 concepts strong.", strongCount >= 3, `${Math.min(strongCount, 3)}/3`],
    ["Flashcard Forge", "Create at least 5 flashcards from notes.", flashcardCount >= 5, `${Math.min(flashcardCount, 5)}/5`],
    ["Exam Climber", "Reach 70% readiness.", model.readiness >= 70, `${model.readiness}/70`],
    ["Boss Level Ready", "Reach 90% readiness.", model.readiness >= 90, `${model.readiness}/90`],
    ["Plan Finisher", "Complete every day in the exam plan.", model.totalPlanDays > 0 && model.completedPlanDays >= model.totalPlanDays, `${model.completedPlanDays}/${model.totalPlanDays}`],
  ];
  return challengeData.map(([name, description, unlocked, progress]) => ({ name, description, unlocked, progress }));
}

function buildNotifications(model, dashboard) {
  const notes = [];
  if (model.activePlan) notes.push(`${model.activePlan.exam_name} is in ${model.activePlan.days_left} day(s).`);
  if (model.targets.length) notes.push(`Today target: ${model.targets[0].target}`);
  if (dashboard.revision_due.length) notes.push(`${dashboard.revision_due.length} concept(s) need revision.`);
  if (model.readiness < 50) notes.push("Readiness is low. Do one diagnostic or target today.");
  if (!notes.length) notes.push("All clear. Keep your streak alive.");
  return notes.slice(0, 5);
}

function buildMiniCalendar(plan, doneSet) {
  if (!plan) return "";
  const today = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    const day = plan.days.find((item) => item.date === key);
    const done = day && doneSet.has(targetKey(plan, day));
    return `
      <button type="button" class="mini-day ${day ? "has-target" : ""} ${done ? "done" : ""}" ${day ? `data-open-view="calendar"` : ""}>
        <span>${date.toLocaleDateString(undefined, { weekday: "short" })}</span>
        <strong>${date.getDate()}</strong>
        <small>${done ? "Done" : day ? "Target" : "Free"}</small>
      </button>
    `;
  }).join("");
}

function buildStudyCity(model, dashboard) {
  const weakCount = dashboard.revision_due.length;
  const cityHealth = Math.max(12, Math.min(100, model.readiness));
  const buildings = [
    ["study", "Lesson Library", "Diagnostics and tutor lessons", "tower-study", "Start Study"],
    ["calendar", "Exam Tower", `${model.activePlan.days_left} day countdown`, "tower-exam", "Open Calendar"],
    ["dashboard", "Memory Palace", `${weakCount} weak memories to revisit`, "tower-memory", "Enter Palace"],
    ["notes", "Flashcard Forge", `${dashboard.flashcards.length} cards crafted`, "tower-notes", "Open Notes"],
    ["simulation", "Animation Lab", "Topic demos and moving ideas", "tower-sim", "Run Lab"],
    ["whiteboard", "Sketch Studio", "Draw diagrams and formulas", "tower-board", "Open Board"],
  ];
  return `
    <section class="study-city" aria-label="Study City simulation">
      <div class="city-sky">
        <div class="sun-core"></div>
        <div class="city-title">
          <p class="kicker">Study City</p>
          <h2>Walk into a building to study.</h2>
          <p>Your city repairs itself as readiness, memory, and targets improve.</p>
        </div>
        <div class="city-health">
          <span>City Power</span>
          <strong>${cityHealth}%</strong>
        </div>
      </div>
      <div class="city-world">
        <div class="city-road"></div>
        <div class="student-avatar" style="--walk: ${Math.min(85, 12 + model.planProgress)}%">
          <span></span>
        </div>
        ${buildings
          .map(
            ([view, title, detail, cls, action], index) => `
              <button type="button" class="city-building ${cls}" data-open-view="${view}" style="--slot: ${index}">
                <span class="building-roof"></span>
                <strong>${escapeHtml(title)}</strong>
                <small>${escapeHtml(detail)}</small>
                <em>${escapeHtml(action)}</em>
              </button>
            `
          )
          .join("")}
        <div class="city-river"></div>
      </div>
    </section>
  `;
}

function buildHomeModel(dashboard, examData) {
  const today = new Date().toISOString().slice(0, 10);
  const plans = [...examData.plans].sort((a, b) => new Date(a.exam_date) - new Date(b.exam_date));
  const activePlan = plans.find((plan) => plan.exam_date >= today) || plans[0];
  const doneKeys = getDoneTargets();
  const doneSet = new Set(doneKeys);
  const masteryScores = dashboard.mastery.map((item) => item.last_score || 0);
  const masteryAverage = masteryScores.length
    ? Math.round(masteryScores.reduce((sum, score) => sum + score, 0) / masteryScores.length)
    : 20;
  const totalPlanDays = activePlan?.days.length || 0;
  const completedPlanDays = activePlan
    ? activePlan.days.filter((day) => doneSet.has(targetKey(activePlan, day))).length
    : 0;
  const planProgress = totalPlanDays ? Math.round((completedPlanDays / totalPlanDays) * 100) : 0;
  const weakPenalty = Math.min(dashboard.revision_due.length * 4, 20);
  const readiness = Math.max(0, Math.min(100, Math.round(masteryAverage * 0.62 + planProgress * 0.38 - weakPenalty)));
  const todaysPlanDays = activePlan?.days.filter((day) => day.date === today) || [];
  const nextPlanDay = activePlan?.days.find((day) => day.date >= today);
  const targets = todaysPlanDays.length ? todaysPlanDays : nextPlanDay ? [nextPlanDay] : [];
  const xp = doneKeys.length * 25 + dashboard.mastery.filter((item) => item.mastery_level === "strong").length * 40;
  const level = Math.max(1, Math.floor(xp / 120) + 1);
  const streak = calculateStreak(doneKeys);
  const badges = [
    doneKeys.length >= 1 ? "First target done" : "",
    streak >= 3 ? "3 day streak" : "",
    readiness >= 70 ? "Exam climber" : "",
    dashboard.mastery.filter((item) => item.mastery_level === "strong").length >= 3 ? "Concept collector" : "",
  ].filter(Boolean);

  return {
    activePlan,
    badges,
    completedPlanDays,
    doneSet,
    level,
    planProgress,
    readiness,
    streak,
    targets,
    today,
    totalPlanDays,
    xp,
  };
}

function renderHome(model, dashboard) {
  if (!model.activePlan) {
    homeContent.innerHTML = `
      <div class="home-hero no-plan">
        <div>
          <p class="kicker">Home</p>
          <h2>Create an exam plan to unlock countdown, targets, XP, and readiness.</h2>
          <p>Go to Calendar, enter your exam date and syllabus, then this page becomes your daily command center.</p>
        </div>
      </div>
    `;
    return;
  }

  const plan = model.activePlan;
  const countdownText = plan.days_left === 0 ? "Exam day" : `${plan.days_left} days left`;
  const targets = model.targets.length
    ? model.targets
        .map((day) => {
          const done = model.doneSet.has(targetKey(plan, day));
          return `
            <article class="today-task ${done ? "done" : ""}">
              <div>
                <span>${formatPlanDate(day.date, { weekday: "short", day: "numeric", month: "short" })}</span>
                <h3>${escapeHtml(day.target)}</h3>
                <p>${escapeHtml(day.reminder)}</p>
              </div>
              <button type="button" data-complete-target="${escapeHtml(targetKey(plan, day))}">${done ? "Done" : "Mark done"}</button>
            </article>
          `;
        })
        .join("")
    : `<p class="empty">No target found. Create or refresh your exam plan.</p>`;
  const revisionList = dashboard.revision_due.length
    ? dashboard.revision_due.slice(0, 4).map((item) => `<li>${escapeHtml(item.concept)} - ${escapeHtml(item.topic)}</li>`).join("")
    : `<li>No urgent revision due today.</li>`;
  const badges = model.badges.length
    ? model.badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")
    : `<span>Complete a target to earn your first badge</span>`;
  const profile = getStudentProfile();
  const notifications = buildNotifications(model, dashboard).map((note) => `<li>${escapeHtml(note)}</li>`).join("");
  const challenges = buildBadgeChallenges(model, dashboard)
    .map(
      (badge) => `
        <article class="challenge-badge ${badge.unlocked ? "unlocked" : "locked"}">
          <span>${badge.unlocked ? "Unlocked" : "Locked"}</span>
          <h3>${escapeHtml(badge.name)}</h3>
          <p>${escapeHtml(badge.description)}</p>
          <small>${escapeHtml(badge.progress)}</small>
        </article>
      `
    )
    .join("");
  const feed = getActivityFeed();
  const activity = feed.length
    ? feed.slice(0, 6).map((item) => `<li><span>${new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>${escapeHtml(item.message)}</li>`).join("")
    : `<li><span>Now</span>Start studying to create your first activity.</li>`;
  const searchItems = [
    ["Start Study", "Take diagnostic", "study"],
    ["Exam Calendar", plan.exam_name, "calendar"],
    ["Memory", `${dashboard.revision_due.length} revisions due`, "dashboard"],
    ["Notes", `${dashboard.flashcards.length} flashcards`, "notes"],
    ["Simulation Lab", "Animated topic demos", "simulation"],
    ["Whiteboard", "Sketch and solve", "whiteboard"],
  ];
  const searchResults = searchItems
    .map(([title, detail, view]) => `<button type="button" data-search-item="${escapeHtml(title.toLowerCase())} ${escapeHtml(detail.toLowerCase())}" data-open-view="${view}"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></button>`)
    .join("");
  const miniCalendar = buildMiniCalendar(plan, model.doneSet);
  const studyCity = buildStudyCity(model, dashboard);

  homeContent.innerHTML = `
    <div class="app-shell">
      <aside class="app-sidebar">
        <div class="profile-card">
          <div class="avatar">${escapeHtml(profile.name.slice(0, 1).toUpperCase())}</div>
          <input id="profile-name" value="${escapeHtml(profile.name)}" aria-label="Student name" />
          <div class="profile-meta">
            <input id="profile-grade" value="${escapeHtml(profile.grade)}" aria-label="Class or grade" />
            <select id="profile-energy" aria-label="Study energy">
              ${["Focused", "Tired", "Confident", "Need help"].map((item) => `<option ${item === profile.energy ? "selected" : ""}>${item}</option>`).join("")}
            </select>
          </div>
          <button type="button" data-save-profile>Save Profile</button>
        </div>
        <button type="button" class="command-button" data-smart-command>What should I do now?</button>
        <div class="sidebar-menu">
          <button type="button" data-open-view="study">Start Study</button>
          <button type="button" data-open-view="calendar">Calendar</button>
          <button type="button" data-open-view="dashboard">Memory Palace</button>
          <button type="button" data-open-view="notes">Notes</button>
          <button type="button" data-open-view="simulation">Simulation</button>
          <button type="button" data-open-view="whiteboard">Whiteboard</button>
        </div>
      </aside>

      <div class="home-main">
        <div class="home-search">
          <input id="home-search" type="search" placeholder="Search tools, flashcards, calendar, simulation..." />
          <div class="search-results">${searchResults}</div>
        </div>

        <div class="home-hero">
          <div>
            <p class="kicker">Today</p>
            <h2>${escapeHtml(plan.exam_name)}</h2>
            <p>Exam date: ${formatPlanDate(plan.exam_date, { day: "numeric", month: "long", year: "numeric" })}. Your city changes as you study.</p>
          </div>
          <div class="countdown-card">
            <span>Countdown</span>
            <strong>${escapeHtml(countdownText)}</strong>
          </div>
        </div>

        ${studyCity}

        <div class="home-grid">
      <section class="readiness-card">
        <div class="score-ring" style="--score: ${model.readiness}">
          <strong>${model.readiness}%</strong>
          <span>Ready</span>
        </div>
        <div>
          <p class="kicker">Exam Readiness</p>
          <h3>${readinessLabel(model.readiness)}</h3>
          <p>Based on mastery, completed plan days, and revision due.</p>
        </div>
      </section>

      <section class="gamify-card">
        <p class="kicker">Gamification</p>
        <div class="game-stats">
          <span><strong>${model.xp}</strong> XP</span>
          <span><strong>${model.level}</strong> Level</span>
          <span><strong>${model.streak}</strong> day streak</span>
        </div>
        <div class="xp-track"><span style="width: ${model.xp % 120 / 120 * 100}%"></span></div>
        <div class="badge-row">${badges}</div>
      </section>

      <section class="notification-card">
        <p class="kicker">Notifications</p>
        <h3>Reminder center</h3>
        <ul>${notifications}</ul>
      </section>

      <section class="focus-timer">
        <p class="kicker">Focus Timer</p>
        <h3>25:00</h3>
        <div>
          <button type="button" data-timer-start>Start</button>
          <button type="button" data-timer-reset>Reset</button>
        </div>
      </section>

      <section class="today-panel">
        <div class="section-heading">
          <p class="kicker">Targets</p>
          <h2>Today's study targets</h2>
        </div>
        <div class="today-task-list">${targets}</div>
      </section>

      <section class="mini-calendar-card">
        <div class="section-heading">
          <p class="kicker">Next 7 Days</p>
          <h2>Mini calendar</h2>
        </div>
        <div class="mini-calendar">${miniCalendar}</div>
      </section>

      <section class="home-options">
        <div class="section-heading">
          <p class="kicker">Study Tools</p>
          <h2>What do you want to do now?</h2>
        </div>
        <div class="option-grid">
          <button type="button" class="option-card study-option" data-open-view="study">
            <span>01</span>
            <strong>Start Study</strong>
            <small>Take a diagnostic and get a lesson.</small>
          </button>
          <button type="button" class="option-card calendar-option" data-open-view="calendar">
            <span>02</span>
            <strong>Exam Calendar</strong>
            <small>Plan dates, targets, and revision.</small>
          </button>
          <button type="button" class="option-card memory-option" data-open-view="dashboard">
            <span>03</span>
            <strong>Memory Palace</strong>
            <small>Enter rooms where weak memories glow.</small>
          </button>
          <button type="button" class="option-card notes-option" data-open-view="notes">
            <span>04</span>
            <strong>Notes</strong>
            <small>Turn notes into recall cards.</small>
          </button>
          <button type="button" class="option-card sim-option" data-open-view="simulation">
            <span>05</span>
            <strong>Simulation Lab</strong>
            <small>Watch topic animations and demos.</small>
          </button>
          <button type="button" class="option-card board-option" data-open-view="whiteboard">
            <span>06</span>
            <strong>Whiteboard</strong>
            <small>Sketch formulas and diagrams.</small>
          </button>
        </div>
      </section>

      <section class="revision-panel">
        <p class="kicker">Memory</p>
        <h3>Revision reminders</h3>
        <ul>${revisionList}</ul>
      </section>

      <section class="plan-progress-card">
        <p class="kicker">Plan Progress</p>
        <h3>${model.completedPlanDays}/${model.totalPlanDays} planned days completed</h3>
        <div class="progress-bar"><span style="width: ${model.planProgress}%"></span></div>
      </section>

      <section class="activity-card">
        <p class="kicker">Activity</p>
        <h3>Recent study feed</h3>
        <ul>${activity}</ul>
      </section>

      <section class="challenge-board">
        <div class="section-heading">
          <p class="kicker">Badges</p>
          <h2>Challenge badges</h2>
        </div>
        <div class="challenge-grid">${challenges}</div>
      </section>
        </div>
      </div>
    </div>
  `;
}

async function loadHome() {
  if (!homeContent) return;
  const [dashboard, examData] = await Promise.all([api("/api/dashboard"), api("/api/exam-plans")]);
  renderHome(buildHomeModel(dashboard, examData), dashboard);
}

homeContent?.addEventListener("click", (event) => {
  const option = event.target.closest("[data-open-view]");
  if (option) {
    openView(option.dataset.openView);
    return;
  }
  const saveProfileButton = event.target.closest("[data-save-profile]");
  if (saveProfileButton) {
    const profile = {
      name: document.querySelector("#profile-name")?.value.trim() || "Student",
      grade: document.querySelector("#profile-grade")?.value.trim() || "Class 10",
      energy: document.querySelector("#profile-energy")?.value || "Focused",
      studyTime: "Evening",
    };
    saveStudentProfile(profile);
    addActivity("Updated student profile.");
    loadHome();
    return;
  }
  const command = event.target.closest("[data-smart-command]");
  if (command) {
    const revisionDue = document.querySelector(".revision-panel li")?.textContent || "";
    if (revisionDue && !revisionDue.includes("No urgent")) {
      openView("dashboard");
    } else {
      openView("study");
    }
    return;
  }
  if (event.target.closest("[data-timer-start]")) {
    const title = homeContent.querySelector(".focus-timer h3");
    if (timerInterval) return;
    timerInterval = setInterval(() => {
      timerSeconds = Math.max(0, timerSeconds - 1);
      const minutes = String(Math.floor(timerSeconds / 60)).padStart(2, "0");
      const seconds = String(timerSeconds % 60).padStart(2, "0");
      if (title) title.textContent = `${minutes}:${seconds}`;
      if (timerSeconds === 0) {
        clearInterval(timerInterval);
        timerInterval = null;
        addActivity("Completed a 25 minute focus session.");
        loadHome();
      }
    }, 1000);
    return;
  }
  if (event.target.closest("[data-timer-reset]")) {
    clearInterval(timerInterval);
    timerInterval = null;
    timerSeconds = 25 * 60;
    const title = homeContent.querySelector(".focus-timer h3");
    if (title) title.textContent = "25:00";
    return;
  }
  const button = event.target.closest("[data-complete-target]");
  if (!button) return;
  const items = getDoneTargets();
  if (!items.includes(button.dataset.completeTarget)) {
    items.push(button.dataset.completeTarget);
    saveDoneTargets(items);
    addActivity("Completed a daily study target and earned +25 XP.");
  }
  loadHome();
});

homeContent?.addEventListener("input", (event) => {
  if (event.target.id !== "home-search") return;
  const query = event.target.value.trim().toLowerCase();
  homeContent.querySelectorAll("[data-search-item]").forEach((item) => {
    item.classList.toggle("hidden", query && !item.dataset.searchItem.includes(query));
  });
});

studyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = studyForm.querySelector("button");
  const formData = new FormData(studyForm);
  const payload = {
    subject: formData.get("subject").trim(),
    topic: formData.get("topic").trim(),
    level: formData.get("level"),
  };

  setBusy(button, true, "Generating...");
  resultsEl.classList.add("hidden");

  try {
    currentSession = await api("/api/study/start", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    applySimulationConfig(payload.topic);
    renderQuestions(currentSession.questions);
    questionForm.classList.remove("hidden");
    questionForm.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    resultsEl.classList.remove("hidden");
    resultsEl.innerHTML = `<div class="message error">${escapeHtml(error.message)}</div>`;
  } finally {
    setBusy(button, false);
  }
});

function renderQuestions(questions) {
  questionsEl.innerHTML = questions
    .map(
      (question, index) => `
        <article class="question-card">
          <div class="question-meta">Question ${index + 1} · ${escapeHtml(question.concept)}</div>
          <h3>${escapeHtml(question.question)}</h3>
          <textarea name="${escapeHtml(question.id)}" required minlength="1" placeholder="Type your answer here"></textarea>
        </article>
      `
    )
    .join("");
}

questionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentSession) return;
  const button = questionForm.querySelector("button");
  const formData = new FormData(questionForm);
  const answers = currentSession.questions.map((question) => ({
    question_id: question.id,
    answer: formData.get(question.id),
  }));

  setBusy(button, true, "Grading...");
  try {
    const graded = await api("/api/study/submit", {
      method: "POST",
      body: JSON.stringify({ session_id: currentSession.session_id, answers }),
    });
    renderResults(graded);
    resultsEl.classList.remove("hidden");
    resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
    loadDashboard();
  } catch (error) {
    resultsEl.classList.remove("hidden");
    resultsEl.innerHTML = `<div class="message error">${escapeHtml(error.message)}</div>`;
  } finally {
    setBusy(button, false);
  }
});

function renderResults(data) {
  const conceptRows = data.concept_results
    .map(
      (result) => `
        <li class="concept-row ${result.mastery_level}">
          <span>
            <strong>${escapeHtml(result.concept)}</strong>
            <small>${escapeHtml(result.feedback)}</small>
          </span>
          <b>${result.score}%</b>
        </li>
      `
    )
    .join("");

  const lessonSections = data.lesson.sections
    .map(
      (section) => `
        <article class="lesson-section">
          <h3>${escapeHtml(section.concept)}</h3>
          <p>${escapeHtml(section.explanation)}</p>
          <p><strong>Example:</strong> ${escapeHtml(section.example)}</p>
        </article>
      `
    )
    .join("");

  resultsEl.innerHTML = `
    <div class="section-heading">
      <p class="kicker">Results</p>
      <h2>Score: ${data.overall_score}%</h2>
      <p>The tutor built a lesson from the weak concepts and saved revision dates.</p>
    </div>
    <ul class="concept-list">${conceptRows}</ul>
    <div class="lesson">
      <h2>${escapeHtml(data.lesson.lesson_title)}</h2>
      ${lessonSections}
      <div class="followups">
        <strong>Follow-up questions</strong>
        <ol>${data.lesson.follow_up_questions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
      </div>
    </div>
  `;
}

async function loadDashboard() {
  const data = await api("/api/dashboard");
  const masteryCards = data.mastery.length
    ? data.mastery
        .map(
          (item) => `
            <article class="memory-card ${item.mastery_level}">
              <div>
                <h3>${escapeHtml(item.concept)}</h3>
                <p>${escapeHtml(item.subject)} · ${escapeHtml(item.topic)}</p>
              </div>
              <span>${item.last_score}% · ${escapeHtml(item.mastery_level)}</span>
              <small>Next revision: ${new Date(item.next_revision_at).toLocaleString()}</small>
              <div class="review-actions">
                <button data-review="${escapeHtml(item.concept)}" data-remembered="true">Remembered</button>
                <button data-review="${escapeHtml(item.concept)}" data-remembered="false">Forgot</button>
              </div>
            </article>
          `
        )
        .join("")
    : `<p class="empty">No memory yet. Complete a diagnostic first.</p>`;

  const due = data.revision_due.length
    ? data.revision_due.map((item) => `<li>${escapeHtml(item.concept)} · ${escapeHtml(item.topic)}</li>`).join("")
    : `<li>Nothing due right now.</li>`;

  const flashcards = data.flashcards.length
    ? data.flashcards
        .map(
          (card) => `
            <article class="flashcard">
              <strong>${escapeHtml(card.front)}</strong>
              <p>${escapeHtml(card.back)}</p>
            </article>
          `
        )
        .join("")
    : `<p class="empty">No flashcards yet. Add notes to create some.</p>`;

  dashboardContent.innerHTML = `
    <section class="dashboard-block">
      <h3>Concept mastery</h3>
      <div class="card-list">${masteryCards}</div>
    </section>
    <section class="dashboard-block">
      <h3>Revision due</h3>
      <ul class="due-list">${due}</ul>
    </section>
    <section class="dashboard-block wide">
      <h3>Recent flashcards</h3>
      <div class="card-list">${flashcards}</div>
    </section>
  `;

  dashboardContent.querySelectorAll("[data-review]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api("/api/review", {
        method: "POST",
        body: JSON.stringify({
          concept: button.dataset.review,
          remembered: button.dataset.remembered === "true",
        }),
      });
      loadDashboard();
    });
  });
}

notesForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = notesForm.querySelector("button");
  const formData = new FormData(notesForm);
  setBusy(button, true, "Creating...");
  try {
    const data = await api("/api/notes", {
      method: "POST",
      body: JSON.stringify({
        title: formData.get("title").trim(),
        body: formData.get("body").trim(),
      }),
    });
    notesOutput.innerHTML = data.flashcards
      .map(
        (card) => `
          <article class="flashcard">
            <strong>${escapeHtml(card.front)}</strong>
            <p>${escapeHtml(card.back)}</p>
          </article>
        `
      )
      .join("");
    loadDashboard();
  } catch (error) {
    notesOutput.innerHTML = `<div class="message error">${escapeHtml(error.message)}</div>`;
  } finally {
    setBusy(button, false);
  }
});

function setDefaultExamDate() {
  const dateInput = examForm?.querySelector('input[name="exam_date"]');
  if (!dateInput || dateInput.value) return;
  const date = new Date();
  date.setDate(date.getDate() + 21);
  dateInput.value = date.toISOString().slice(0, 10);
}

function parsePlanDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatPlanDate(value, options = {}) {
  return parsePlanDate(value).toLocaleDateString(undefined, options);
}

function buildCalendarMonths(plan) {
  const byDate = new Map(plan.days.map((day) => [day.date, day]));
  const start = parsePlanDate(plan.days[0]?.date || new Date().toISOString().slice(0, 10));
  const end = parsePlanDate(plan.exam_date);
  const months = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor <= last) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];

    for (let index = 0; index < firstDay.getDay(); index += 1) {
      cells.push({ empty: true });
    }

    for (let dateNumber = 1; dateNumber <= daysInMonth; dateNumber += 1) {
      const date = new Date(year, month, dateNumber);
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(dateNumber).padStart(2, "0")}`;
      cells.push({
        key,
        dateNumber,
        planDay: byDate.get(key),
        isExam: key === plan.exam_date,
        isPast: date < start,
      });
    }

    months.push({
      title: firstDay.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
      cells,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

function getCalendarDayKind(day) {
  if (!day) return "rest";
  if (day.target.toLowerCase().includes("revise") || day.minutes.revise >= day.minutes.learn) return "revision";
  return "study";
}

function renderCalendarMonth(month, today, plan) {
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const cells = month.cells
    .map((cell) => {
      if (cell.empty) return `<div class="calendar-cell empty-cell" aria-hidden="true"></div>`;
      const day = cell.planDay;
      const kind = getCalendarDayKind(day);
      const detailId = day ? `${plan.id}-${day.date}` : "";
      const cellTag = day ? "button" : "div";
      const classes = [
        "calendar-cell",
        day ? "planned" : "",
        `kind-${kind}`,
        cell.key === today ? "today" : "",
        cell.isExam ? "exam-date" : "",
        cell.isPast ? "outside-plan" : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `
        <${cellTag} class="${classes}" ${day ? `type="button" data-detail-id="${detailId}" aria-label="Open target for ${formatPlanDate(day.date, { day: "numeric", month: "short" })}"` : ""}>
          <div class="calendar-date-row">
            <strong>${cell.dateNumber}</strong>
            ${day ? `<span>Day ${day.day}</span>` : ""}
            ${cell.isExam ? `<span class="exam-badge">Exam</span>` : ""}
          </div>
          ${
            day
              ? `
                <h3>${escapeHtml(day.target)}</h3>
                <p>${escapeHtml(day.reminder)}</p>
                <div class="calendar-time">
                  <span>L ${day.minutes.learn}m</span>
                  <span>P ${day.minutes.practice}m</span>
                  <span>R ${day.minutes.revise}m</span>
                </div>
              `
              : `<p class="calendar-rest">No target</p>`
          }
        </${cellTag}>
      `;
    })
    .join("");

  return `
    <section class="calendar-month">
      <h3>${escapeHtml(month.title)}</h3>
      <div class="calendar-weekdays">${weekdays.map((day) => `<span>${day}</span>`).join("")}</div>
      <div class="calendar-grid">${cells}</div>
    </section>
  `;
}

function renderExamPlan(plan) {
  const today = new Date().toISOString().slice(0, 10);
  const calendarMonths = buildCalendarMonths(plan).map((month) => renderCalendarMonth(month, today, plan)).join("");
  const nextDay = plan.days.find((day) => day.date >= today) || plan.days[plan.days.length - 1];
  const dayDetails = plan.days
    .map(
      (day) => `
        <article class="day-detail-card ${day.date === nextDay?.date ? "active" : "hidden"}" data-detail-card="${plan.id}-${day.date}">
          <div class="day-detail-top">
            <span>${formatPlanDate(day.date, { weekday: "long", day: "numeric", month: "long" })}</span>
            <strong>Day ${day.day}</strong>
          </div>
          <h3>${escapeHtml(day.target)}</h3>
          <ul>${day.tasks.map((task) => `<li>${escapeHtml(task)}</li>`).join("")}</ul>
          <div class="time-split">
            <span>Learn ${day.minutes.learn}m</span>
            <span>Practice ${day.minutes.practice}m</span>
            <span>Revise ${day.minutes.revise}m</span>
          </div>
          <p class="reminder">Reminder: ${escapeHtml(day.reminder)}</p>
        </article>
      `
    )
    .join("");

  return `
    <section class="exam-plan">
      <div class="exam-summary">
        <div>
          <p class="kicker">Saved Plan</p>
          <h2>${escapeHtml(plan.exam_name)}</h2>
          <p>Exam date: ${new Date(plan.exam_date).toLocaleDateString()} · ${plan.days_left} day(s) left</p>
        </div>
        <div class="plan-metrics">
          <span><strong>${plan.summary.total_topics}</strong> topics</span>
          <span><strong>${plan.summary.study_days}</strong> study days</span>
          <span><strong>${plan.daily_minutes}</strong> min/day</span>
        </div>
      </div>
      <div class="strategy-card">
        <strong>AI tutor strategy</strong>
        <p>${escapeHtml(plan.summary.strategy)}</p>
        <p>${escapeHtml(plan.summary.pace)}</p>
      </div>
      ${
        nextDay
          ? `
            <div class="today-target">
              <span>Next target</span>
              <strong>${formatPlanDate(nextDay.date, { weekday: "short", day: "numeric", month: "short" })}</strong>
              <p>${escapeHtml(nextDay.target)}</p>
            </div>
          `
          : ""
      }
      <div class="topic-pills">${plan.topics.map((topic) => `<span>${escapeHtml(topic)}</span>`).join("")}</div>
      <div class="calendar-legend" aria-label="Calendar color key">
        <span><i class="legend-study"></i> Study day</span>
        <span><i class="legend-revision"></i> Revision day</span>
        <span><i class="legend-today"></i> Today</span>
        <span><i class="legend-exam"></i> Exam date</span>
      </div>
      <div class="calendar-detail-panel">
        <div>
          <p class="kicker">Click a Date</p>
          <h2>Daily target</h2>
        </div>
        <div class="day-detail-list">${dayDetails}</div>
      </div>
      <div class="exam-calendar">${calendarMonths}</div>
    </section>
  `;
}

async function loadExamPlans() {
  if (!examOutput) return;
  const data = await api("/api/exam-plans");
  if (!data.plans.length) {
    examOutput.innerHTML = `<p class="empty">No exam plan yet. Create one above.</p>`;
    return;
  }
  examOutput.innerHTML = data.plans.map(renderExamPlan).join("");
}

examOutput?.addEventListener("click", (event) => {
  const dateButton = event.target.closest(".calendar-cell[data-detail-id]");
  if (!dateButton) return;
  const plan = dateButton.closest(".exam-plan");
  const detailId = dateButton.dataset.detailId;
  plan.querySelectorAll(".calendar-cell.selected").forEach((cell) => cell.classList.remove("selected"));
  dateButton.classList.add("selected");
  plan.querySelectorAll(".day-detail-card").forEach((card) => {
    card.classList.toggle("hidden", card.dataset.detailCard !== detailId);
    card.classList.toggle("active", card.dataset.detailCard === detailId);
  });
  plan.querySelector(".calendar-detail-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

examForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = examForm.querySelector("button");
  const formData = new FormData(examForm);
  setBusy(button, true, "Planning...");
  try {
    const data = await api("/api/exam-plans", {
      method: "POST",
      body: JSON.stringify({
        exam_name: formData.get("exam_name").trim(),
        exam_date: formData.get("exam_date"),
        syllabus: formData.get("syllabus").trim(),
        daily_minutes: Number(formData.get("daily_minutes")),
      }),
    });
    examOutput.innerHTML = renderExamPlan(data.plan);
  } catch (error) {
    examOutput.innerHTML = `<div class="message error">${escapeHtml(error.message)}</div>`;
  } finally {
    setBusy(button, false);
  }
});

const canvas = document.querySelector("#force-canvas");
const ctx = canvas.getContext("2d");
const forceInput = document.querySelector("#force");
const massInput = document.querySelector("#mass");
const forceValue = document.querySelector("#force-value");
const massValue = document.querySelector("#mass-value");
const accelValue = document.querySelector("#accel-value");
const forceLabel = document.querySelector("#force-label");
const massLabel = document.querySelector("#mass-label");
const metricLabel = document.querySelector("#metric-label");
const forceUnit = document.querySelector("#force-unit");
const massUnit = document.querySelector("#mass-unit");
const metricUnit = document.querySelector("#metric-unit");
const simTitle = document.querySelector("#sim-title");
const simDescription = document.querySelector("#sim-description");
const playSimulation = document.querySelector("#play-simulation");
const resetSimulation = document.querySelector("#reset-simulation");
const simStatus = document.querySelector("#sim-status");
let simulationPlaying = false;
let simulationFrame = null;
let simulationStart = 0;
let currentSimulationKey = "newton";

const simulationConfigs = {
  newton: {
    title: "Newton's second law simulation",
    description: "Press play and watch force and mass change automatically.",
    labels: ["Force", "Mass", "Acceleration"],
    units: ["N", "kg", "m/s²"],
    ranges: [[1, 50, 20], [1, 20, 5]],
    metric: (a, b) => a / b,
    ready: "Ready: stronger force creates more acceleration.",
    complete: "Demo complete: acceleration depends on both force and mass.",
    scenes: [
      { duration: 2500, from: [8, 12], to: [20, 12], message: "Scene 1: same mass, stronger force, acceleration rises." },
      { duration: 2500, from: [20, 12], to: [20, 4], message: "Scene 2: same force, lower mass, acceleration rises again." },
      { duration: 2500, from: [20, 4], to: [12, 16], message: "Scene 3: weaker force and heavier mass make acceleration smaller." },
    ],
  },
  derivatives: {
    title: "Derivative tangent simulation",
    description: "Watch two points come together until a secant line becomes a tangent line.",
    labels: ["Point x", "Gap h", "Slope"],
    units: ["", "", ""],
    ranges: [[-5, 5, 1], [1, 10, 8]],
    metric: (x, h) => 2 * x + h / 5,
    ready: "Ready: the gap starts wide, then shrinks toward a tangent.",
    complete: "Demo complete: as h shrinks, the secant slope approaches the derivative.",
    scenes: [
      { duration: 2600, from: [-3, 9], to: [0, 6], message: "Scene 1: a secant line measures average change across a wide gap." },
      { duration: 2600, from: [0, 6], to: [2, 2], message: "Scene 2: the two points move closer together." },
      { duration: 2600, from: [2, 2], to: [2, 1], message: "Scene 3: the secant almost becomes the tangent at one point." },
    ],
  },
  photosynthesis: {
    title: "Photosynthesis flow simulation",
    description: "Watch light and water drive glucose production in a leaf.",
    labels: ["Light", "Water", "Glucose"],
    units: ["%", "%", "%"],
    ranges: [[0, 100, 55], [0, 100, 60]],
    metric: (light, water) => Math.sqrt(light * water),
    ready: "Ready: glucose rises when both light and water are available.",
    complete: "Demo complete: photosynthesis needs inputs working together.",
    scenes: [
      { duration: 2500, from: [25, 70], to: [80, 70], message: "Scene 1: more light gives the leaf more energy." },
      { duration: 2500, from: [80, 30], to: [80, 85], message: "Scene 2: water also matters; light alone is not enough." },
      { duration: 2500, from: [40, 40], to: [95, 95], message: "Scene 3: strong light plus enough water creates more glucose." },
    ],
  },
  fractions: {
    title: "Equivalent fractions simulation",
    description: "Watch the same amount split into different numbers of equal parts.",
    labels: ["Numerator", "Denominator", "Value"],
    units: ["", "parts", ""],
    ranges: [[1, 10, 1], [2, 12, 2]],
    metric: (num, den) => Math.min(num, den) / Math.max(den, 1),
    ready: "Ready: the same value can be represented with different pieces.",
    complete: "Demo complete: equivalent fractions keep the same shaded amount.",
    scenes: [
      { duration: 2500, from: [1, 2], to: [2, 4], message: "Scene 1: 1/2 and 2/4 shade the same amount." },
      { duration: 2500, from: [2, 4], to: [3, 6], message: "Scene 2: more pieces can still represent the same half." },
      { duration: 2500, from: [3, 6], to: [4, 8], message: "Scene 3: equivalent fractions look different but have equal value." },
    ],
  },
  generic: {
    title: "Concept map simulation",
    description: "Watch a topic move from basic ideas into connected understanding.",
    labels: ["Clarity", "Examples", "Mastery"],
    units: ["%", "%", "%"],
    ranges: [[0, 100, 30], [0, 100, 20]],
    metric: (clarity, examples) => clarity * 0.55 + examples * 0.45,
    ready: "Ready: stronger definitions plus examples create better mastery.",
    complete: "Demo complete: understanding grows when ideas connect to examples.",
    scenes: [
      { duration: 2400, from: [20, 15], to: [55, 25], message: "Scene 1: first build a clear definition." },
      { duration: 2400, from: [55, 25], to: [65, 75], message: "Scene 2: examples make the idea usable." },
      { duration: 2400, from: [65, 75], to: [92, 88], message: "Scene 3: connected ideas become mastery." },
    ],
  },
};

function simulationKeyForTopic(topic = "") {
  const lowered = topic.toLowerCase();
  if (lowered.includes("derivative") || lowered.includes("calculus") || lowered.includes("tangent")) return "derivatives";
  if (lowered.includes("photo") || lowered.includes("plant") || lowered.includes("chlorophyll")) return "photosynthesis";
  if (lowered.includes("fraction") || lowered.includes("denominator") || lowered.includes("numerator")) return "fractions";
  if (lowered.includes("newton") || lowered.includes("force") || lowered.includes("motion")) return "newton";
  return "generic";
}

function activeSimulation() {
  return simulationConfigs[currentSimulationKey] || simulationConfigs.generic;
}

function applySimulationConfig(topic = "") {
  stopSimulation();
  currentSimulationKey = simulationKeyForTopic(topic);
  const config = activeSimulation();
  simTitle.textContent = config.title;
  simDescription.textContent = config.description;
  forceLabel.textContent = config.labels[0];
  massLabel.textContent = config.labels[1];
  metricLabel.textContent = config.labels[2];
  forceUnit.textContent = config.units[0];
  massUnit.textContent = config.units[1];
  metricUnit.textContent = config.units[2];
  forceInput.min = config.ranges[0][0];
  forceInput.max = config.ranges[0][1];
  forceInput.value = config.ranges[0][2];
  massInput.min = config.ranges[1][0];
  massInput.max = config.ranges[1][1];
  massInput.value = config.ranges[1][2];
  simStatus.textContent = config.ready;
  drawSimulation(0);
}

function drawCanvasBase() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  bg.addColorStop(0, "#f7f8fc");
  bg.addColorStop(1, "#fff4df");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawSimulation(progress = 0) {
  const a = Number(forceInput.value);
  const b = Number(massInput.value);
  const config = activeSimulation();
  const metric = config.metric(a, b);
  forceValue.textContent = a;
  massValue.textContent = b;
  accelValue.textContent = metric.toFixed(currentSimulationKey === "fractions" ? 2 : 1);
  drawCanvasBase();
  if (currentSimulationKey === "derivatives") drawDerivativeSimulation(a, b, metric);
  else if (currentSimulationKey === "photosynthesis") drawPhotosynthesisSimulation(a, b, metric, progress);
  else if (currentSimulationKey === "fractions") drawFractionsSimulation(a, b);
  else if (currentSimulationKey === "generic") drawGenericSimulation(a, b, metric);
  else drawNewtonSimulation(a, b, metric, progress);
}

function drawNewtonSimulation(force, mass, acceleration, progress) {
  ctx.fillStyle = "#d7deef";
  ctx.fillRect(40, 235, 640, 16);
  const motionOffset = progress * Math.min(360, acceleration * 70);
  const boxX = Math.min(520, 80 + motionOffset);
  const boxWidth = 80 + mass * 4;
  const bodyGradient = ctx.createLinearGradient(boxX, 160, boxX + boxWidth, 235);
  bodyGradient.addColorStop(0, "#3657d6");
  bodyGradient.addColorStop(1, "#7c3aed");
  ctx.fillStyle = bodyGradient;
  ctx.fillRect(boxX, 160, boxWidth, 75);
  ctx.fillStyle = "#1b2340";
  ctx.beginPath();
  ctx.arc(boxX + 20, 242, 10, 0, Math.PI * 2);
  ctx.arc(boxX + boxWidth - 20, 242, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 16px Segoe UI";
  ctx.fillText(`${mass} kg`, boxX + 16, 204);
  ctx.strokeStyle = "#e84f5f";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(boxX - 70, 198);
  ctx.lineTo(boxX - 8, 198);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(boxX - 8, 198);
  ctx.lineTo(boxX - 24, 184);
  ctx.lineTo(boxX - 24, 212);
  ctx.closePath();
  ctx.fillStyle = "#e84f5f";
  ctx.fill();
  ctx.fillStyle = "#172033";
  ctx.font = "700 18px Segoe UI";
  ctx.fillText(`F = ${force} N`, boxX - 74, 172);
  ctx.fillText(`a = F / m = ${acceleration.toFixed(1)} m/s²`, 40, 50);
}

function drawDerivativeSimulation(x, h, slope) {
  const originX = 360;
  const originY = 190;
  const scale = 34;
  ctx.strokeStyle = "#c8d2e8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, originY);
  ctx.lineTo(680, originY);
  ctx.moveTo(originX, 40);
  ctx.lineTo(originX, 285);
  ctx.stroke();
  ctx.strokeStyle = "#3657d6";
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let px = -7; px <= 7; px += 0.15) {
    const py = 0.12 * px * px;
    const cx = originX + px * scale;
    const cy = originY - py * scale;
    if (px <= -6.99) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  }
  ctx.stroke();
  const hScaled = h / 2;
  const y1 = 0.12 * x * x;
  const y2 = 0.12 * (x + hScaled) * (x + hScaled);
  const p1 = { x: originX + x * scale, y: originY - y1 * scale };
  const p2 = { x: originX + (x + hScaled) * scale, y: originY - y2 * scale };
  const lineSlope = (p2.y - p1.y) / Math.max(p2.x - p1.x, 1);
  ctx.strokeStyle = "#ff6b6b";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(p1.x - 140, p1.y - lineSlope * 140);
  ctx.lineTo(p2.x + 140, p2.y + lineSlope * 140);
  ctx.stroke();
  [p1, p2].forEach((point, index) => {
    ctx.fillStyle = index === 0 ? "#7c3aed" : "#ffca3a";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 9, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = "#172033";
  ctx.font = "700 18px Segoe UI";
  ctx.fillText(`secant slope ≈ ${slope.toFixed(1)}`, 42, 48);
  ctx.fillText(`h = ${h}`, 42, 78);
}

function drawPhotosynthesisSimulation(light, water, glucose, progress) {
  ctx.fillStyle = "#ffca3a";
  ctx.beginPath();
  ctx.arc(92, 78, 34 + light * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0f9f9a";
  ctx.beginPath();
  ctx.ellipse(365, 176, 150, 76, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#43aa8b";
  ctx.beginPath();
  ctx.ellipse(390, 176, 105, 45, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(245, 185);
  ctx.quadraticCurveTo(360, 145, 500, 175);
  ctx.stroke();
  ctx.strokeStyle = "#3657d6";
  ctx.lineWidth = 5;
  for (let i = 0; i < 4; i++) {
    const x = 210 + i * 46;
    ctx.beginPath();
    ctx.moveTo(x, 292);
    ctx.bezierCurveTo(x - 20, 260, x + 24, 245, x, 218);
    ctx.stroke();
  }
  ctx.fillStyle = "#7c3aed";
  const bubbles = Math.max(3, Math.round(glucose / 12));
  for (let i = 0; i < bubbles; i++) {
    const angle = i * 0.9 + progress * 3;
    ctx.beginPath();
    ctx.arc(530 + Math.cos(angle) * 55, 132 + Math.sin(angle) * 38, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#172033";
  ctx.font = "700 18px Segoe UI";
  ctx.fillText(`glucose output ≈ ${glucose.toFixed(1)}%`, 42, 48);
  ctx.fillText("light + water -> glucose + oxygen", 42, 78);
}

function drawFractionsSimulation(numerator, denominator) {
  const den = Math.max(1, denominator);
  const num = Math.min(numerator, den);
  ctx.fillStyle = "#172033";
  ctx.font = "700 20px Segoe UI";
  ctx.fillText(`${num}/${den}`, 42, 52);
  const x = 70;
  const y = 116;
  const width = 560;
  const height = 92;
  const partWidth = width / den;
  for (let i = 0; i < den; i++) {
    ctx.fillStyle = i < num ? "#ff6b6b" : "#ffffff";
    ctx.fillRect(x + i * partWidth, y, partWidth, height);
    ctx.strokeStyle = "#243049";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + i * partWidth, y, partWidth, height);
  }
  ctx.fillStyle = "#3657d6";
  ctx.fillRect(x, y + 130, width * (num / den), 24);
  ctx.strokeStyle = "#243049";
  ctx.strokeRect(x, y + 130, width, 24);
  ctx.fillStyle = "#172033";
  ctx.font = "700 17px Segoe UI";
  ctx.fillText("The shaded amount is the value. More pieces can still show the same amount.", 70, 285);
}

function drawGenericSimulation(clarity, examples, mastery) {
  const nodes = [
    { label: "Definition", value: clarity, x: 170, y: 112, color: "#3657d6" },
    { label: "Examples", value: examples, x: 360, y: 212, color: "#ff6b6b" },
    { label: "Mastery", value: mastery, x: 555, y: 112, color: "#0f9f9a" },
  ];
  ctx.strokeStyle = "#c8d2e8";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(nodes[0].x, nodes[0].y);
  ctx.lineTo(nodes[1].x, nodes[1].y);
  ctx.lineTo(nodes[2].x, nodes[2].y);
  ctx.stroke();
  nodes.forEach((node) => {
    ctx.fillStyle = node.color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, 28 + node.value * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 16px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(node.value)}%`, node.x, node.y + 5);
    ctx.fillStyle = "#172033";
    ctx.fillText(node.label, node.x, node.y + 74);
  });
  ctx.textAlign = "left";
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function setSimulationValues(force, mass) {
  forceInput.value = String(Math.round(force));
  massInput.value = String(Math.round(mass));
}

function stopSimulation() {
  simulationPlaying = false;
  playSimulation.textContent = "Play demo";
  if (simulationFrame) {
    cancelAnimationFrame(simulationFrame);
    simulationFrame = null;
  }
}

function animateSimulation(timestamp) {
  if (!simulationStart) simulationStart = timestamp;
  const elapsed = timestamp - simulationStart;
  const scenes = activeSimulation().scenes;
  const totalDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0);
  let cursor = 0;
  let activeScene = scenes[0];
  let sceneElapsed = elapsed;

  for (const scene of scenes) {
    if (elapsed <= cursor + scene.duration) {
      activeScene = scene;
      sceneElapsed = elapsed - cursor;
      break;
    }
    cursor += scene.duration;
  }

  if (elapsed >= totalDuration) {
    const last = scenes[scenes.length - 1];
    setSimulationValues(last.to[0], last.to[1]);
    simStatus.textContent = activeSimulation().complete;
    drawSimulation(1);
    stopSimulation();
    return;
  }

  const sceneProgress = Math.max(0, Math.min(1, sceneElapsed / activeScene.duration));
  const eased = 0.5 - Math.cos(sceneProgress * Math.PI) / 2;
  setSimulationValues(
    lerp(activeScene.from[0], activeScene.to[0], eased),
    lerp(activeScene.from[1], activeScene.to[1], eased)
  );
  simStatus.textContent = activeScene.message;
  drawSimulation(sceneProgress);
  simulationFrame = requestAnimationFrame(animateSimulation);
}

function startSimulation() {
  stopSimulation();
  simulationPlaying = true;
  simulationStart = 0;
  playSimulation.textContent = "Pause demo";
  simulationFrame = requestAnimationFrame(animateSimulation);
}

[forceInput, massInput].forEach((input) =>
  input.addEventListener("input", () => {
    stopSimulation();
    simStatus.textContent = "Manual mode: press play to let the tutor run the demo.";
    drawSimulation(0.45);
  })
);

playSimulation.addEventListener("click", () => {
  if (simulationPlaying) {
    stopSimulation();
    simStatus.textContent = "Paused. Press play to restart the guided demo.";
    return;
  }
  startSimulation();
});

resetSimulation.addEventListener("click", () => {
  stopSimulation();
  applySimulationConfig(studyForm.querySelector('input[name="topic"]').value);
});

loadDashboard();
setDefaultExamDate();
loadExamPlans();
applySimulationConfig(studyForm.querySelector('input[name="topic"]').value);

const board = document.querySelector("#whiteboard-canvas");
const boardCtx = board.getContext("2d");
const inkColor = document.querySelector("#ink-color");
const penSize = document.querySelector("#pen-size");
const saveBoard = document.querySelector("#save-board");
const clearBoard = document.querySelector("#clear-board");
const boardStatus = document.querySelector("#whiteboard-status");
let drawing = false;
let lastPoint = null;

function boardPoint(event) {
  const rect = board.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * board.width,
    y: ((event.clientY - rect.top) / rect.height) * board.height,
  };
}

function restoreBoard() {
  boardCtx.fillStyle = "#ffffff";
  boardCtx.fillRect(0, 0, board.width, board.height);
  const saved = localStorage.getItem("adaptiveTutorWhiteboard");
  if (!saved) return;
  const image = new Image();
  image.onload = () => boardCtx.drawImage(image, 0, 0, board.width, board.height);
  image.src = saved;
}

function resizeWhiteboardView() {
  if (!localStorage.getItem("adaptiveTutorWhiteboard")) {
    restoreBoard();
  }
}

board.addEventListener("pointerdown", (event) => {
  drawing = true;
  lastPoint = boardPoint(event);
  board.setPointerCapture(event.pointerId);
});

board.addEventListener("pointermove", (event) => {
  if (!drawing || !lastPoint) return;
  const next = boardPoint(event);
  boardCtx.strokeStyle = inkColor.value;
  boardCtx.lineWidth = Number(penSize.value);
  boardCtx.lineCap = "round";
  boardCtx.lineJoin = "round";
  boardCtx.beginPath();
  boardCtx.moveTo(lastPoint.x, lastPoint.y);
  boardCtx.lineTo(next.x, next.y);
  boardCtx.stroke();
  lastPoint = next;
});

board.addEventListener("pointerup", () => {
  drawing = false;
  lastPoint = null;
});

board.addEventListener("pointerleave", () => {
  drawing = false;
  lastPoint = null;
});

saveBoard.addEventListener("click", () => {
  localStorage.setItem("adaptiveTutorWhiteboard", board.toDataURL("image/png"));
  boardStatus.textContent = "Board saved in this browser.";
});

clearBoard.addEventListener("click", () => {
  localStorage.removeItem("adaptiveTutorWhiteboard");
  restoreBoard();
  boardStatus.textContent = "Board cleared.";
});

restoreBoard();
loadHome();
