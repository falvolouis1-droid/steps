const STORAGE_KEY = "steps-tracker-v2";
const LEGACY_STORAGE_KEY = "steps-tracker-v1";
const STEPS_PER_MINUTE = (60 * 8) / 4.37;

const homeScreen = document.querySelector(".home-screen");
const trackScreen = document.querySelector(".track-screen");
const pageShell = document.querySelector(".page-shell");
const totalBar = document.querySelector(".total-bar");
const navigationLinks = document.querySelectorAll(".nav-link");
const logForm = document.querySelector(".log-form");
const minuteInput = document.querySelector(".minute-input");
const sessionCount = document.querySelector(".session-count");
const totalCount = document.querySelector(".total-count");
const logStatus = document.querySelector(".log-status");
const stepsLogList = document.querySelector(".steps-log-list");
const completeDayButton = document.querySelector(".complete-day-button");

const numberFormat = new Intl.NumberFormat();
let progress = {
  entries: [],
  completedDays: [],
};
const animations = new WeakMap();

function formatNumber(value) {
  return numberFormat.format(value);
}

function stepsForMinutes(minutes) {
  return Math.round(minutes * STEPS_PER_MINUTE);
}

function currentTotalSteps() {
  return progress.entries.reduce((total, entry) => total + entry.steps, 0);
}

function lifetimeTotalSteps() {
  const completedSteps = progress.completedDays.reduce((total, day) => total + day.steps, 0);
  return completedSteps + currentTotalSteps();
}

function currentTotalMinutes() {
  return progress.entries.reduce((total, entry) => total + entry.minutes, 0);
}

function isValidEntry(entry) {
  return (
    entry !== null &&
    Number.isFinite(entry.minutes) &&
    entry.minutes > 0 &&
    Number.isSafeInteger(entry.steps) &&
    entry.steps === stepsForMinutes(entry.minutes) &&
    typeof entry.loggedAt === "string" &&
    Number.isFinite(Date.parse(entry.loggedAt))
  );
}

function isValidDay(day) {
  if (
    day === null ||
    typeof day !== "object" ||
    !Array.isArray(day.entries) ||
    day.entries.length === 0 ||
    !day.entries.every(isValidEntry)
  ) {
    return false;
  }

  const dayMinutes = day.entries.reduce((total, entry) => total + entry.minutes, 0);
  const daySteps = day.entries.reduce((total, entry) => total + entry.steps, 0);

  return (
    typeof day.completedAt === "string" &&
    Number.isFinite(Date.parse(day.completedAt)) &&
    Number.isFinite(day.minutes) &&
    day.minutes > 0 &&
    day.minutes === dayMinutes &&
    Number.isSafeInteger(day.steps) &&
    day.steps === daySteps
  );
}

function updateScreen() {
  const isTracking = window.location.hash === "#track";

  homeScreen.hidden = isTracking;
  trackScreen.hidden = !isTracking;
  totalBar.hidden = !isTracking;
  pageShell.classList.toggle("is-tracking", isTracking);

  navigationLinks.forEach((link) => {
    const isActive = link.hash === (isTracking ? "#track" : "#home");
    link.classList.toggle("is-active", isActive);

    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function renderEntryList(container, entries) {
  const list = document.createElement("ul");
  list.className = "entry-list";

  [...entries].reverse().forEach((entry) => {
    const item = document.createElement("li");
    item.className = "entry-row";

    const time = document.createElement("time");
    time.dateTime = entry.loggedAt;
    time.textContent = new Date(entry.loggedAt).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });

    const minutes = document.createElement("span");
    minutes.className = "entry-minutes";
    minutes.textContent = `${entry.minutes.toLocaleString(undefined, {
      maximumFractionDigits: 3,
    })} min`;

    const steps = document.createElement("span");
    steps.className = "entry-steps";
    steps.textContent = `${formatNumber(entry.steps)} steps`;

    item.append(time, minutes, steps);
    list.append(item);
  });

  container.append(list);
}

function renderStepsLog() {
  const fragment = document.createDocumentFragment();

  if (progress.entries.length > 0) {
    const today = document.createElement("div");
    today.className = "log-day";

    const heading = document.createElement("h3");
    heading.className = "log-day-heading";
    heading.textContent = "Today";
    today.append(heading);
    renderEntryList(today, progress.entries);
    fragment.append(today);
  }

  progress.completedDays.forEach((day) => {
    const details = document.createElement("details");
    details.className = "completed-log-day";

    const summary = document.createElement("summary");
    summary.className = "completed-log-summary";

    const date = document.createElement("span");
    date.textContent = `Completed ${new Date(day.completedAt).toLocaleDateString()}`;

    const total = document.createElement("strong");
    total.textContent = `${formatNumber(day.steps)} steps`;

    summary.append(date, total);
    details.append(summary);
    renderEntryList(details, day.entries);
    fragment.append(details);
  });

  if (progress.entries.length === 0 && progress.completedDays.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "log-empty";
    emptyState.textContent = "Your logged minutes will appear here.";
    fragment.append(emptyState);
  }

  stepsLogList.replaceChildren(fragment);
}

function animateCount(output, target) {
  const previousAnimation = animations.get(output);
  if (previousAnimation) {
    cancelAnimationFrame(previousAnimation);
  }

  const start = Number(output.dataset.value) || 0;
  const distance = target - start;

  if (distance === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    output.textContent = formatNumber(target);
    output.dataset.value = String(target);
    return;
  }

  const duration = Math.min(1600, Math.max(450, Math.log10(Math.abs(distance) + 1) * 520));
  const startedAt = performance.now();

  function tick(now) {
    const progressRatio = Math.min((now - startedAt) / duration, 1);
    const easedRatio = 1 - (1 - progressRatio) ** 3;
    const current = Math.round(start + distance * easedRatio);

    output.textContent = formatNumber(current);
    output.dataset.value = String(current);

    if (progressRatio < 1) {
      animations.set(output, requestAnimationFrame(tick));
    } else {
      output.textContent = formatNumber(target);
      output.dataset.value = String(target);
      animations.delete(output);
    }
  }

  animations.set(output, requestAnimationFrame(tick));
}

function setStatus(message, isError = false) {
  logStatus.textContent = message;
  logStatus.classList.toggle("is-error", isError);
}

function loadProgress() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      if (
        parsed === null ||
        !Array.isArray(parsed.entries) ||
        !parsed.entries.every(isValidEntry) ||
        !Array.isArray(parsed.completedDays) ||
        !parsed.completedDays.every(isValidDay)
      ) {
        throw new Error("Saved step tracker data is invalid.");
      }

      progress = { entries: parsed.entries, completedDays: parsed.completedDays };
      return;
    }

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy === null) {
      return;
    }

    const parsedLegacy = JSON.parse(legacy);
    if (
      parsedLegacy === null ||
      !Number.isFinite(parsedLegacy.totalMinutes) ||
      parsedLegacy.totalMinutes < 0 ||
      !Number.isFinite(parsedLegacy.lastMinutes) ||
      parsedLegacy.lastMinutes < 0 ||
      parsedLegacy.lastMinutes > parsedLegacy.totalMinutes
    ) {
      throw new Error("Saved step tracker data is invalid.");
    }

    if (parsedLegacy.totalMinutes > 0) {
      const totalSteps = stepsForMinutes(parsedLegacy.totalMinutes);
      progress.entries = [{
        minutes: parsedLegacy.totalMinutes,
        steps: totalSteps,
        loggedAt: new Date().toISOString(),
      }];
    }
    saveProgress(progress);
  } catch (error) {
    console.error("Could not load saved step tracker progress.", error);
    setStatus("Saved progress could not be loaded.", true);
  }
}

function saveProgress(nextProgress) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        entries: nextProgress.entries,
        completedDays: nextProgress.completedDays,
      }),
    );
    return true;
  } catch (error) {
    console.error("Could not save step tracker progress.", error);
    setStatus("Progress could not be saved. Check your browser storage.", true);
    return false;
  }
}

window.addEventListener("hashchange", updateScreen);
updateScreen();
loadProgress();
const initialTodaySteps = currentTotalSteps();
const initialLifetimeSteps = lifetimeTotalSteps();
sessionCount.textContent = formatNumber(initialTodaySteps);
sessionCount.dataset.value = String(initialTodaySteps);
totalCount.textContent = formatNumber(initialLifetimeSteps);
totalCount.dataset.value = String(initialLifetimeSteps);
renderStepsLog();

logForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const minutes = Number(minuteInput.value);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    setStatus("Enter a number of minutes greater than zero.", true);
    minuteInput.focus();
    return;
  }

  const lastSteps = stepsForMinutes(minutes);
  const todaySteps = currentTotalSteps() + lastSteps;
  const lifetimeSteps = lifetimeTotalSteps() + lastSteps;
  if (
    !Number.isFinite(currentTotalMinutes() + minutes) ||
    !Number.isSafeInteger(todaySteps) ||
    !Number.isSafeInteger(lifetimeSteps) ||
    !Number.isSafeInteger(lastSteps)
  ) {
    setStatus("That amount is too large to track.", true);
    minuteInput.focus();
    return;
  }

  const entry = {
    minutes,
    steps: lastSteps,
    loggedAt: new Date().toISOString(),
  };
  const nextProgress = {
    entries: [...progress.entries, entry],
    completedDays: progress.completedDays,
  };
  if (!saveProgress(nextProgress)) {
    return;
  }

  progress = nextProgress;
  animateCount(sessionCount, todaySteps);
  animateCount(totalCount, lifetimeTotalSteps());
  renderStepsLog();
  setStatus(`${formatNumber(lastSteps)} ${lastSteps === 1 ? "step" : "steps"} added.`);
  logForm.reset();
  minuteInput.focus();
});

completeDayButton.addEventListener("click", () => {
  if (progress.entries.length === 0) {
    setStatus("Log some minutes before completing the day.", true);
    return;
  }

  const completedDay = {
    completedAt: new Date().toISOString(),
    minutes: currentTotalMinutes(),
    steps: currentTotalSteps(),
    entries: progress.entries,
  };
  const nextProgress = {
    entries: [],
    completedDays: [completedDay, ...progress.completedDays],
  };

  if (!saveProgress(nextProgress)) {
    return;
  }

  progress = nextProgress;
  animateCount(sessionCount, 0);
  animateCount(totalCount, lifetimeTotalSteps());
  renderStepsLog();
  setStatus("Day completed. Today's steps have been reset.");
});
