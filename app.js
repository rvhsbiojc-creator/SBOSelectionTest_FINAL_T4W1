/*
  SBO Selection Test_T3W1 2026
  Frontend for GitHub Pages.

  Before publishing:
  1. Deploy Code.gs as a Google Apps Script web app.
  2. Paste the deployed /exec URL into GAS_WEB_APP_URL below.
  3. Upload question images into assets/questions/ and list them in the Questions tab.
*/

const APP_CONFIG = {
  TEST_TITLE: "SBO Selection Test_T3W1 2026",
  GAS_WEB_APP_URL: "https://script.google.com/macros/s/AKfycbxc-VTk7qYofVJ9LqGB9MTy8UsGq4lL8ujlH0nr1cFcvM5DQMZfvk3gAWfCTnyHhTIzuw/exec",
  QUESTION_IMAGE_BASE_PATH: "assets/questions/",
  LOCAL_DEMO_MODE: false,
  API_TIMEOUT_MS: 18000,
};

const DEFAULT_INSTRUCTIONS = `
<ol>
  <li>You will see each question as an image, one page at a time.</li>
  <li>Write all your answers clearly on the paper provided by your teacher.</li>
  <li>No answers need to be typed into this website.</li>
  <li>Use the <strong>Next</strong> and <strong>Previous</strong> buttons to move between questions.</li>
  <li>You may zoom into the question image. On a laptop, use the zoom buttons, mouse wheel, and drag the image to move around. On a tablet, use two fingers to pinch-zoom and pan.</li>
  <li>The timer shows only the time elapsed since you began the test.</li>
  <li>When you are done, go to the final question and press <strong>Submit Test</strong>.</li>
  <li>The test will automatically submit once 45 minutes has elapsed.</li>
</ol>`;

const state = {
  verifiedStudent: null,
  questions: [],
  session: null,
  currentIndex: 0,
  timerInterval: null,
  hasSubmitted: false,
  lastProgressSentAt: 0,
};

const viewer = {
  scale: 1,
  fitScale: 1,
  minScale: 0.15,
  maxScale: 6,
  tx: 0,
  ty: 0,
  pointers: new Map(),
  pinchStart: null,
  dragStart: null,
};

const el = {};

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  bindEvents();
  initialiseUi();
});

function bindElements() {
  const ids = [
    "connectionStatus",
    "mainTestTitle",
    "loginView",
    "landingView",
    "testView",
    "finishedView",
    "loginForm",
    "studentName",
    "studentClass",
    "studentEmail",
    "loginButton",
    "loginMessage",
    "landingStudentName",
    "landingTitle",
    "landingStudentClass",
    "landingStudentEmail",
    "landingInstructions",
    "landingQuestionCount",
    "landingDuration",
    "beginButton",
    "logoutButton",
    "landingMessage",
    "testTitle",
    "testEyebrow",
    "testStudentLine",
    "elapsedTimer",
    "questionCounter",
    "questionLabel",
    "progressBar",
    "imageViewport",
    "questionImage",
    "imageLoading",
    "zoomOutButton",
    "resetViewButton",
    "zoomInButton",
    "prevButton",
    "nextButton",
    "submitButton",
    "testMessage",
    "finishedTitle",
    "finishedMessage",
  ];

  ids.forEach((id) => {
    el[id] = document.getElementById(id);
  });
}

function bindEvents() {
  el.loginForm.addEventListener("submit", handleLogin);
  el.beginButton.addEventListener("click", handleBeginTest);
  el.logoutButton.addEventListener("click", resetToLogin);
  el.prevButton.addEventListener("click", () => goToQuestion(state.currentIndex - 1));
  el.nextButton.addEventListener("click", () => goToQuestion(state.currentIndex + 1));
  el.submitButton.addEventListener("click", () => submitTest("SUBMITTED"));

  el.zoomInButton.addEventListener("click", () => zoomAroundCenter(1.18));
  el.zoomOutButton.addEventListener("click", () => zoomAroundCenter(1 / 1.18));
  el.resetViewButton.addEventListener("click", fitImageToViewport);

  el.questionImage.addEventListener("load", () => {
    el.imageLoading.classList.add("hidden");
    fitImageToViewport();
  });

  el.questionImage.addEventListener("error", () => {
    el.imageLoading.textContent = "Question image could not be loaded. Please inform your teacher.";
    el.imageLoading.classList.remove("hidden");
  });

  el.imageViewport.addEventListener("wheel", handleWheelZoom, { passive: false });
  el.imageViewport.addEventListener("pointerdown", handlePointerDown);
  el.imageViewport.addEventListener("pointermove", handlePointerMove);
  el.imageViewport.addEventListener("pointerup", handlePointerEnd);
  el.imageViewport.addEventListener("pointercancel", handlePointerEnd);
  el.imageViewport.addEventListener("lostpointercapture", handlePointerEnd);

  window.addEventListener("resize", debounce(() => {
    if (isViewActive("testView")) fitImageToViewport();
  }, 200));

  document.addEventListener("keydown", (event) => {
    if (!isViewActive("testView")) return;
    if (event.key === "ArrowRight") goToQuestion(state.currentIndex + 1);
    if (event.key === "ArrowLeft") goToQuestion(state.currentIndex - 1);
  });
}

function initialiseUi() {
  document.title = APP_CONFIG.TEST_TITLE;
  if (el.mainTestTitle) el.mainTestTitle.textContent = APP_CONFIG.TEST_TITLE;
  if (el.testEyebrow) el.testEyebrow.textContent = APP_CONFIG.TEST_TITLE;
  el.testTitle.textContent = "Question Viewer";
  if (isApiConfigured()) {
    setConnectionStatus("Ready", "ok");
  } else if (APP_CONFIG.LOCAL_DEMO_MODE) {
    setConnectionStatus("Demo mode", "warning");
  } else {
    setConnectionStatus("Setup needed", "error");
    setMessage(el.loginMessage, "Teacher setup needed: paste the Apps Script web app URL into app.js first.", "error");
  }
}

async function handleLogin(event) {
  event.preventDefault();
  clearMessage(el.loginMessage);

  const name = el.studentName.value.trim();
  const klass = el.studentClass.value.trim().toUpperCase();
  const email = el.studentEmail.value.trim().toLowerCase();

  if (!name || !klass || !email) {
    setMessage(el.loginMessage, "Please complete all fields.", "error");
    return;
  }

  setLoading(el.loginButton, true, "Verifying…");

  try {
    const data = await callApi("login", {
      name,
      class: klass,
      email,
      userAgent: navigator.userAgent,
    });

    if (!data.ok) {
      setMessage(el.loginMessage, data.message || "Login was not successful.", "error");
      return;
    }

    state.verifiedStudent = data.student;
    state.questions = normaliseQuestions(data.questions || []);
    state.session = data.session || null;

    if (!state.questions.length) {
      setMessage(el.loginMessage, "No active question images have been set up yet. Please inform your teacher.", "error");
      return;
    }

    showLanding(data);
  } catch (error) {
    setMessage(el.loginMessage, readableError(error), "error");
  } finally {
    setLoading(el.loginButton, false, "Log in");
  }
}

function showLanding(data) {
  const student = data.student;
  const test = data.test || {};

  el.landingStudentName.textContent = student.nameRoster || student.nameEntered || "Verified student";
  el.landingStudentClass.textContent = `Class: ${student.classRoster || student.classEntered}`;
  el.landingStudentEmail.textContent = student.email;
  const title = test.title || APP_CONFIG.TEST_TITLE;
  const duration = Number(test.durationMinutes || 45);
  document.title = title;
  if (el.mainTestTitle) el.mainTestTitle.textContent = title;
  if (el.landingTitle) el.landingTitle.textContent = title;
  if (el.testEyebrow) el.testEyebrow.textContent = title;
  el.landingQuestionCount.textContent = state.questions.length;
  if (el.landingDuration) el.landingDuration.textContent = `${duration} min`;
  el.landingInstructions.innerHTML = test.instructionsHtml || DEFAULT_INSTRUCTIONS;

  if (data.session && data.session.status && data.session.status.includes("SUBMITTED")) {
    el.beginButton.disabled = true;
    el.beginButton.textContent = "Already Submitted";
    setMessage(el.landingMessage, "This test session has already been submitted. Please inform your teacher if this is unexpected.", "warning");
  } else if (data.session && data.session.startTimeIso) {
    el.beginButton.disabled = false;
    el.beginButton.textContent = "Resume Test";
    setMessage(el.landingMessage, "A started session was found. Your timer will continue from your original start time.", "warning");
  } else {
    el.beginButton.disabled = false;
    el.beginButton.textContent = "Begin Test";
    clearMessage(el.landingMessage);
  }

  switchView("landingView");
}

async function handleBeginTest() {
  if (!state.verifiedStudent) return;

  clearMessage(el.landingMessage);
  setLoading(el.beginButton, true, "Preparing…");

  try {
    const student = state.verifiedStudent;
    const data = await callApi("start", {
      name: student.nameEntered || student.nameRoster,
      class: student.classEntered || student.classRoster,
      email: student.email,
      userAgent: navigator.userAgent,
    });

    if (!data.ok) {
      setMessage(el.landingMessage, data.message || "The test could not be started.", "error");
      return;
    }

    state.session = data.session;
    state.questions = normaliseQuestions(data.questions || state.questions);
    state.currentIndex = clamp(Number(state.session.lastQuestion || 1) - 1, 0, state.questions.length - 1);
    state.hasSubmitted = false;

    startTestInterface();
  } catch (error) {
    setMessage(el.landingMessage, readableError(error), "error");
  } finally {
    setLoading(el.beginButton, false, state.session?.startTimeIso ? "Resume Test" : "Begin Test");
  }
}

function startTestInterface() {
  const student = state.verifiedStudent;
  el.testStudentLine.textContent = `${student.nameRoster || student.nameEntered} | ${student.classRoster || student.classEntered} | ${student.email}`;
  switchView("testView");
  goToQuestion(state.currentIndex, { silent: true });
  startTimer();
  sendProgress(true);
}

function goToQuestion(index, options = {}) {
  if (!state.questions.length || state.hasSubmitted) return;
  const nextIndex = clamp(index, 0, state.questions.length - 1);
  state.currentIndex = nextIndex;

  const question = state.questions[nextIndex];
  const questionNo = nextIndex + 1;
  el.questionCounter.textContent = `Question ${questionNo} of ${state.questions.length}`;
  el.questionLabel.textContent = question.label || `Question ${questionNo}`;
  el.progressBar.style.width = `${(questionNo / state.questions.length) * 100}%`;

  el.prevButton.disabled = nextIndex === 0;
  el.nextButton.classList.toggle("hidden", nextIndex === state.questions.length - 1);
  el.submitButton.classList.toggle("hidden", nextIndex !== state.questions.length - 1);

  el.imageLoading.textContent = "Loading question image…";
  el.imageLoading.classList.remove("hidden");
  el.questionImage.removeAttribute("src");
  requestAnimationFrame(() => {
    el.questionImage.src = question.url;
    el.questionImage.alt = question.label || `Question ${questionNo}`;
  });

  if (!options.silent) sendProgress(false);
}

function normaliseQuestions(questions) {
  return questions
    .filter((q) => q && (q.image || q.url || q.imageFile))
    .sort((a, b) => Number(a.no || a.questionNo || 0) - Number(b.no || b.questionNo || 0))
    .map((q, idx) => {
      const rawRef = String(q.url || q.image || q.imageFile || "").trim();
      return {
        no: Number(q.no || q.questionNo || idx + 1),
        label: q.label || q.questionLabel || `Question ${idx + 1}`,
        url: resolveImageUrl(rawRef),
        rawRef,
      };
    });
}

function resolveImageUrl(rawRef) {
  if (/^(https?:)?\/\//i.test(rawRef) || rawRef.startsWith("data:")) return rawRef;
  const base = APP_CONFIG.QUESTION_IMAGE_BASE_PATH.replace(/\/$/, "");
  return `${base}/${encodePath(rawRef)}`;
}

function encodePath(path) {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function startTimer() {
  stopTimer();
  updateTimer();
  state.timerInterval = window.setInterval(() => {
    updateTimer();
    if (!state.hasSubmitted) {
      const now = Date.now();
      if (now - state.lastProgressSentAt > 60000) sendProgress(true);
    }
  }, 1000);
}

function stopTimer() {
  if (state.timerInterval) {
    window.clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function updateTimer() {
  if (!state.session?.startTimeIso) return;
  const elapsedSeconds = getElapsedSeconds();
  el.elapsedTimer.textContent = formatElapsed(elapsedSeconds);

  const limitSeconds = Number(state.session.durationMinutes || 45) * 60;
  if (elapsedSeconds >= limitSeconds && !state.hasSubmitted) {
    submitTest("AUTO_SUBMITTED_45_MIN");
  }
}

function getElapsedSeconds() {
  const start = new Date(state.session.startTimeIso).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((Date.now() - start) / 1000));
}

function formatElapsed(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

async function sendProgress(force) {
  if (!state.session?.startTimeIso || state.hasSubmitted) return;
  const now = Date.now();
  if (!force && now - state.lastProgressSentAt < 4000) return;
  state.lastProgressSentAt = now;

  try {
    await callApi("progress", {
      email: state.verifiedStudent.email,
      lastQuestion: state.currentIndex + 1,
      elapsedSeconds: getElapsedSeconds(),
    });
  } catch (error) {
    // Keep the test usable even if a progress heartbeat fails.
    console.warn("Progress update failed", error);
  }
}

async function submitTest(status) {
  if (state.hasSubmitted) return;
  state.hasSubmitted = true;
  stopTimer();
  setLoading(el.submitButton, true, "Submitting…");
  disableTestControls(true);

  try {
    const data = await callApi("submit", {
      email: state.verifiedStudent.email,
      status,
      lastQuestion: state.currentIndex + 1,
      elapsedSeconds: getElapsedSeconds(),
    });

    const finalStatus = data.status || status;
    showFinished(finalStatus);
  } catch (error) {
    state.hasSubmitted = false;
    disableTestControls(false);
    setLoading(el.submitButton, false, "Submit Test");
    setMessage(el.testMessage, `Submission could not be recorded: ${readableError(error)}. Please inform your teacher immediately.`, "error");
    startTimer();
  }
}

function showFinished(status) {
  const elapsed = el.elapsedTimer.textContent || formatElapsed(getElapsedSeconds());
  if (status === "AUTO_SUBMITTED_45_MIN") {
    el.finishedMessage.textContent = `Time is up. Your test session has been submitted at ${elapsed}.`;
  } else {
    el.finishedMessage.textContent = `Your test session has been submitted at ${elapsed}.`;
  }
  switchView("finishedView");
}

function disableTestControls(disabled) {
  [el.prevButton, el.nextButton, el.submitButton, el.zoomInButton, el.zoomOutButton, el.resetViewButton].forEach((button) => {
    button.disabled = disabled;
  });
}

function fitImageToViewport() {
  const img = el.questionImage;
  const viewport = el.imageViewport;
  if (!img.naturalWidth || !img.naturalHeight) return;

  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const fit = Math.min(vw / img.naturalWidth, vh / img.naturalHeight) * 0.96;

  viewer.fitScale = fit || 1;
  viewer.scale = viewer.fitScale;
  viewer.minScale = Math.max(0.08, viewer.fitScale * 0.45);
  viewer.maxScale = Math.max(6, viewer.fitScale * 8);
  viewer.tx = (vw - img.naturalWidth * viewer.scale) / 2;
  viewer.ty = (vh - img.naturalHeight * viewer.scale) / 2;
  applyTransform();
}

function applyTransform() {
  el.questionImage.style.transform = `translate(${viewer.tx}px, ${viewer.ty}px) scale(${viewer.scale})`;
}

function zoomAroundCenter(factor) {
  const rect = el.imageViewport.getBoundingClientRect();
  zoomAt(rect.width / 2, rect.height / 2, viewer.scale * factor);
}

function zoomAt(viewportX, viewportY, newScale) {
  const oldScale = viewer.scale;
  const clampedScale = clamp(newScale, viewer.minScale, viewer.maxScale);
  if (Math.abs(clampedScale - oldScale) < 0.0001) return;

  const imageX = (viewportX - viewer.tx) / oldScale;
  const imageY = (viewportY - viewer.ty) / oldScale;

  viewer.scale = clampedScale;
  viewer.tx = viewportX - imageX * clampedScale;
  viewer.ty = viewportY - imageY * clampedScale;
  applyTransform();
}

function handleWheelZoom(event) {
  event.preventDefault();
  const rect = el.imageViewport.getBoundingClientRect();
  const viewportX = event.clientX - rect.left;
  const viewportY = event.clientY - rect.top;
  const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
  zoomAt(viewportX, viewportY, viewer.scale * factor);
}

function handlePointerDown(event) {
  if (state.hasSubmitted) return;
  el.imageViewport.setPointerCapture(event.pointerId);
  viewer.pointers.set(event.pointerId, getViewportPoint(event));
  el.imageViewport.classList.add("dragging");

  if (viewer.pointers.size === 1) {
    viewer.dragStart = {
      pointerId: event.pointerId,
      point: getViewportPoint(event),
      tx: viewer.tx,
      ty: viewer.ty,
    };
    viewer.pinchStart = null;
  }

  if (viewer.pointers.size === 2) {
    viewer.pinchStart = makePinchStart();
    viewer.dragStart = null;
  }
}

function handlePointerMove(event) {
  if (!viewer.pointers.has(event.pointerId) || state.hasSubmitted) return;
  viewer.pointers.set(event.pointerId, getViewportPoint(event));

  if (viewer.pointers.size >= 2 && viewer.pinchStart) {
    const points = [...viewer.pointers.values()].slice(0, 2);
    const currentCenter = midpoint(points[0], points[1]);
    const currentDistance = distance(points[0], points[1]);
    const nextScale = clamp(
      viewer.pinchStart.scale * (currentDistance / viewer.pinchStart.distance),
      viewer.minScale,
      viewer.maxScale
    );

    const imageX = (viewer.pinchStart.center.x - viewer.pinchStart.tx) / viewer.pinchStart.scale;
    const imageY = (viewer.pinchStart.center.y - viewer.pinchStart.ty) / viewer.pinchStart.scale;

    viewer.scale = nextScale;
    viewer.tx = currentCenter.x - imageX * nextScale;
    viewer.ty = currentCenter.y - imageY * nextScale;
    applyTransform();
    return;
  }

  if (viewer.pointers.size === 1 && viewer.dragStart && viewer.dragStart.pointerId === event.pointerId) {
    const point = getViewportPoint(event);
    viewer.tx = viewer.dragStart.tx + (point.x - viewer.dragStart.point.x);
    viewer.ty = viewer.dragStart.ty + (point.y - viewer.dragStart.point.y);
    applyTransform();
  }
}

function handlePointerEnd(event) {
  viewer.pointers.delete(event.pointerId);

  if (viewer.pointers.size === 0) {
    viewer.dragStart = null;
    viewer.pinchStart = null;
    el.imageViewport.classList.remove("dragging");
    return;
  }

  if (viewer.pointers.size === 1) {
    const [remainingId, point] = [...viewer.pointers.entries()][0];
    viewer.dragStart = {
      pointerId: remainingId,
      point,
      tx: viewer.tx,
      ty: viewer.ty,
    };
    viewer.pinchStart = null;
  }
}

function getViewportPoint(event) {
  const rect = el.imageViewport.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function makePinchStart() {
  const points = [...viewer.pointers.values()].slice(0, 2);
  return {
    center: midpoint(points[0], points[1]),
    distance: Math.max(1, distance(points[0], points[1])),
    scale: viewer.scale,
    tx: viewer.tx,
    ty: viewer.ty,
  };
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function switchView(viewId) {
  [el.loginView, el.landingView, el.testView, el.finishedView].forEach((view) => view.classList.remove("active-view"));
  el[viewId].classList.add("active-view");
}

function isViewActive(viewId) {
  return el[viewId].classList.contains("active-view");
}

function resetToLogin() {
  state.verifiedStudent = null;
  state.questions = [];
  state.session = null;
  state.currentIndex = 0;
  state.hasSubmitted = false;
  stopTimer();
  el.loginForm.reset();
  clearMessage(el.loginMessage);
  clearMessage(el.landingMessage);
  clearMessage(el.testMessage);
  switchView("loginView");
}

function setMessage(target, message, type = "ok") {
  target.textContent = message;
  target.className = `message ${type}`;
}

function clearMessage(target) {
  target.textContent = "";
  target.className = "message";
}

function setConnectionStatus(text, type) {
  el.connectionStatus.textContent = text;
  el.connectionStatus.className = `connection-pill ${type || ""}`;
}

function setLoading(button, loading, text) {
  button.disabled = loading;
  button.dataset.originalText = button.dataset.originalText || button.textContent;
  button.textContent = loading ? text : (text || button.dataset.originalText);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => fn(...args), delay);
  };
}

function isApiConfigured() {
  return APP_CONFIG.GAS_WEB_APP_URL && !APP_CONFIG.GAS_WEB_APP_URL.includes("PASTE_YOUR_DEPLOYED");
}

function readableError(error) {
  if (!error) return "Unknown error.";
  return error.message || String(error);
}

function callApi(action, payload = {}) {
  if (APP_CONFIG.LOCAL_DEMO_MODE) {
    return demoApi(action, payload);
  }
  if (!isApiConfigured()) {
    return Promise.reject(new Error("Teacher setup needed: paste the Apps Script web app URL into app.js first."));
  }
  return jsonp(`${APP_CONFIG.GAS_WEB_APP_URL}`, { action, ...payload });
}

function jsonp(url, params) {
  return new Promise((resolve, reject) => {
    const callbackName = `sboCallback_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("The server took too long to respond. Please check the connection and try again."));
    }, APP_CONFIG.API_TIMEOUT_MS);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    const search = new URLSearchParams({ ...params, callback: callbackName, clientTime: new Date().toISOString() });
    script.src = `${url}?${search.toString()}`;
    script.onerror = () => {
      cleanup();
      reject(new Error("Could not reach the server. Please check the Apps Script deployment URL."));
    };
    document.body.appendChild(script);
  });
}

function demoApi(action, payload) {
  console.warn("Using local demo mode/API fallback.", action, payload);
  const nowIso = new Date().toISOString();
  const questions = [
    { no: 1, image: "q01.png", label: "Question 1" },
    { no: 2, image: "q02.png", label: "Question 2" },
  ];

  if (action === "login") {
    return Promise.resolve({
      ok: true,
      student: {
        email: payload.email,
        nameEntered: payload.name,
        nameRoster: payload.name,
        classEntered: payload.class,
        classRoster: payload.class,
      },
      session: null,
      test: { title: APP_CONFIG.TEST_TITLE, durationMinutes: 45, instructionsHtml: DEFAULT_INSTRUCTIONS },
      questions,
    });
  }

  if (action === "start") {
    return Promise.resolve({
      ok: true,
      session: { startTimeIso: nowIso, durationMinutes: 45, status: "STARTED", lastQuestion: 1 },
      questions,
    });
  }

  if (action === "progress") return Promise.resolve({ ok: true });
  if (action === "submit") return Promise.resolve({ ok: true, status: payload.status || "SUBMITTED" });
  return Promise.resolve({ ok: false, message: "Unknown demo action." });
}
