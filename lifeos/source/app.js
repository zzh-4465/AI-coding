const STORAGE_KEY = "lifeos.prototype.v2";

const pad = (value) => String(value).padStart(2, "0");
const byId = (id) => document.getElementById(id);

const fmtSeconds = (seconds) => {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

const fmtHours = (seconds) => {
  if (!seconds) return "0m";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
};

const defaultState = {
  screen: "brief",
  weekView: "quadrant",
  archiveView: "reviews",
  weeklyScheduleImage: null,
  weeklyScheduleZoom: 100,
  feishuLink: "https://ccnjlqfzf4st.feishu.cn/wiki/GpmQwdT3wix2v0k9dxIcreDfnuf",
  settings: {
    reviewTime: "23:30",
    weekStartDate: "",
    windowMode: "desktop",
    syncMode: "local",
    mantra: "专注当下，温柔向前。",
    visibleWidgets: {
      launcher: true,
      today: true,
      weekly: true,
      project: true,
      experience: true,
      growth: true,
      customCards: true,
      time: true,
      capture: true,
      reading: true,
      temp: true
    }
  },
  launchers: [
    {
      group: "AI",
      tools: [
        { name: "GPT", target: "ChatGPT" },
        { name: "Claude", target: "https://claude.ai" },
        { name: "Gemini", target: "https://gemini.google.com" }
      ]
    },
    {
      group: "Development",
      tools: [
        { name: "VSCode", target: "vscode" },
        { name: "Cursor", target: "cursor" },
        { name: "GitHub", target: "https://github.com" }
      ]
    },
    {
      group: "Study",
      tools: [
        { name: "Chrome", target: "chrome" },
        { name: "PDF", target: "reader" },
        { name: "Bilibili", target: "https://www.bilibili.com" }
      ]
    }
  ],
  tasks: [
    {
      id: "task-1",
      title: "数据结构 Chapter 2",
      estimateHours: 2,
      progress: 45,
      actualSeconds: 1800,
      done: false
    },
    {
      id: "task-2",
      title: "LLM Session 3",
      estimateHours: 3,
      progress: 100,
      actualSeconds: 7200,
      done: true
    }
  ],
  weekly: [
    { id: "week-1", title: "完成 Chapter 3", done: false, estimateHours: 2, dueDate: "2026-08-22", dueTime: "20:00", quadrant: "重要不紧急" },
    { id: "week-2", title: "英语听力训练", done: false, estimateHours: 1, dueDate: "2026-08-23", dueTime: "19:30", quadrant: "重要且紧急" },
    { id: "week-3", title: "周四 13 点打球", done: true, estimateHours: 1.5, dueDate: "2026-08-21", dueTime: "13:00", quadrant: "不重要不紧急" }
  ],
  experience: [
    { id: "exp-1", text: "不要在床上看书", createdAt: Date.now() - 86400000 * 3, archived: false },
    { id: "exp-2", text: "上午适合做最难的学习任务", createdAt: Date.now() - 86400000 * 2, archived: false },
    { id: "exp-3", text: "AI 课前先扫一遍资料", createdAt: Date.now() - 86400000, archived: false }
  ],
  projects: [
    {
      id: "project-1",
      title: "AI 学习项目",
      percent: 62,
      note: "先完成 LLM Session，再补数据结构习题。",
      tasks: [
        { id: "project-task-1", title: "整理 Session 3 笔记", done: false, estimateHours: 1 },
        { id: "project-task-2", title: "补一张知识结构图", done: false, estimateHours: 1.5 },
        { id: "project-task-3", title: "复习 prompt 示例", done: true, estimateHours: 0.5 }
      ]
    }
  ],
  growthItems: [
    { id: "growth-1", title: "背单词", days: seedDays([1, 2, 4, 6, 8, 9, 12, 15, 19, 20]) },
    { id: "growth-2", title: "运动", days: seedDays([3, 7, 11, 17]) }
  ],
  notes: [
    { id: "note-1", text: "做一个 AI 桌面助手", createdAt: Date.now() - 3600000 }
  ],
  readings: [
    { id: "read-1", title: "GPT-5 论文", url: "https://openai.com", tag: "AI", status: "未读" },
    { id: "read-2", title: "CUDA 教程", url: "https://developer.nvidia.com/cuda-zone", tag: "课程", status: "阅读中" }
  ],
  tempFiles: [],
  imageCards: [],
  reviews: [],
  archivedTasks: [],
  archivedProjects: [],
  timer: {
    mode: "timer",
    timerSeconds: 0,
    pomodoroSeconds: 25 * 60,
    pomodoroMinutes: 25,
    running: false,
    focusTaskId: null,
    lastTick: null
  },
  mood: "calm"
};

let state = normalizeState(loadState());
state.timer.running = false;
state.timer.lastTick = null;
let toastTimer = null;
let quickHandler = null;
let tempFileUrls = new Map();
let pendingImageCardId = null;
let selectedImageCardId = null;
let desktopSaveTimer = null;

function isDesktopApp() {
  return Boolean(window.lifeosDesktop && window.lifeosDesktop.enabled);
}

async function desktopCall(label, action, successMessage) {
  if (!isDesktopApp()) {
    showToast("这个能力需要在 Tauri 桌面版里使用");
    return null;
  }
  try {
    const result = await action();
    if (successMessage) showToast(successMessage);
    return result;
  } catch (error) {
    console.error(label, error);
    showToast(typeof error === "string" ? error : `${label}失败`);
    return null;
  }
}

function seedDays(days) {
  return Array.from({ length: 31 }, (_, index) => days.includes(index + 1) ? 2 : 0);
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? mergeState(defaultState, saved) : structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function mergeState(base, saved) {
  const merged = structuredClone(base);
  Object.assign(merged, saved);
  merged.settings = { ...base.settings, ...(saved.settings || {}) };
  merged.settings.visibleWidgets = {
    ...base.settings.visibleWidgets,
    ...((saved.settings && saved.settings.visibleWidgets) || {})
  };
  merged.projects = saved.projects || base.projects;
  merged.project = saved.project;
  merged.timer = { ...base.timer, ...(saved.timer || {}) };
  return merged;
}

function normalizeState(nextState) {
  if (nextState.weekView === "pool") nextState.weekView = "quadrant";
  if (!["quadrant", "schedule", "checkin", "calendar"].includes(nextState.weekView)) nextState.weekView = "quadrant";
  nextState.weekly = nextState.weekly.map((item) => ({
    estimateHours: 1,
    dueDate: "",
    dueTime: "",
    quadrant: "重要不紧急",
    ...item
  }));
  nextState.experience = nextState.experience.map((item, index) => {
    if (typeof item === "string") {
      return {
        id: createId(`exp-${index}`),
        text: item,
        createdAt: Date.now(),
        archived: false
      };
    }
    return {
      id: item.id || createId(`exp-${index}`),
      text: item.text || "",
      createdAt: item.createdAt || Date.now(),
      archived: Boolean(item.archived),
      archivedAt: item.archivedAt || null
    };
  });
  if (!Array.isArray(nextState.projects) || !nextState.projects.length) {
    const sourceProject = nextState.project || defaultState.projects[0];
    nextState.projects = [{
      id: sourceProject.id || "project-1",
      title: sourceProject.title || "新项目",
      percent: Number(sourceProject.percent || 0),
      note: sourceProject.note || "",
      tasks: sourceProject.tasks || []
    }];
  }
  nextState.projects = nextState.projects.map((project, projectIndex) => ({
    id: project.id || createId(`project-${projectIndex}`),
    title: project.title || "未命名项目",
    percent: Number(project.percent || 0),
    note: project.note || "",
    tasks: (project.tasks || []).map((task, taskIndex) => ({
      id: task.id || createId(`project-task-${projectIndex}-${taskIndex}`),
      title: task.title || "",
      done: Boolean(task.done),
      estimateHours: Number(task.estimateHours || 1)
    }))
  }));
  nextState.project = nextState.projects[0];
  nextState.archivedProjects = nextState.archivedProjects || [];
  nextState.archivedTasks = nextState.archivedTasks || [];
  nextState.settings.windowMode = nextState.settings.windowMode || "desktop";
  nextState.growthItems = (nextState.growthItems || []).map((item) => ({
    ...item,
    days: Array.from({ length: 31 }, (_, index) => Number(item.days && item.days[index]) || 0)
  }));
  nextState.timer.pomodoroMinutes = Number(nextState.timer.pomodoroMinutes || 25);
  nextState.timer.pomodoroSeconds = Number(nextState.timer.pomodoroSeconds || nextState.timer.pomodoroMinutes * 60);
  nextState.settings.mantra = nextState.settings.mantra || defaultState.settings.mantra;
  nextState.settings.weekStartDate = nextState.settings.weekStartDate || "";
  nextState.weeklyScheduleImage = nextState.weeklyScheduleImage || null;
  nextState.feishuLink = nextState.feishuLink || defaultState.feishuLink;
  nextState.imageCards = (nextState.imageCards || []).map((card, index) => ({
    id: card.id || createId(`image-card-${index}`),
    title: card.title || "贴图卡片",
    image: card.image || null,
    zoom: Number(card.zoom || 100),
    link: card.link || "",
    createdAt: card.createdAt || Date.now()
  }));
  nextState.weeklyScheduleZoom = Number(nextState.weeklyScheduleZoom || 100);
  nextState.archiveView = nextState.archiveView || "reviews";
  return nextState;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (isDesktopApp()) {
    clearTimeout(desktopSaveTimer);
    desktopSaveTimer = setTimeout(() => {
      window.lifeosDesktop.saveState(state).catch((error) => console.error("save desktop state", error));
    }, 250);
  }
}

function showToast(message) {
  const toast = byId("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function todayLabel() {
  const now = new Date();
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())} ${weekdays[now.getDay()]}`;
}

function updateClockText() {
  const now = new Date();
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  byId("briefTime").textContent = time;
  byId("briefDate").textContent = todayLabel();
  byId("workspaceDate").textContent = todayLabel();
  byId("reviewClockBadge").textContent = `${state.settings.reviewTime} 复盘`;
  byId("briefGreeting").textContent = greeting(now.getHours());
}

function greeting(hour) {
  if (hour < 5) return "Quiet Night";
  if (hour < 11) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
}

function setScreen(screen) {
  state.screen = screen;
  byId("briefScreen").classList.toggle("active", screen === "brief");
  byId("workspaceScreen").classList.toggle("active", screen === "workspace");
  saveState();
}

function calcEfficiency(task) {
  if (!task.actualSeconds) return 100;
  const earnedSeconds = task.estimateHours * 3600;
  return Math.max(1, Math.min(199, Math.round((earnedSeconds / task.actualSeconds) * 100)));
}

function getTaskMetric(task) {
  if (task.done || task.progress >= 100) {
    return { label: "效率", value: `${calcEfficiency(task)}%` };
  }
  return { label: "进度", value: `${task.progress}%` };
}

function formatWeeklyDue(item) {
  if (!item.dueDate && !item.dueTime && item.due) return item.due;
  const date = item.dueDate ? item.dueDate.replaceAll("-", ".") : "未定日期";
  const time = item.dueTime ? ` ${item.dueTime}` : "";
  return `${date}${time}`;
}

function quadrantClass(value) {
  const map = {
    "重要且紧急": "q-urgent-important",
    "重要不紧急": "q-important",
    "不重要但紧急": "q-urgent",
    "不重要不紧急": "q-low"
  };
  return map[value] || "q-important";
}

function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatYmd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function currentMonthLabel() {
  const now = new Date();
  return `${now.getFullYear()}年${now.getMonth() + 1}月`;
}

function primaryProject() {
  return state.projects[0] || { title: "还没有项目", percent: 0, note: "", tasks: [] };
}

function getWeekDays() {
  const now = new Date();
  const monday = new Date(now);
  const weekday = now.getDay() || 7;
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - weekday + 1);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return day;
  });
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function growthIndexForDate(date) {
  return Math.min(date.getDate() - 1, 30);
}

function weekRangeLabel() {
  const days = getWeekDays();
  const first = days[0];
  const last = days[6];
  return `${first.getMonth() + 1}.${first.getDate()} - ${last.getMonth() + 1}.${last.getDate()}`;
}

function defaultWeekStartDate() {
  return formatYmd(getWeekDays()[0]);
}

function currentPlanWeekNumber() {
  const start = new Date(state.settings.weekStartDate || defaultWeekStartDate());
  const today = new Date();
  start.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today - start) / 86400000);
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}

function getMonthCells() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = new Date(first);
  const firstWeekday = first.getDay() || 7;
  start.setDate(first.getDate() - firstWeekday + 1);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function holidayName(date) {
  const key = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const fixed = {
    "01-01": "元旦",
    "05-01": "劳动节",
    "10-01": "国庆"
  };
  return fixed[key] || "";
}

function looksLikeLocalPath(target) {
  return /^file:\/\//i.test(target) || /^[a-zA-Z]:[\\/]/.test(target) || /^\\\\/.test(target);
}

function toFileUrl(target) {
  if (/^file:\/\//i.test(target)) return target;
  if (/^\\\\/.test(target)) return `file:${target.replace(/\\/g, "/")}`;
  return encodeURI(`file:///${target.replace(/\\/g, "/")}`);
}

function renderAll() {
  updateClockText();
  renderBrief();
  renderLauncher();
  renderTasks();
  renderWeekly();
  renderProject();
  renderExperience();
  renderGrowth();
  renderCustomCards();
  renderNotes();
  renderReadings();
  renderTempFiles();
  renderTime();
  applyWidgetVisibility();
}

function renderBrief() {
  const tasks = state.tasks.slice(0, 4);
  byId("briefTasks").innerHTML = tasks.map((task) => {
    const metric = getTaskMetric(task);
    return `
      <div class="brief-task-row">
        <div class="brief-hours">${task.estimateHours}h</div>
        <div>
          <h3>${escapeHtml(task.title)}</h3>
          <div class="mini-track"><span style="width:${task.progress}%"></span></div>
        </div>
        <strong>${metric.value}</strong>
      </div>
    `;
  }).join("") || `<p class="muted-line">今天还没有任务。</p>`;

  byId("briefWeekly").innerHTML = state.weekly.slice(0, 3).map((item) => `
    <li>${escapeHtml(item.title)}</li>
  `).join("");
  const project = primaryProject();
  byId("briefProjectTitle").textContent = project.title;
  byId("briefProjectNote").textContent = state.settings.mantra;
  byId("briefProjectPercent").textContent = `${project.percent}%`;
  byId("briefProjectBar").style.width = `${project.percent}%`;
}

function renderLauncher() {
  byId("launcherList").innerHTML = state.launchers.map((group, groupIndex) => `
    <section class="launcher-group">
      <h3>${escapeHtml(group.group)}</h3>
      <div class="tool-grid">
        ${group.tools.map((tool, toolIndex) => `
          <button class="tool-btn" type="button" data-group="${groupIndex}" data-tool="${toolIndex}" title="${escapeAttribute(tool.target)}">
            <span class="tool-icon">${escapeHtml(tool.name.slice(0, 1).toUpperCase())}</span>
            <span>${escapeHtml(tool.name)}</span>
          </button>
        `).join("")}
      </div>
    </section>
  `).join("");

  document.querySelectorAll(".tool-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const tool = state.launchers[button.dataset.group].tools[button.dataset.tool];
      const desktopTarget = tool.name.toLowerCase() === "gpt" && /^https?:\/\/chatgpt\.com/.test(tool.target)
        ? "ChatGPT"
        : tool.target;
      if (isDesktopApp()) {
        desktopCall("打开工具", () => window.lifeosDesktop.openTarget(desktopTarget));
      } else if (/^https?:\/\//.test(tool.target)) {
        window.open(tool.target, "_blank", "noopener,noreferrer");
      } else if (looksLikeLocalPath(tool.target)) {
        window.open(toFileUrl(tool.target), "_blank", "noopener,noreferrer");
      } else {
        showToast(`${tool.name} 已记录为桌面启动项；桌面版会直接启动应用`);
      }
    });
  });
}

function renderTasks() {
  const totalEstimate = state.tasks.reduce((sum, task) => sum + Number(task.estimateHours || 0), 0);
  byId("todayTotal").textContent = `${totalEstimate}h`;
  byId("taskList").innerHTML = state.tasks.map((task) => {
    const active = state.timer.focusTaskId === task.id && state.timer.running;
    const metric = getTaskMetric(task);
    return `
      <article class="task-row" draggable="true" data-task-id="${escapeAttribute(task.id)}">
        <div class="hours-mark">${task.estimateHours}h</div>
        <div class="task-main">
          <h3>${escapeHtml(task.title)}</h3>
          <div class="task-meta">
            <span>实际 ${fmtHours(task.actualSeconds)}</span>
            <span>${task.done ? "已完成" : "进行中"}</span>
          </div>
          <label class="task-slider">
            <input type="range" min="0" max="100" step="5" value="${task.progress}" data-task-progress="${escapeAttribute(task.id)}" />
            <span>${task.progress}%</span>
          </label>
        </div>
        <div class="status-metric">
          <strong>${metric.value}</strong>
          <span>${metric.label}</span>
        </div>
        <div class="task-actions">
          <button class="outline-action small" type="button" data-task-focus="${escapeAttribute(task.id)}">${active ? "暂停" : "专注"}</button>
          <button class="outline-action small" type="button" data-task-done="${escapeAttribute(task.id)}">${task.done ? "重开" : "完成"}</button>
          <button class="outline-action small" type="button" data-task-to-week="${escapeAttribute(task.id)}">放回周池</button>
          <button class="outline-action small" type="button" data-task-archive="${escapeAttribute(task.id)}">归档</button>
          <button class="outline-action small danger-text" type="button" data-task-delete="${escapeAttribute(task.id)}">删除</button>
        </div>
      </article>
    `;
  }).join("") || `<p class="muted-line">添加一个今天真正要推进的任务，或从周任务池拖过来。</p>`;

  document.querySelectorAll("[data-task-progress]").forEach((input) => {
    input.addEventListener("input", () => {
      const task = findTask(input.dataset.taskProgress);
      task.progress = Number(input.value);
      task.done = task.progress >= 100;
      saveState();
      renderAll();
    });
  });

  document.querySelectorAll("[data-task-focus]").forEach((button) => {
    button.addEventListener("click", () => toggleFocusTask(button.dataset.taskFocus));
  });

  document.querySelectorAll("[data-task-done]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = findTask(button.dataset.taskDone);
      task.done = !task.done;
      task.progress = task.done ? 100 : Math.min(task.progress, 95);
      saveState();
      renderAll();
    });
  });

  document.querySelectorAll("[data-task-to-week]").forEach((button) => {
    button.addEventListener("click", () => moveTaskToWeek(button.dataset.taskToWeek));
  });

  document.querySelectorAll("[data-task-archive]").forEach((button) => {
    button.addEventListener("click", () => archiveTask(button.dataset.taskArchive));
  });

  document.querySelectorAll("[data-task-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteTask(button.dataset.taskDelete));
  });

  setupTaskDrag();
}

function findTask(id) {
  return state.tasks.find((task) => task.id === id);
}

function toggleFocusTask(taskId) {
  if (state.timer.focusTaskId === taskId && state.timer.running) {
    state.timer.running = false;
    state.timer.lastTick = null;
    showToast("已暂停");
  } else {
    state.timer.mode = "timer";
    state.timer.focusTaskId = taskId;
    state.timer.running = true;
    state.timer.lastTick = Date.now();
    showToast("开始专注");
  }
  saveState();
  renderAll();
}

function setupTaskDrag() {
  document.querySelectorAll(".task-row").forEach((row) => {
    row.addEventListener("dragstart", (event) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/lifeos-task", row.dataset.taskId);
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => row.classList.remove("dragging"));
  });

  const taskList = byId("taskList");
  if (taskList.dataset.dndBound === "true") return;
  taskList.dataset.dndBound = "true";
  taskList.addEventListener("dragover", (event) => {
    event.preventDefault();
    taskList.classList.add("drag-over");
  });
  taskList.addEventListener("dragleave", () => taskList.classList.remove("drag-over"));
  taskList.addEventListener("drop", (event) => {
    event.preventDefault();
    taskList.classList.remove("drag-over");
    const taskId = event.dataTransfer.getData("text/lifeos-task");
    const weeklyId = event.dataTransfer.getData("text/lifeos-weekly");
    const projectTaskId = event.dataTransfer.getData("text/lifeos-project-task");
    if (taskId) {
      reorderTask(taskId, event.target.closest(".task-row")?.dataset.taskId);
    } else if (weeklyId) {
      addWeeklyToToday(weeklyId);
    } else if (projectTaskId) {
      addProjectTaskToToday(projectTaskId);
    }
  });
}

function reorderTask(sourceId, targetId) {
  if (!targetId || sourceId === targetId) return;
  const sourceIndex = state.tasks.findIndex((task) => task.id === sourceId);
  const targetIndex = state.tasks.findIndex((task) => task.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [task] = state.tasks.splice(sourceIndex, 1);
  state.tasks.splice(targetIndex, 0, task);
  saveState();
  renderAll();
}

function moveTaskToWeek(taskId) {
  const index = state.tasks.findIndex((task) => task.id === taskId);
  if (index < 0) return;
  const [task] = state.tasks.splice(index, 1);
  state.weekly.unshift({
    id: createId("week"),
    title: task.title,
    estimateHours: task.estimateHours,
    dueDate: "",
    dueTime: "",
    quadrant: "重要不紧急",
    done: false
  });
  saveState();
  renderAll();
  showToast("已放回周任务池");
}

function archiveTask(taskId) {
  const index = state.tasks.findIndex((task) => task.id === taskId);
  if (index < 0) return;
  const [task] = state.tasks.splice(index, 1);
  state.archivedTasks.unshift({
    ...task,
    archivedAt: Date.now(),
    source: "today"
  });
  saveState();
  renderAll();
  showToast("任务已归档");
}

function deleteTask(taskId) {
  const task = findTask(taskId);
  if (!task) return;
  if (!confirm(`彻底删除「${task.title}」？`)) return;
  state.tasks = state.tasks.filter((item) => item.id !== taskId);
  saveState();
  renderAll();
  showToast("任务已删除");
}

function renderWeekly() {
  if (state.weekView === "pool") state.weekView = "quadrant";
  byId("weekPlanTitle").textContent = `本周计划台 · 第 ${currentPlanWeekNumber()} 周 · ${weekRangeLabel()}`;
  document.querySelectorAll("[data-week-view]").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.weekView === state.weekView);
  });

  const items = [...state.weekly].sort((a, b) => {
    if (state.weekView !== "quadrant") return `${a.dueDate || ""}${a.dueTime || ""}`.localeCompare(`${b.dueDate || ""}${b.dueTime || ""}`);
    return Number(a.done) - Number(b.done);
  });

  if (state.weekView === "quadrant") {
    const quadrants = ["重要且紧急", "重要不紧急", "不重要但紧急", "不重要不紧急"];
    byId("weeklyList").innerHTML = `
      <div class="quadrant-board">
        ${quadrants.map((quadrant) => {
          const group = items.filter((item) => item.quadrant === quadrant);
          return `
            <section class="quadrant-column ${quadrantClass(quadrant)}">
              <div class="quadrant-head">
                <strong>${escapeHtml(quadrant)}</strong>
                <span>${group.length}</span>
              </div>
              <div class="quadrant-list">
                ${group.map((item) => `
                  <article class="quadrant-task weekly-row" draggable="true" data-weekly-id="${escapeAttribute(item.id)}">
                    <input type="checkbox" ${item.done ? "checked" : ""} data-weekly="${escapeAttribute(item.id)}" />
                    <div class="weekly-main">
                      <div class="weekly-title">${escapeHtml(item.title)}</div>
                      <div class="weekly-meta">${escapeHtml(formatWeeklyDue(item))} · 预计 ${item.estimateHours}h</div>
                    </div>
                    <button class="tiny-action" type="button" data-weekly-to-today="${escapeAttribute(item.id)}">${item.addedToday ? "已加" : "今日"}</button>
                  </article>
                `).join("") || `<p class="quadrant-empty">暂时没有任务</p>`}
              </div>
            </section>
          `;
        }).join("")}
      </div>
    `;
  }

  if (state.weekView === "schedule") {
    byId("weeklyList").innerHTML = `
      <div class="schedule-view schedule-full">
        <div class="schedule-toolbar">
          <button class="outline-action small" type="button" data-upload-schedule>选择图片</button>
          <input class="schedule-link-input" value="${escapeAttribute(state.feishuLink)}" placeholder="飞书复盘 / 课程表链接" />
          <button class="outline-action small" type="button" data-save-feishu>保存链接</button>
          <a class="outline-link" href="${escapeAttribute(state.feishuLink)}" target="_blank" rel="noopener noreferrer">打开飞书</a>
        </div>
        <div class="schedule-stage" data-schedule-drop tabindex="0">
          ${state.weeklyScheduleImage
            ? `
              <div class="image-tools">
                <button class="tiny-action" type="button" data-zoom-schedule="-10">-</button>
                <span>${state.weeklyScheduleZoom}%</span>
                <button class="tiny-action" type="button" data-zoom-schedule="10">+</button>
                <button class="tiny-action" type="button" data-preview-image="schedule">查看大图</button>
              </div>
              <div class="image-viewport">
                <button class="image-preview-btn" type="button" data-preview-image="schedule">
                  <img class="zoomable-image" src="${escapeAttribute(state.weeklyScheduleImage)}" alt="本周课程表" style="width:${state.weeklyScheduleZoom}%;" />
                </button>
              </div>
            `
            : `<span class="schedule-blank">拖入或直接 Ctrl+V 粘贴课程表图片</span>`}
        </div>
      </div>
    `;
  }

  if (state.weekView === "checkin") {
    byId("weeklyList").innerHTML = `
      <div class="checkin-view">
        <div class="checkin-actions">
          <button id="checkinGrowthBtn" class="outline-action small" type="button">今日打卡</button>
          <button id="addGrowthItemBtn" class="outline-action small" type="button">添加成长项</button>
        </div>
        ${buildGrowthMarkup()}
      </div>
    `;
  }

  if (state.weekView === "calendar") {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const weekdayLabels = ["一", "二", "三", "四", "五", "六", "日"];
    byId("weeklyList").innerHTML = `
      <div class="month-calendar">
        <div class="month-head">
          <strong>${now.getFullYear()}年${now.getMonth() + 1}月</strong>
          <span>点击日期添加任务，拖动卡片调整截止日</span>
        </div>
        <div class="month-weekdays">${weekdayLabels.map((label) => `<span>${label}</span>`).join("")}</div>
        <div class="month-grid">
          ${getMonthCells().map((day) => {
            const ymd = formatYmd(day);
            const dayTasks = state.weekly.filter((item) => item.dueDate === ymd);
            const inMonth = day.getMonth() === now.getMonth();
            const isPast = day < todayStart;
            const weekend = day.getDay() === 0 || day.getDay() === 6;
            const holiday = holidayName(day);
            return `
              <section class="month-cell ${inMonth ? "" : "outside"} ${isPast ? "past" : ""} ${weekend ? "weekend" : ""} ${holiday ? "holiday" : ""}" data-calendar-date="${escapeAttribute(ymd)}">
                <button class="month-date" type="button" data-add-calendar-task="${escapeAttribute(ymd)}">
                  <span>${day.getDate()}</span>
                  ${holiday ? `<small>${escapeHtml(holiday)}</small>` : ""}
                </button>
                <div class="month-task-list">
                  ${dayTasks.slice(0, 3).map((item) => `
                    <article class="month-task weekly-row" draggable="true" data-weekly-id="${escapeAttribute(item.id)}">
                      <strong>${escapeHtml(item.title)}</strong>
                      <span>${escapeHtml(item.dueTime || "未定时间")}</span>
                    </article>
                  `).join("")}
                </div>
              </section>
            `;
          }).join("")}
        </div>
        <div class="undated-strip">
          <span>未定日期</span>
          ${state.weekly.filter((item) => !item.dueDate).map((item) => `
            <article class="undated-task weekly-row" draggable="true" data-weekly-id="${escapeAttribute(item.id)}">
              <strong>${escapeHtml(item.title)}</strong>
              <button class="tiny-action" type="button" data-weekly-to-today="${escapeAttribute(item.id)}">${item.addedToday ? "已加" : "今日"}</button>
            </article>
          `).join("") || `<small>暂无</small>`}
        </div>
      </div>
    `;
  }

  document.querySelectorAll("[data-save-feishu]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = button.parentElement.querySelector(".schedule-link-input");
      state.feishuLink = input.value.trim() || defaultState.feishuLink;
      saveState();
      renderAll();
      showToast("飞书链接已保存");
    });
  });

  document.querySelectorAll("[data-zoom-schedule]").forEach((button) => {
    button.addEventListener("click", () => {
      state.weeklyScheduleZoom = clampZoom(state.weeklyScheduleZoom + Number(button.dataset.zoomSchedule));
      saveState();
      renderAll();
    });
  });

  document.querySelectorAll("[data-preview-image='schedule']").forEach((button) => {
    button.addEventListener("click", () => openImagePreview("本周课程表", state.weeklyScheduleImage));
  });

  document.querySelectorAll("[data-schedule-drop]").forEach((target) => {
    target.addEventListener("dragover", (event) => {
      event.preventDefault();
      target.classList.add("drag-over");
    });
    target.addEventListener("dragleave", () => target.classList.remove("drag-over"));
    target.addEventListener("drop", (event) => {
      event.preventDefault();
      target.classList.remove("drag-over");
      const file = [...event.dataTransfer.files].find((item) => item.type.startsWith("image/"));
      if (file) saveScheduleImage(file);
    });
  });

  document.querySelectorAll("[data-add-calendar-task]").forEach((button) => {
    button.addEventListener("click", () => openWeeklyTaskDialog(button.dataset.addCalendarTask));
  });

  document.querySelectorAll("[data-calendar-date]").forEach((cell) => {
    cell.addEventListener("dragover", (event) => {
      event.preventDefault();
      cell.classList.add("drag-over");
    });
    cell.addEventListener("dragleave", () => cell.classList.remove("drag-over"));
    cell.addEventListener("drop", (event) => {
      event.preventDefault();
      cell.classList.remove("drag-over");
      const weeklyId = event.dataTransfer.getData("text/lifeos-weekly");
      const item = state.weekly.find((weekly) => weekly.id === weeklyId);
      if (!item) return;
      item.dueDate = cell.dataset.calendarDate;
      saveState();
      renderAll();
      showToast("已调整截止日期");
    });
  });

  document.querySelectorAll("#checkinGrowthBtn").forEach((button) => {
    button.addEventListener("click", openGrowthCheckin);
  });

  document.querySelectorAll("#addGrowthItemBtn").forEach((button) => {
    button.addEventListener("click", openGrowthItemDialog);
  });

  document.querySelectorAll("[data-weekly]").forEach((input) => {
    input.addEventListener("change", () => {
      const item = state.weekly.find((weekly) => weekly.id === input.dataset.weekly);
      item.done = input.checked;
      saveState();
      renderAll();
    });
  });

  document.querySelectorAll("[data-weekly-to-today]").forEach((button) => {
    button.addEventListener("click", () => addWeeklyToToday(button.dataset.weeklyToToday));
  });

  document.querySelectorAll("[data-upload-schedule]").forEach((button) => {
    button.addEventListener("click", () => byId("scheduleImageInput").click());
  });

  document.querySelectorAll(".weekly-row").forEach((row) => {
    row.addEventListener("dragstart", (event) => {
      event.dataTransfer.effectAllowed = "copyMove";
      event.dataTransfer.setData("text/lifeos-weekly", row.dataset.weeklyId);
    });
  });
}

function addWeeklyToToday(weeklyId) {
  const weekly = state.weekly.find((item) => item.id === weeklyId);
  if (!weekly) return;
  state.tasks.push({
    id: createId("task"),
    title: weekly.title,
    estimateHours: Number(weekly.estimateHours || 1),
    progress: 0,
    actualSeconds: 0,
    done: false
  });
  weekly.addedToday = true;
  saveState();
  renderAll();
  showToast("已加入今日任务");
}

function clampZoom(value) {
  return Math.max(40, Math.min(260, Math.round(value)));
}

function openImagePreview(title, src) {
  if (!src) return;
  byId("imagePreviewTitle").textContent = title || "查看图片";
  byId("imagePreviewImg").src = src;
  byId("imagePreviewDialog").showModal();
}

function saveScheduleImage(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.weeklyScheduleImage = reader.result;
    state.weeklyScheduleZoom = 100;
    state.weekView = "schedule";
    saveState();
    renderAll();
    showToast("课程表已贴上");
  };
  reader.readAsDataURL(file);
}

function openWeeklyTaskDialog(prefillDate = "") {
  openQuickDialog("添加周任务", `
    <label class="field-block"><span>任务</span><input name="title" /></label>
    <label class="field-block"><span>预计小时</span><input name="estimateHours" type="number" min="0.25" step="0.25" value="1" /></label>
    <label class="field-block"><span>截止日期</span><input name="dueDate" type="date" value="${escapeAttribute(prefillDate)}" /></label>
    <label class="field-block"><span>截止时间</span><input name="dueTime" type="time" /></label>
    <label class="field-block"><span>四象限</span><select name="quadrant"><option>重要且紧急</option><option>重要不紧急</option><option>不重要但紧急</option><option>不重要不紧急</option></select></label>
  `, (form) => {
    const title = form.title.value.trim();
    if (!title) return false;
    state.weekly.push({
      id: createId("week"),
      title,
      estimateHours: Number(form.estimateHours.value || 1),
      dueDate: form.dueDate.value,
      dueTime: form.dueTime.value,
      quadrant: form.quadrant.value,
      done: false
    });
    return true;
  });
}

function renderProject() {
  const host = byId("projectCards");
  host.innerHTML = state.projects.map((project) => `
    <article class="project-card" data-project-id="${escapeAttribute(project.id)}">
      <div class="project-card-head">
        <h2 class="project-title">${escapeHtml(project.title)}</h2>
        <button class="tiny-action" type="button" data-add-project-task="${escapeAttribute(project.id)}">加任务</button>
      </div>
      <div class="progress-track tall">
        <span style="width:${project.percent}%"></span>
      </div>
      <div class="range-row">
        <input type="range" min="0" max="100" step="1" value="${project.percent}" data-project-range="${escapeAttribute(project.id)}" />
        <strong>${project.percent}%</strong>
      </div>
      <ul class="project-task-list">
        ${project.tasks.map((item) => `
          <li class="project-task-row" draggable="true" data-project-task-id="${escapeAttribute(item.id)}">
            <input type="checkbox" ${item.done ? "checked" : ""} data-project-task-done="${escapeAttribute(item.id)}" data-project-id="${escapeAttribute(project.id)}" />
            <span>${escapeHtml(item.title)}</span>
            <button class="tiny-action" type="button" data-project-to-today="${escapeAttribute(item.id)}">今日</button>
          </li>
        `).join("") || `<li class="muted-line">还没有拆分任务。</li>`}
      </ul>
    </article>
  `).join("") || `<p class="muted-line">还没有项目卡片。</p>`;

  document.querySelectorAll("[data-project-range]").forEach((input) => {
    input.addEventListener("input", () => {
      const project = state.projects.find((item) => item.id === input.dataset.projectRange);
      if (!project) return;
      project.percent = Number(input.value);
      saveState();
      renderAll();
    });
  });

  document.querySelectorAll("[data-add-project-task]").forEach((button) => {
    button.addEventListener("click", () => openProjectTaskDialog(button.dataset.addProjectTask));
  });

  document.querySelectorAll("[data-project-task-done]").forEach((input) => {
    input.addEventListener("change", () => {
      const project = state.projects.find((item) => item.id === input.dataset.projectId);
      const task = project && project.tasks.find((item) => item.id === input.dataset.projectTaskDone);
      if (!task) return;
      task.done = input.checked;
      saveState();
      renderAll();
    });
  });

  document.querySelectorAll("[data-project-to-today]").forEach((button) => {
    button.addEventListener("click", () => addProjectTaskToToday(button.dataset.projectToToday));
  });

  document.querySelectorAll(".project-task-row").forEach((row) => {
    row.addEventListener("dragstart", (event) => {
      event.dataTransfer.effectAllowed = "copyMove";
      event.dataTransfer.setData("text/lifeos-project-task", row.dataset.projectTaskId);
    });
  });
}

function addProjectTaskToToday(projectTaskId) {
  const item = state.projects.flatMap((project) => project.tasks).find((task) => task.id === projectTaskId);
  if (!item) return;
  state.tasks.push({
    id: createId("task"),
    title: item.title,
    estimateHours: Number(item.estimateHours || 1),
    progress: 0,
    actualSeconds: 0,
    done: false
  });
  saveState();
  renderAll();
  showToast("项目任务已加入今日");
}

function openProjectTaskDialog(projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return;
  openQuickDialog("拆分项目任务", `
    <label class="field-block"><span>任务</span><input name="title" /></label>
    <label class="field-block"><span>预计小时</span><input name="estimateHours" type="number" min="0.25" step="0.25" value="1" /></label>
  `, (form) => {
    const title = form.title.value.trim();
    if (!title) return false;
    project.tasks.push({
      id: createId("project-task"),
      title,
      estimateHours: Number(form.estimateHours.value || 1),
      done: false
    });
    return true;
  });
}

function openProjectCardDialog() {
  openQuickDialog("添加项目卡片", `
    <label class="field-block"><span>项目名称</span><input name="title" placeholder="例如：AI 学习项目" /></label>
    <label class="field-block"><span>初始进度</span><input name="percent" type="number" min="0" max="100" step="1" value="0" /></label>
  `, (form) => {
    const title = form.title.value.trim();
    if (!title) return false;
    state.projects.push({
      id: createId("project"),
      title,
      percent: Math.max(0, Math.min(100, Number(form.percent.value || 0))),
      note: "",
      tasks: []
    });
    return true;
  });
}

function renderExperience() {
  const visible = state.experience.filter((item) => !item.archived).slice(0, 4);
  byId("experienceList").innerHTML = visible.map((item) => `
    <li class="experience-row">
      <span>${escapeHtml(item.text)}</span>
      <span class="experience-actions">
        <button class="tiny-action" type="button" data-archive-exp="${escapeAttribute(item.id)}">归档</button>
        <button class="tiny-action" type="button" data-delete-exp="${escapeAttribute(item.id)}">删</button>
      </span>
    </li>
  `).join("") || `<li>还没有置顶经验。</li>`;

  document.querySelectorAll("[data-archive-exp]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = state.experience.find((exp) => exp.id === button.dataset.archiveExp);
      if (!item) return;
      item.archived = true;
      item.archivedAt = Date.now();
      saveState();
      renderAll();
      showToast("已归档到后台盒子");
    });
  });

  document.querySelectorAll("[data-delete-exp]").forEach((button) => {
    button.addEventListener("click", () => {
      state.experience = state.experience.filter((exp) => exp.id !== button.dataset.deleteExp);
      saveState();
      renderAll();
      showToast("已删除");
    });
  });
}

function renderCustomCards() {
  const host = byId("customCards");
  if (!host) return;
  host.innerHTML = state.imageCards.length ? state.imageCards.map((card) => `
    <article class="image-card" data-image-card-id="${escapeAttribute(card.id)}">
      <div class="image-card-head">
        <strong>${escapeHtml(card.title)}</strong>
        <span class="image-card-actions">
          ${card.link ? `<a class="tiny-action" href="${escapeAttribute(card.link)}" target="_blank" rel="noopener noreferrer">打开</a>` : ""}
          <button class="tiny-action" type="button" data-upload-image-card="${escapeAttribute(card.id)}">贴图</button>
        </span>
      </div>
      <div class="image-drop ${selectedImageCardId === card.id ? "selected" : ""}" data-image-drop="${escapeAttribute(card.id)}" tabindex="0">
        ${card.image
          ? `
            <div class="image-tools">
              <button class="tiny-action" type="button" data-zoom-image-card="${escapeAttribute(card.id)}" data-delta="-10">-</button>
              <span>${card.zoom}%</span>
              <button class="tiny-action" type="button" data-zoom-image-card="${escapeAttribute(card.id)}" data-delta="10">+</button>
              <button class="tiny-action" type="button" data-preview-image-card="${escapeAttribute(card.id)}">查看大图</button>
            </div>
            <div class="image-viewport small">
              <button class="image-preview-btn" type="button" data-preview-image-card="${escapeAttribute(card.id)}">
                <img class="zoomable-image" src="${escapeAttribute(card.image)}" alt="${escapeAttribute(card.title)}" style="width:${card.zoom}%;" />
              </button>
            </div>
          `
          : `<span>拖入图片，或点这里后 Ctrl+V 粘贴</span>`}
      </div>
    </article>
  `).join("") : `
    <div class="image-drop custom-empty-drop" data-image-drop-new tabindex="0">
      <span>拖入图片创建贴图卡片，或直接 Ctrl+V 粘贴</span>
    </div>
  `;

  document.querySelectorAll("[data-upload-image-card]").forEach((button) => {
    button.addEventListener("click", () => {
      pendingImageCardId = button.dataset.uploadImageCard;
      byId("customImageInput").click();
    });
  });

  document.querySelectorAll("[data-image-drop]").forEach((target) => {
    target.addEventListener("click", (event) => {
      if (event.target.closest("button, a")) return;
      selectedImageCardId = target.dataset.imageDrop;
      renderCustomCards();
      showToast("已选中贴图卡片，可 Ctrl+V 粘贴");
    });
    target.addEventListener("dragover", (event) => {
      event.preventDefault();
      target.classList.add("drag-over");
    });
    target.addEventListener("dragleave", () => target.classList.remove("drag-over"));
    target.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      target.classList.remove("drag-over");
      const file = [...event.dataTransfer.files].find((item) => item.type.startsWith("image/"));
      if (file) saveImageCard(target.dataset.imageDrop, file);
    });
  });

  document.querySelectorAll("[data-image-drop-new]").forEach((target) => {
    target.addEventListener("click", () => {
      selectedImageCardId = null;
      showToast("可直接拖入图片，或 Ctrl+V 创建贴图卡片");
    });
    target.addEventListener("dragover", (event) => {
      event.preventDefault();
      target.classList.add("drag-over");
    });
    target.addEventListener("dragleave", () => target.classList.remove("drag-over"));
    target.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      target.classList.remove("drag-over");
      const file = [...event.dataTransfer.files].find((item) => item.type.startsWith("image/"));
      if (file) createImageCardFromFile(file);
    });
  });

  document.querySelectorAll("[data-zoom-image-card]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = state.imageCards.find((item) => item.id === button.dataset.zoomImageCard);
      if (!card) return;
      card.zoom = clampZoom(Number(card.zoom || 100) + Number(button.dataset.delta));
      saveState();
      renderAll();
    });
  });

  document.querySelectorAll("[data-preview-image-card]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = state.imageCards.find((item) => item.id === button.dataset.previewImageCard);
      if (card) openImagePreview(card.title, card.image);
    });
  });
}

function saveImageCard(cardId, file) {
  const card = state.imageCards.find((item) => item.id === cardId);
  if (!card || !file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => {
    card.image = reader.result;
    card.zoom = 100;
    selectedImageCardId = cardId;
    saveState();
    renderAll();
    showToast("贴图已保存");
  };
  reader.readAsDataURL(file);
}

function createImageCardFromFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const title = file.name ? file.name.replace(/\.[^.]+$/, "") : "贴图卡片";
  const id = createId("image-card");
  state.imageCards.push({
    id,
    title,
    image: null,
    zoom: 100,
    link: "",
    createdAt: Date.now()
  });
  saveImageCard(id, file);
}

function openImageCardDialog() {
  openQuickDialog("添加贴图位置", `
    <label class="field-block"><span>卡片名称</span><input name="title" placeholder="课程表 / 参考图 / 资料图" /></label>
    <label class="field-block"><span>链接</span><input name="link" placeholder="可选：飞书 / 网页 / 文件链接" /></label>
  `, (form) => {
    const title = form.title.value.trim();
    if (!title) return false;
    state.imageCards.push({
      id: createId("image-card"),
      title,
      image: null,
      link: form.link.value.trim(),
      createdAt: Date.now()
    });
    return true;
  });
}

function renderGrowth() {
  const host = byId("growthCards");
  if (!host) return;
  host.innerHTML = buildGrowthMarkup();
}

function buildGrowthMarkup() {
  const today = new Date();
  const days = getWeekDays();
  return `
    <div class="week-checkin-head">
      <span>${escapeHtml(weekRangeLabel())}</span>
      <span>过往记录锁定，只在今天更新</span>
    </div>
    <div class="week-checkin-grid day-labels">
      <span></span>
      ${days.map((day) => `<span class="${isSameDay(day, today) ? "today" : ""}">${day.getMonth() + 1}.${day.getDate()}</span>`).join("")}
    </div>
    ${state.growthItems.map((item) => {
      const weekLevels = days.map((day) => item.days[growthIndexForDate(day)] || 0);
      const todayLevel = item.days[growthIndexForDate(today)] || 0;
      const doneCount = weekLevels.filter((level) => level > 0).length;
      const stamps = days.map((day) => {
        const level = item.days[growthIndexForDate(day)] || 0;
        const locked = !isSameDay(day, today);
        return `<span class="week-stamp level-${level} ${isSameDay(day, today) ? "today" : ""} ${locked ? "locked" : ""}" title="${day.getMonth() + 1}.${day.getDate()}"></span>`;
      }).join("");
      return `
        <article class="growth-item">
          <div class="week-checkin-grid">
            <div class="growth-head">
              <strong>${escapeHtml(item.title)}</strong>
              <small>${doneCount}/7 · 今日${todayLevel ? "已记" : "未记"}</small>
            </div>
            ${stamps}
          </div>
        </article>
      `;
    }).join("") || `<p class="muted-line">还没有成长项。</p>`}
  `;
}

function openGrowthItemDialog() {
  openQuickDialog("添加成长项", `
    <label class="field-block"><span>名称</span><input name="title" placeholder="背单词 / 运动 / 阅读" /></label>
  `, (form) => {
    const title = form.title.value.trim();
    if (!title) return false;
    state.growthItems.push({ id: createId("growth"), title, days: seedDays([]) });
    return true;
  });
}

function openGrowthCheckin() {
  if (!state.growthItems.length) {
    showToast("先添加一个成长项");
    return;
  }
  openQuickDialog("今日打卡", `
    <label class="field-block"><span>成长项</span><select name="growthId">
      ${state.growthItems.map((item) => `<option value="${escapeAttribute(item.id)}">${escapeHtml(item.title)}</option>`).join("")}
    </select></label>
    <label class="field-block"><span>完成程度</span><select name="level">
      <option value="1">开始一点点</option>
      <option value="2">完成一半</option>
      <option value="3">完成了</option>
    </select></label>
  `, (form) => {
    const item = state.growthItems.find((growth) => growth.id === form.growthId.value);
    if (!item) return false;
    item.days[growthIndexForDate(new Date())] = Number(form.level.value);
    showToast("今日打卡已记录");
    return true;
  });
}

function renderNotes() {
  byId("noteCount").textContent = state.notes.length;
  byId("noteList").innerHTML = state.notes.slice(-4).reverse().map((note) => `
    <div class="note-row">
      <span>${escapeHtml(note.text)}</span>
      <button class="text-action" type="button" data-delete-note="${escapeAttribute(note.id)}">×</button>
    </div>
  `).join("");
  document.querySelectorAll("[data-delete-note]").forEach((button) => {
    button.addEventListener("click", () => {
      state.notes = state.notes.filter((note) => note.id !== button.dataset.deleteNote);
      saveState();
      renderAll();
    });
  });
}

function renderReadings() {
  byId("readingList").innerHTML = state.readings.slice(-5).reverse().map((reading) => `
    <div class="reading-row">
      <a href="${escapeAttribute(reading.url)}" target="_blank" rel="noreferrer">${escapeHtml(reading.title)}</a>
      <span class="reading-tag">${escapeHtml(reading.tag)}</span>
    </div>
  `).join("") || `<p class="muted-line">今天还没有阅读收藏。</p>`;
}

function renderTempFiles() {
  byId("tempList").innerHTML = state.tempFiles.slice(-4).reverse().map((file) => `
    <div class="temp-row">
      <span>${escapeHtml(file.name)}</span>
      <span class="temp-actions">
        <button class="tiny-action" type="button" data-open-temp="${escapeAttribute(file.id)}">打开</button>
        <span class="file-tag">${escapeHtml(file.kind)}</span>
      </span>
    </div>
  `).join("");

  document.querySelectorAll("[data-open-temp]").forEach((button) => {
    button.addEventListener("click", () => {
      const url = tempFileUrls.get(button.dataset.openTemp);
      const file = state.tempFiles.find((item) => item.id === button.dataset.openTemp);
      if (isDesktopApp() && file && file.path) {
        desktopCall("打开文件", () => window.lifeosDesktop.openTarget(file.path));
      } else if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        showToast("刷新后浏览器不再保留文件权限，桌面版会保存本地路径");
      }
    });
  });
}

function renderTime() {
  document.querySelectorAll(".mode-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.mode === state.timer.mode);
  });
  byId("pomodoroSetting").classList.toggle("active", state.timer.mode === "pomodoro");
  byId("pomodoroMinutesInput").value = state.timer.pomodoroMinutes;

  if (state.timer.mode === "clock") {
    const now = new Date();
    byId("timeDisplay").textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    if (byId("navFocusTime")) byId("navFocusTime").textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    byId("timeCaption").textContent = "当前时间";
    byId("timerToggle").hidden = true;
    byId("timerReset").hidden = true;
    return;
  }

  byId("timerToggle").hidden = false;
  byId("timerReset").hidden = false;
  byId("timerToggle").textContent = state.timer.running ? "Pause" : "Start";

  if (state.timer.mode === "pomodoro") {
    byId("timeDisplay").textContent = fmtSeconds(state.timer.pomodoroSeconds);
    if (byId("navFocusTime")) byId("navFocusTime").textContent = fmtSeconds(state.timer.pomodoroSeconds).slice(3);
    byId("timeCaption").textContent = "番茄钟";
  } else {
    const task = findTask(state.timer.focusTaskId);
    byId("timeDisplay").textContent = fmtSeconds(state.timer.timerSeconds);
    if (byId("navFocusTime")) byId("navFocusTime").textContent = fmtSeconds(state.timer.timerSeconds).slice(3);
    byId("timeCaption").textContent = task ? `正计时：${task.title}` : "正计时";
  }
}

function tickTimer() {
  updateClockText();
  if (state.timer.running) {
    const now = Date.now();
    const diff = state.timer.lastTick ? Math.floor((now - state.timer.lastTick) / 1000) : 1;
    if (diff > 0) {
      state.timer.lastTick = now;
      if (state.timer.mode === "pomodoro") {
        state.timer.pomodoroSeconds = Math.max(0, state.timer.pomodoroSeconds - diff);
        if (state.timer.pomodoroSeconds === 0) {
          state.timer.running = false;
          showToast("番茄钟结束");
        }
      } else {
        state.timer.timerSeconds += diff;
        const task = findTask(state.timer.focusTaskId);
        if (task) task.actualSeconds += diff;
      }
      saveState();
    }
  }
  renderTime();
}

function applyWidgetVisibility() {
  document.querySelectorAll("[data-widget]").forEach((widget) => {
    const key = widget.dataset.widget;
    widget.hidden = !state.settings.visibleWidgets[key];
  });
}

function openQuickDialog(title, fieldsHtml, handler) {
  byId("quickDialogTitle").textContent = title;
  byId("quickDialogFields").innerHTML = fieldsHtml;
  quickHandler = handler;
  byId("quickDialog").showModal();
  const first = byId("quickDialogFields").querySelector("input, textarea, select");
  if (first) setTimeout(() => first.focus(), 40);
}

function setupEvents() {
  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog")?.close());
  });

  byId("enterWorkspace").addEventListener("click", () => setScreen("workspace"));
  byId("backToBrief").addEventListener("click", () => setScreen("brief"));
  byId("briefAddTask").addEventListener("click", () => {
    setScreen("workspace");
    byId("taskTitleInput").focus();
  });
  byId("openReviewBtn").addEventListener("click", openReview);
  byId("openReviewFromBrief").addEventListener("click", openReview);
  byId("setLockScreenBtn").addEventListener("click", setTodayLockScreen);
  byId("setLockFromBriefBtn").addEventListener("click", setTodayLockScreen);
  byId("windowModeBtn").addEventListener("click", toggleWindowMode);
  byId("minimizeAppBtn").addEventListener("click", () => desktopCall("最小化", () => window.lifeosDesktop.minimizeWindow()));
  byId("exitAppBtn").addEventListener("click", () => {
    if (confirm("退出 LifeOS？")) {
      desktopCall("退出", () => window.lifeosDesktop.exitApp());
    }
  });
  byId("archiveBtn").addEventListener("click", openArchive);
  document.querySelectorAll("[data-archive-view]").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.archiveView = tab.dataset.archiveView;
      saveState();
      renderArchive();
    });
  });

  byId("scheduleImageBtn").addEventListener("click", () => byId("scheduleImageInput").click());
  byId("scheduleImageInput").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    saveScheduleImage(file);
    event.target.value = "";
  });

  byId("taskForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const title = byId("taskTitleInput").value.trim();
    const estimateHours = Number(byId("taskHoursInput").value || 1);
    if (!title) return;
    state.tasks.push({
      id: createId("task"),
      title,
      estimateHours,
      progress: 0,
      actualSeconds: 0,
      done: false
    });
    byId("taskTitleInput").value = "";
    saveState();
    renderAll();
  });

  byId("captureForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const text = byId("captureInput").value.trim();
    if (!text) return;
    state.notes.push({ id: createId("note"), text, createdAt: Date.now() });
    byId("captureInput").value = "";
    saveState();
    renderAll();
    showToast("已保存");
  });

  byId("addToolBtn").addEventListener("click", () => openQuickDialog("添加工具", `
    <label class="field-block"><span>分类</span><input name="group" value="Custom" /></label>
    <label class="field-block"><span>名称</span><input name="name" /></label>
    <label class="field-block"><span>地址</span><input name="target" placeholder="ChatGPT / vscode / cursor / C:\\路径\\App.exe / 文件夹路径" /></label>
    <p class="field-hint">桌面版支持开始菜单快捷方式名、.exe 路径、文件夹路径和网址。比如填 ChatGPT 会优先找本机桌面版。</p>
  `, (form) => {
    const groupName = form.group.value.trim() || "Custom";
    const name = form.name.value.trim();
    const target = form.target.value.trim();
    if (!name || !target) return false;
    let group = state.launchers.find((item) => item.group === groupName);
    if (!group) {
      group = { group: groupName, tools: [] };
      state.launchers.push(group);
    }
    group.tools.push({ name, target });
    return true;
  }));

  byId("addWeeklyBtn").addEventListener("click", () => openWeeklyTaskDialog());

  byId("addProjectCardBtn").addEventListener("click", openProjectCardDialog);
  byId("addImageCardBtn").addEventListener("click", openImageCardDialog);

  byId("customImageInput").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (pendingImageCardId && file) saveImageCard(pendingImageCardId, file);
    pendingImageCardId = null;
    event.target.value = "";
  });

  const customPanel = document.querySelector(".custom-card-panel");
  customPanel.addEventListener("dragover", (event) => {
    const fileDrag = [...(event.dataTransfer?.items || [])].some((item) => item.kind === "file");
    if (!fileDrag) return;
    event.preventDefault();
    customPanel.classList.add("drag-over");
  });
  customPanel.addEventListener("dragleave", () => customPanel.classList.remove("drag-over"));
  customPanel.addEventListener("drop", (event) => {
    if (event.target.closest("[data-image-drop], [data-image-drop-new]")) return;
    event.preventDefault();
    customPanel.classList.remove("drag-over");
    const file = [...event.dataTransfer.files].find((item) => item.type.startsWith("image/"));
    if (file) createImageCardFromFile(file);
  });

  byId("addExperienceBtn").addEventListener("click", () => openQuickDialog("添加经验", `
    <label class="field-block"><span>经验</span><textarea name="text" rows="3"></textarea></label>
  `, (form) => {
    const text = form.text.value.trim();
    if (!text) return false;
    state.experience.unshift({ id: createId("exp"), text, createdAt: Date.now(), archived: false });
    return true;
  }));

  byId("addReadingBtn").addEventListener("click", () => openReadingDialog());

  byId("quickForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!quickHandler) return;
    const ok = quickHandler(event.target);
    if (ok === false) return;
    saveState();
    renderAll();
    byId("quickDialog").close();
    showToast("已保存");
  });

  byId("customizeBtn").addEventListener("click", openCustomize);
  byId("exportBackupBtn").addEventListener("click", exportLifeOSBackup);
  byId("openDataDirBtn").addEventListener("click", () => desktopCall("打开数据文件夹", () => window.lifeosDesktop.openDataDir()));
  byId("startupToggleInput").addEventListener("change", (event) => setStartupEnabled(event.target.checked));
  byId("settingsAddProjectBtn").addEventListener("click", openProjectCardDialog);
  byId("settingsAddImageBtn").addEventListener("click", openImageCardDialog);
  byId("saveSettingsBtn").addEventListener("click", () => {
    state.settings.reviewTime = byId("reviewTimeInput").value || "23:30";
    state.settings.weekStartDate = byId("weekStartDateInput").value || defaultWeekStartDate();
    state.settings.syncMode = byId("syncModeInput").value;
    state.settings.mantra = byId("mantraInput").value.trim() || defaultState.settings.mantra;
    document.querySelectorAll("[data-toggle-widget]").forEach((input) => {
      state.settings.visibleWidgets[input.dataset.toggleWidget] = input.checked;
    });
    saveState();
    renderAll();
  });

  byId("saveReviewBtn").addEventListener("click", () => saveReview());

  byId("moodRow").addEventListener("click", (event) => {
    const button = event.target.closest("[data-mood]");
    if (!button) return;
    state.mood = button.dataset.mood;
    renderMood();
  });

  byId("voiceReviewBtn").addEventListener("click", startVoiceReview);

  document.querySelectorAll(".mode-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.timer.mode = tab.dataset.mode;
      state.timer.running = false;
      state.timer.lastTick = null;
      if (state.timer.mode === "pomodoro") {
        state.timer.pomodoroSeconds = state.timer.pomodoroMinutes * 60;
      }
      saveState();
      renderAll();
    });
  });

  document.querySelectorAll("[data-week-view]").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.weekView = tab.dataset.weekView;
      saveState();
      renderAll();
    });
  });

  byId("pomodoroMinutesInput").addEventListener("change", (event) => {
    state.timer.pomodoroMinutes = Math.max(5, Math.min(120, Number(event.target.value || 25)));
    if (!state.timer.running || state.timer.mode !== "pomodoro") {
      state.timer.pomodoroSeconds = state.timer.pomodoroMinutes * 60;
    }
    saveState();
    renderAll();
  });

  byId("timerToggle").addEventListener("click", () => {
    state.timer.running = !state.timer.running;
    state.timer.lastTick = state.timer.running ? Date.now() : null;
    saveState();
    renderAll();
  });

  byId("timerReset").addEventListener("click", () => {
    state.timer.running = false;
    state.timer.lastTick = null;
    if (state.timer.mode === "pomodoro") state.timer.pomodoroSeconds = state.timer.pomodoroMinutes * 60;
    else state.timer.timerSeconds = 0;
    saveState();
    renderAll();
  });

  const dropZone = byId("dropZone");
  ["dragenter", "dragover"].forEach((type) => {
    dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropZone.classList.add("dragging");
    });
  });
  ["dragleave", "drop"].forEach((type) => {
    dropZone.addEventListener(type, () => dropZone.classList.remove("dragging"));
  });
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const files = Array.from(event.dataTransfer.files || []);
    files.forEach((file) => {
      const id = createId("file");
      tempFileUrls.set(id, URL.createObjectURL(file));
      state.tempFiles.push({
        id,
        name: file.name,
        path: file.path || file.webkitRelativePath || "",
        size: file.size,
        kind: classifyFile(file),
        addedAt: Date.now()
      });
    });
    saveState();
    renderAll();
    showToast(files.length ? `已加入 ${files.length} 个文件` : "可以拖本地文件进来");
  });

  byId("sortTempBtn").addEventListener("click", () => {
    state.tempFiles.sort((a, b) => a.kind.localeCompare(b.kind));
    saveState();
    renderAll();
    showToast("已按类型整理");
  });

  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.code === "Space") {
      event.preventDefault();
      setScreen("workspace");
      byId("captureInput").focus();
    }
    if (event.ctrlKey && event.shiftKey && event.code === "KeyA") {
      event.preventDefault();
      openReadingDialog();
    }
  });

  document.addEventListener("paste", (event) => {
    const active = document.activeElement;
    if (active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) return;
    const file = [...(event.clipboardData?.files || [])].find((item) => item.type.startsWith("image/"));
    if (!file) return;
    event.preventDefault();
    if (selectedImageCardId && state.imageCards.some((card) => card.id === selectedImageCardId)) {
      saveImageCard(selectedImageCardId, file);
      return;
    }
    if (state.weekView === "schedule") {
      saveScheduleImage(file);
      return;
    }
    if (!state.imageCards.length) {
      createImageCardFromFile(file);
      return;
    }
    if (state.imageCards.length === 1) {
      selectedImageCardId = state.imageCards[0].id;
      saveImageCard(selectedImageCardId, file);
      return;
    }
    showToast("先点一个贴图卡片，再 Ctrl+V 粘贴");
  });
}

async function hydrateDesktopState() {
  if (!isDesktopApp()) return;
  const saved = await desktopCall("读取桌面数据", () => window.lifeosDesktop.loadState());
  if (!saved) return;
  state = normalizeState(mergeState(defaultState, saved));
  state.timer.running = false;
  state.timer.lastTick = null;
  setScreen(state.screen);
  renderAll();
}

async function setTodayLockScreen() {
  const dataUrl = buildDailyBriefPng();
  const imagePath = await desktopCall(
    "设置锁屏",
    () => window.lifeosDesktop.setDailyLockScreen(dataUrl),
    "今日锁屏图已生成"
  );
  if (!imagePath) return;
  await desktopCall("锁定电脑", () => window.lifeosDesktop.lockWorkstation());
}

function buildDailyBriefPng() {
  const canvas = document.createElement("canvas");
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  const now = new Date();
  const project = primaryProject();
  const tasks = state.tasks.slice(0, 4);

  ctx.fillStyle = "#fbfaf6";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f3eee4";
  for (let y = 0; y < canvas.height; y += 18) {
    ctx.fillRect(0, y, canvas.width, 1);
  }

  drawText(ctx, "LifeOS", 94, 96, 38, "#1f2528", "600");
  drawText(ctx, "今日锁屏简报", 94, 144, 26, "#586064");
  drawText(ctx, `${pad(now.getHours())}:${pad(now.getMinutes())}`, 94, 310, 132, "#111416", "500");
  drawText(ctx, todayLabel(), 104, 370, 34, "#586064");
  drawText(ctx, state.settings.mantra || "专注当下，温柔向前。", 104, 502, 34, "#2c3032");

  drawVase(ctx, 250, 640);

  drawCard(ctx, 1040, 110, 720, 360, "今日任务");
  tasks.forEach((task, index) => {
    const y = 200 + index * 62;
    drawText(ctx, `${task.estimateHours}h`, 1084, y, 28, "#1f2528", "600");
    drawText(ctx, task.title, 1170, y, 28, "#1f2528", "600");
    drawText(ctx, `${task.progress}%`, 1640, y, 28, "#69bd96", "600");
  });
  if (!tasks.length) drawText(ctx, "今天还没有任务。", 1084, 220, 28, "#777c78");

  drawCard(ctx, 1040, 520, 720, 250, "当前项目");
  drawText(ctx, project.title, 1084, 610, 34, "#1f2528", "600");
  ctx.fillStyle = "#e4e0d8";
  roundedRect(ctx, 1084, 650, 500, 16, 8);
  ctx.fill();
  ctx.fillStyle = "#69bd96";
  roundedRect(ctx, 1084, 650, Math.max(12, project.percent * 5), 16, 8);
  ctx.fill();
  drawText(ctx, `${project.percent}%`, 1620, 666, 44, "#1f2528", "600");
  drawText(ctx, state.settings.mantra || "", 1084, 720, 24, "#777c78");

  drawText(ctx, "按任意键进入 Windows，然后打开 LifeOS 开始今天。", 104, 980, 24, "#7b807c");
  return canvas.toDataURL("image/png");
}

function drawCard(ctx, x, y, width, height, title) {
  ctx.fillStyle = "rgba(255,255,252,0.84)";
  roundedRect(ctx, x, y, width, height, 24);
  ctx.fill();
  ctx.strokeStyle = "#d8d3c9";
  ctx.lineWidth = 2;
  ctx.stroke();
  drawText(ctx, title, x + 44, y + 64, 32, "#1f2528", "600");
}

function drawText(ctx, text, x, y, size, color, weight = "400") {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "Microsoft YaHei", "Segoe UI", sans-serif`;
  ctx.fillText(String(text), x, y);
}

function roundedRect(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}

function drawVase(ctx, x, y) {
  ctx.strokeStyle = "#25292b";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.ellipse(x, y + 120, 74, 88, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 28, y + 32);
  ctx.lineTo(x - 48, y + 190);
  ctx.moveTo(x + 12, y + 18);
  ctx.lineTo(x + 36, y + 194);
  ctx.moveTo(x - 8, y + 40);
  ctx.lineTo(x + 100, y - 86);
  ctx.moveTo(x - 8, y + 40);
  ctx.lineTo(x - 116, y - 42);
  ctx.stroke();
  for (const [lx, ly, rx, ry] of [[74, -50, 110, -76], [50, -14, 86, -28], [-76, -20, -118, -42], [-42, 18, -86, 8]]) {
    ctx.beginPath();
    ctx.ellipse(x + lx, y + ly, 24, 10, Math.atan2(ry - ly, rx - lx), 0, Math.PI * 2);
    ctx.stroke();
  }
}

function openReadingDialog() {
  openQuickDialog("添加网页收藏", `
    <label class="field-block"><span>标题</span><input name="title" value="${escapeAttribute(document.title || "")}" /></label>
    <label class="field-block"><span>链接</span><input name="url" value="${escapeAttribute(location.href)}" /></label>
    <label class="field-block"><span>分类</span><input name="tag" value="AI" /></label>
  `, (form) => {
    const title = form.title.value.trim();
    const url = form.url.value.trim();
    const tag = form.tag.value.trim() || "阅读";
    if (!title || !url) return false;
    state.readings.push({ id: createId("read"), title, url, tag, status: "未读" });
    return true;
  });
}

function openCustomize() {
  const labels = {
    launcher: "常用工具",
    today: "今日任务",
    weekly: "本周计划台",
    project: "项目任务池",
    experience: "经验库",
    customCards: "贴图卡片",
    time: "时间组件",
    capture: "随手记",
    reading: "网页收藏",
    temp: "临时文件"
  };
  byId("widgetToggles").innerHTML = Object.entries(labels).map(([key, label]) => `
    <label class="toggle-item">
      <input type="checkbox" data-toggle-widget="${key}" ${state.settings.visibleWidgets[key] ? "checked" : ""} />
      <span>${label}</span>
    </label>
  `).join("");
  byId("reviewTimeInput").value = state.settings.reviewTime;
  byId("weekStartDateInput").value = state.settings.weekStartDate || defaultWeekStartDate();
  byId("syncModeInput").value = state.settings.syncMode;
  byId("mantraInput").value = state.settings.mantra;
  refreshStartupStatus();
  byId("customizeDialog").showModal();
}

async function toggleWindowMode() {
  const nextMode = state.settings.windowMode === "compact" ? "desktop" : "compact";
  const result = await desktopCall(
    "切换窗口模式",
    () => window.lifeosDesktop.setWindowMode(nextMode),
    nextMode === "compact" ? "已切到小窗口" : "已切到桌面模式"
  );
  if (result === null && isDesktopApp()) return;
  state.settings.windowMode = nextMode;
  byId("windowModeBtn").textContent = nextMode === "compact" ? "▢" : "▣";
  saveState();
}

async function exportLifeOSBackup() {
  const path = await desktopCall(
    "导出备份",
    () => window.lifeosDesktop.exportBackup(state),
    "备份已导出"
  );
  if (path) showToast(`备份已保存：${path}`);
}

async function refreshStartupStatus() {
  const input = byId("startupToggleInput");
  const text = byId("startupStatusText");
  if (!isDesktopApp()) {
    input.checked = false;
    input.disabled = true;
    text.textContent = "开机自启：桌面版可用";
    return;
  }
  const enabled = await desktopCall("检测开机自启", () => window.lifeosDesktop.getStartupStatus());
  input.disabled = false;
  input.checked = Boolean(enabled);
  text.textContent = enabled ? "开机自启：已开启" : "开机自启：未开启";
}

async function setStartupEnabled(enabled) {
  const result = await desktopCall(
    enabled ? "开启自启" : "关闭自启",
    () => window.lifeosDesktop.setStartupEnabled(enabled),
    enabled ? "开机自启已开启" : "开机自启已关闭"
  );
  byId("startupToggleInput").checked = Boolean(result);
  byId("startupStatusText").textContent = result ? "开机自启：已开启" : "开机自启：未开启";
}

function openReview() {
  byId("autoSummary").innerHTML = buildAutoSummary();
  byId("unfinishedReview").innerHTML = buildUnfinishedReview();
  byId("dailyMessageInput").value = state.settings.mantra || "";
  byId("reviewText").value = "";
  byId("tomorrowText").value = "";
  renderMood();
  byId("reviewDialog").showModal();
}

function buildAutoSummary() {
  const completed = state.tasks.filter((task) => task.done);
  const active = state.tasks.filter((task) => !task.done);
  const focusSeconds = state.tasks.reduce((sum, task) => sum + task.actualSeconds, 0);
  const lines = [
    `今天完成 ${completed.length} 项，推进中 ${active.length} 项。`,
    `累计记录专注 ${fmtHours(focusSeconds)}。`,
    completed.length ? `完成：${completed.map((task) => task.title).join("、")}。` : "还没有标记完成的任务。",
    state.settings.mantra ? `小贴士：${state.settings.mantra}` : "明天也保持轻一点的节奏。"
  ];
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

function buildUnfinishedReview() {
  const unfinished = state.tasks.filter((task) => !task.done);
  if (!unfinished.length) return "";
  return unfinished.map((task) => `
    <section class="unfinished-card" data-review-task="${escapeAttribute(task.id)}">
      <div>
        <h3>${escapeHtml(task.title)}</h3>
        <textarea data-review-reason="${escapeAttribute(task.id)}" placeholder="未完成原因，比如低估时间 / 被打断 / 不重要了"></textarea>
      </div>
      <div class="review-action-fields">
        <select data-review-action="${escapeAttribute(task.id)}">
          <option value="tomorrow">转为明日任务</option>
          <option value="week">放回周任务池</option>
          <option value="later">延期到某天</option>
          <option value="archive">暂时归档</option>
        </select>
        <input data-review-date="${escapeAttribute(task.id)}" type="date" />
      </div>
    </section>
  `).join("");
}

function renderMood() {
  document.querySelectorAll("[data-mood]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mood === state.mood);
  });
}

function saveReview() {
  const unfinished = state.tasks.filter((task) => !task.done).map((task) => {
    const action = document.querySelector(`[data-review-action="${cssEscape(task.id)}"]`)?.value || "tomorrow";
    const reason = document.querySelector(`[data-review-reason="${cssEscape(task.id)}"]`)?.value.trim() || "";
    const date = document.querySelector(`[data-review-date="${cssEscape(task.id)}"]`)?.value || "";
    return { taskId: task.id, title: task.title, action, reason, date };
  });

  const now = new Date();
  const review = {
    id: createId("review"),
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    mood: state.mood,
    dailyMessage: byId("dailyMessageInput").value.trim(),
    summary: byId("autoSummary").innerText.trim(),
    text: byId("reviewText").value.trim(),
    tomorrow: byId("tomorrowText").value.trim(),
    unfinished,
    createdAt: Date.now()
  };
  state.reviews.push(review);
  if (review.dailyMessage) state.settings.mantra = review.dailyMessage;

  unfinished.forEach((item) => {
    const task = findTask(item.taskId);
    if (!task) return;
    if (item.action === "week" || item.action === "later") {
      moveTaskToWeekWithDate(task, item.date || "待安排");
    }
    if (item.action === "archive") {
      state.tasks = state.tasks.filter((taskItem) => taskItem.id !== item.taskId);
    }
  });

  if (review.tomorrow) {
    review.tomorrow.split(/\n+/).map((line) => line.trim()).filter(Boolean).forEach((title) => {
      state.tasks.push({
        id: createId("task"),
        title,
        estimateHours: 1,
        progress: 0,
        actualSeconds: 0,
        done: false
      });
    });
  }
  saveState();
  renderAll();
  showToast("复盘已归档");
}

function openArchive() {
  renderArchive();
  byId("archiveDialog").showModal();
}

function renderArchive(selectedReviewId = null) {
  document.querySelectorAll("[data-archive-view]").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.archiveView === state.archiveView);
  });

  if (state.archiveView === "tasks") {
    byId("archiveContent").innerHTML = state.archivedTasks.map((task) => `
      <article class="archive-item">
        <div>
          <strong>${escapeHtml(task.title)}</strong>
          <p>${formatDateTime(task.archivedAt || Date.now())} 归档 · 预计 ${task.estimateHours || 1}h · 进度 ${task.progress || 0}%</p>
        </div>
        <div class="archive-actions">
          <button class="tiny-action" type="button" data-restore-task="${escapeAttribute(task.id)}">恢复</button>
          <button class="tiny-action" type="button" data-hard-delete-task="${escapeAttribute(task.id)}">删除</button>
        </div>
      </article>
    `).join("") || `<p class="muted-line">还没有归档任务。</p>`;

    document.querySelectorAll("[data-restore-task]").forEach((button) => {
      button.addEventListener("click", () => {
        const task = state.archivedTasks.find((item) => item.id === button.dataset.restoreTask);
        if (!task) return;
        state.archivedTasks = state.archivedTasks.filter((item) => item.id !== task.id);
        state.tasks.unshift({
          id: task.id,
          title: task.title,
          estimateHours: task.estimateHours || 1,
          progress: task.progress || 0,
          actualSeconds: task.actualSeconds || 0,
          done: Boolean(task.done)
        });
        saveState();
        renderAll();
        renderArchive();
      });
    });

    document.querySelectorAll("[data-hard-delete-task]").forEach((button) => {
      button.addEventListener("click", () => {
        state.archivedTasks = state.archivedTasks.filter((item) => item.id !== button.dataset.hardDeleteTask);
        saveState();
        renderArchive();
      });
    });
    return;
  }

  if (state.archiveView === "experience") {
    const archived = state.experience.filter((item) => item.archived);
    byId("archiveContent").innerHTML = archived.map((item) => `
      <article class="archive-item">
        <div>
          <strong>${escapeHtml(item.text)}</strong>
          <p>${formatDateTime(item.archivedAt || item.createdAt)} 归档</p>
        </div>
        <div class="archive-actions">
          <button class="tiny-action" type="button" data-restore-exp="${escapeAttribute(item.id)}">恢复</button>
          <button class="tiny-action" type="button" data-hard-delete-exp="${escapeAttribute(item.id)}">删除</button>
        </div>
      </article>
    `).join("") || `<p class="muted-line">还没有归档经验。</p>`;

    document.querySelectorAll("[data-restore-exp]").forEach((button) => {
      button.addEventListener("click", () => {
        const item = state.experience.find((exp) => exp.id === button.dataset.restoreExp);
        if (!item) return;
        item.archived = false;
        item.archivedAt = null;
        saveState();
        renderAll();
        renderArchive();
      });
    });

    document.querySelectorAll("[data-hard-delete-exp]").forEach((button) => {
      button.addEventListener("click", () => {
        state.experience = state.experience.filter((exp) => exp.id !== button.dataset.hardDeleteExp);
        saveState();
        renderAll();
        renderArchive();
      });
    });
    return;
  }

  if (state.archiveView === "growth") {
    const selected = state.reviews.find((review) => review.id === selectedReviewId);
    const moodBubbles = state.reviews.slice().reverse().map((review) => `
      <button class="mood-bubble mood-${escapeAttribute(review.mood)}" type="button" data-open-review-detail="${escapeAttribute(review.id)}" title="${escapeAttribute(review.date)}"></button>
    `).join("");
    const growth = state.growthItems.map((item) => {
      const total = item.days.reduce((sum, level) => sum + Number(level || 0), 0);
      return `<li>${escapeHtml(item.title)} · 本月强度 ${total}</li>`;
    }).join("");
    byId("archiveContent").innerHTML = `
      <section class="archive-summary">
        <h3>${currentMonthLabel()} 月度统计</h3>
        <p>心情泡泡</p>
        <div class="mood-bubbles">${moodBubbles || "<span class='muted-line'>还没有复盘记录。</span>"}</div>
        <p>成长卡片</p>
        <ul class="clean-list">${growth}</ul>
        ${selected ? `
          <article class="archive-item selected-review">
            <strong>${escapeHtml(selected.date)} · ${escapeHtml(selected.mood)}</strong>
            <p>${escapeHtml(selected.dailyMessage || "")}</p>
            <p>${escapeHtml(selected.text || "这天还没有心情日记。")}</p>
          </article>
        ` : ""}
      </section>
    `;
    document.querySelectorAll("[data-open-review-detail]").forEach((button) => {
      button.addEventListener("click", () => renderArchive(button.dataset.openReviewDetail));
    });
    return;
  }

  byId("archiveContent").innerHTML = state.reviews.slice().reverse().map((review) => `
    <article class="archive-item">
      <div>
        <strong>${escapeHtml(review.date)} · ${escapeHtml(review.mood)}</strong>
        <p>${escapeHtml(review.dailyMessage || "")}</p>
        <p>${escapeHtml(review.text || "没有心情日记。")}</p>
      </div>
    </article>
  `).join("") || `<p class="muted-line">还没有保存过复盘。</p>`;
}

function moveTaskToWeekWithDate(task, due) {
  state.tasks = state.tasks.filter((taskItem) => taskItem.id !== task.id);
  state.weekly.unshift({
    id: createId("week"),
    title: task.title,
    estimateHours: task.estimateHours,
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : "",
    dueTime: "",
    quadrant: "重要不紧急",
    done: false
  });
}

function startVoiceReview() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    showToast("当前浏览器不支持语音输入");
    return;
  }
  const recognition = new Recognition();
  recognition.lang = "zh-CN";
  recognition.interimResults = false;
  recognition.onresult = (event) => {
    const text = Array.from(event.results)
      .map((result) => result[0].transcript)
      .join("");
    byId("reviewText").value = `${byId("reviewText").value} ${text}`.trim();
  };
  recognition.onerror = () => showToast("语音没有识别成功");
  recognition.start();
  showToast("正在听");
}

function classifyFile(file) {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("image/") || /\.(png|jpg|jpeg|gif|webp|svg)$/.test(name)) return "Images";
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "PDF";
  if (/\.(doc|docx|txt|md|ppt|pptx|xls|xlsx)$/.test(name)) return "Docs";
  if (/\.(zip|rar|7z)$/.test(name)) return "Archive";
  return "Other";
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cssEscape(value) {
  if (window.CSS && CSS.escape) return CSS.escape(value);
  return String(value).replace(/"/g, '\\"');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

setupEvents();
setScreen(state.screen);
renderAll();
hydrateDesktopState();
setInterval(tickTimer, 1000);
