const workspace = document.querySelector("#workspace");
const workspaceTitle = document.querySelector("#workspace-title");
const workspaceSubtitle = document.querySelector("#workspace-subtitle");
const workspaceContent = document.querySelector("#workspace-content");
const resetWorkspaceButton = document.querySelector("#reset-workspace");
const paymentRoot = document.querySelector("#payment-app");

const today = "2026-08-15";
const defaultStartDate = "2026-08-17";
const defaultEndDate = "2026-08-18";

const savedPlaces = [
  {
    id: "vibe-cafe",
    name: "Vibe Cafe",
    city: "Phnom Penh",
    type: "Cafe",
    note: "An easy breakfast stop with calm interiors and good coffee.",
  },
  {
    id: "lot-369",
    name: "Lot 369",
    city: "Phnom Penh",
    type: "Restaurant",
    note: "A strong dinner anchor with a polished local menu.",
  },
  {
    id: "independence-monument",
    name: "Independence Monument",
    city: "Phnom Penh",
    type: "Landmark",
    note: "A flexible sightseeing stop that pairs well with a city walk.",
  },
];

const dayThemes = [
  "Arrival and neighborhood favorites",
  "Culture, food, and signature stops",
  "Slow moments and scenic highlights",
  "Local experiences with flexible downtime",
  "Hidden gems and memorable evenings",
];

const categoryMeta = {
  place: {
    label: "Place",
    accent: "place",
    defaultTitle: "New destination",
    defaultNote: "A sightseeing or attraction stop for the day.",
  },
  stay: {
    label: "Stay",
    accent: "stay",
    defaultTitle: "Hotel check-in",
    defaultNote: "A stay block for check-in, rest, or an overnight anchor.",
  },
  transit: {
    label: "Transit",
    accent: "transit",
    defaultTitle: "Transfer",
    defaultNote: "A transport leg between neighborhoods or key stops.",
  },
  saved: {
    label: "Saved",
    accent: "saved",
    defaultTitle: "Saved place",
    defaultNote: "Pulled from the traveler’s saved places list.",
  },
  custom: {
    label: "Custom",
    accent: "custom",
    defaultTitle: "Custom moment",
    defaultNote: "A flexible note, reminder, or off-script experience.",
  },
};

const mapPositions = [
  { x: 18, y: 28 },
  { x: 48, y: 34 },
  { x: 70, y: 22 },
  { x: 62, y: 58 },
  { x: 29, y: 62 },
  { x: 80, y: 66 },
];

const draftProgressSteps = [
  "Reading trip dates and destination",
  "Balancing daily themes and pace",
  "Placing places, transit, and stay moments",
  "Preparing an editable premium draft",
];

const paymentConfig = {
  currency: "USD",
  checkoutTimeoutMinutes: 20,
  checkoutApiConfigured: false,
  webhookEndpointConfigured: false,
  webhookSignatureVerified: false,
  providers: {
    stripe: {
      label: "Stripe",
      description: "Cards, Apple Pay, Google Pay",
      enabled: false,
      endpoint: "/api/payments/stripe/create-session",
      webhookEvent: "checkout.session.completed",
    },
    aba: {
      label: "ABA PayWay",
      description: "Local checkout for Cambodia",
      enabled: false,
      endpoint: "/api/payments/aba/create-order",
      webhookEvent: "transaction.approved",
    },
  },
};

const paymentState = {
  orderNumber: "",
  previewStatus: "pending",
  lastCheckoutMessage: "Checkout is locked until the payment API and verified webhooks are connected.",
};

const appState = {
  workspaceMode: "",
  autoBuildTimer: null,
  manual: createDefaultManualState(),
  auto: createDefaultAutoState(),
};

const drawerGesture = {
  active: false,
  startY: 0,
  pointerId: null,
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function makeId(prefix) {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function safeDate(value, fallback) {
  if (!value) {
    return fallback;
  }

  return value;
}

function formatDate(value) {
  if (!value) {
    return "Flexible dates";
  }

  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatCompactDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getTripLength(startDate, endDate) {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  const diff = end.getTime() - start.getTime();
  return Math.max(Math.floor(diff / 86400000) + 1, 1);
}

function getShortDestination(destination) {
  return destination.split(",")[0].trim();
}

function buildDayLabel(dateValue, index) {
  const date = new Date(`${dateValue}T12:00:00`);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
  return `${formatCompactDate(dateValue)} ${weekday}`;
}

function createItem({ category, title, note, time, savedPlaceId = "" }) {
  return {
    id: makeId("item"),
    category,
    title,
    note,
    time,
    savedPlaceId,
  };
}

function createDay(dateValue, index, items = []) {
  return {
    id: `day-${index}`,
    date: dateValue,
    label: buildDayLabel(dateValue, index),
    note: dayThemes[index % dayThemes.length],
    items,
  };
}

function buildDays(startDate, endDate, sourceDays = [], preserveOverflow = []) {
  const totalDays = getTripLength(startDate, endDate);
  const days = Array.from({ length: totalDays }, (_, index) => {
    const date = new Date(`${startDate}T12:00:00`);
    date.setDate(date.getDate() + index);
    const dateValue = date.toISOString().slice(0, 10);
    return createDay(dateValue, index, sourceDays[index]?.items ?? []);
  });

  return {
    days,
    overflowItems: sourceDays.slice(totalDays).flatMap((day) => day.items).concat(preserveOverflow),
  };
}

function createDefaultManualState() {
  const firstPlace = savedPlaces[0];
  return {
    tripName: "Beijing 2-day Trip",
    destination: "Beijing, China",
    startDate: defaultStartDate,
    endDate: defaultEndDate,
    drawerMode: "split",
    activeTab: "day-0",
    selectedItemId: "",
    editingItemId: "",
    composer: {
      category: "place",
      target: "day-0",
      title: "",
      note: "",
      time: "10:00",
      savedPlaceId: firstPlace.id,
    },
    days: [
      createDay(defaultStartDate, 0, [
        createItem({
          category: "saved",
          title: firstPlace.name,
          note: firstPlace.note,
          time: "10:00",
          savedPlaceId: firstPlace.id,
        }),
      ]),
      createDay(defaultEndDate, 1, []),
    ],
    ideas: [
      createItem({
        category: "stay",
        title: "Hotel shortlist",
        note: "Keep one boutique stay and one central hotel option in the ideas list.",
        time: "Flexible",
      }),
      createItem({
        category: "custom",
        title: "Golden hour photo stop",
        note: "Reserve one scenic moment for sunset or rooftop views.",
        time: "6:00 PM",
      }),
    ],
  };
}

function createDefaultAutoState() {
  return {
    status: "idle",
    destination: "Chengdu, China",
    startDate: "2026-08-18",
    endDate: "2026-08-19",
    vibe: "Food alleys, riverside walks, and a little culture.",
    focus: ["food", "culture"],
    progressStep: 0,
    progressLabel: draftProgressSteps[0],
    plan: null,
  };
}

function showWorkspace(title, subtitle, content) {
  const shouldScroll = workspace.classList.contains("hidden");
  workspace.classList.remove("hidden");
  workspaceTitle.textContent = title;
  workspaceSubtitle.textContent = subtitle;
  workspaceContent.classList.remove("is-entering");
  workspaceContent.innerHTML = content;
  workspaceContent.classList.add("is-entering");
  window.requestAnimationFrame(() => {
    workspaceContent.classList.remove("is-entering");
  });
  if (shouldScroll) {
    workspace.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function getActivePlanForWorkspace() {
  if (appState.workspaceMode === "manual") {
    return appState.manual;
  }

  if (appState.workspaceMode === "auto" && appState.auto.plan) {
    return appState.auto.plan;
  }

  return null;
}

function moveDrawerByGesture(direction) {
  const plan = getActivePlanForWorkspace();
  if (!plan) {
    return;
  }

  const modes = ["map", "split", "plan"];
  const currentIndex = modes.indexOf(plan.drawerMode);
  const nextIndex = Math.min(Math.max(currentIndex + direction, 0), modes.length - 1);

  if (nextIndex === currentIndex) {
    return;
  }

  plan.drawerMode = modes[nextIndex];
  rerenderWorkspace();
}

function clearAutoTimer() {
  if (appState.autoBuildTimer) {
    window.clearTimeout(appState.autoBuildTimer);
    appState.autoBuildTimer = null;
  }
}

function resetManualComposer() {
  const composer = appState.manual.composer;
  const category = composer.category;
  composer.target = composer.target || appState.manual.activeTab;
  composer.title = "";
  composer.note = "";
  composer.time = category === "custom" ? "Flexible" : "10:00";
  composer.savedPlaceId = savedPlaces[0].id;
  appState.manual.editingItemId = "";
}

function updateManualDaysFromDates() {
  const rebuilt = buildDays(
    safeDate(appState.manual.startDate, defaultStartDate),
    safeDate(appState.manual.endDate, defaultEndDate),
    appState.manual.days,
    appState.manual.ideas,
  );

  appState.manual.days = rebuilt.days;
  appState.manual.ideas = rebuilt.overflowItems;

  if (appState.manual.activeTab !== "ideas" && !appState.manual.days.some((day) => day.id === appState.manual.activeTab)) {
    appState.manual.activeTab = appState.manual.days[0]?.id ?? "ideas";
  }

  if (appState.manual.composer.target !== "ideas" && !appState.manual.days.some((day) => day.id === appState.manual.composer.target)) {
    appState.manual.composer.target = appState.manual.days[0]?.id ?? "ideas";
  }
}

function getCollectionByTarget(plan, target) {
  if (target === "ideas") {
    return plan.ideas;
  }

  const day = plan.days.find((entry) => entry.id === target);
  return day ? day.items : [];
}

function getActiveCollection(plan) {
  if (plan.activeTab === "summary") {
    return [];
  }

  return getCollectionByTarget(plan, plan.activeTab);
}

function getAllPlanItems(plan) {
  return plan.days.flatMap((day) => day.items).concat(plan.ideas);
}

function findItemInPlan(plan, itemId) {
  for (const day of plan.days) {
    const item = day.items.find((entry) => entry.id === itemId);
    if (item) {
      return { item, target: day.id };
    }
  }

  const idea = plan.ideas.find((entry) => entry.id === itemId);
  if (idea) {
    return { item: idea, target: "ideas" };
  }

  return null;
}

function removeItemFromPlan(plan, itemId) {
  for (const day of plan.days) {
    const itemIndex = day.items.findIndex((entry) => entry.id === itemId);
    if (itemIndex >= 0) {
      day.items.splice(itemIndex, 1);
      return;
    }
  }

  const ideaIndex = plan.ideas.findIndex((entry) => entry.id === itemId);
  if (ideaIndex >= 0) {
    plan.ideas.splice(ideaIndex, 1);
  }
}

function addItemToPlan(plan, target, item) {
  if (target === "ideas") {
    plan.ideas.unshift(item);
    return;
  }

  const day = plan.days.find((entry) => entry.id === target);
  if (!day) {
    return;
  }

  day.items.push(item);
  day.items.sort((left, right) => left.time.localeCompare(right.time));
}

function getComposerTitleLabel(category) {
  if (category === "transit") {
    return "TRANSFER TITLE";
  }

  if (category === "stay") {
    return "STAY NAME";
  }

  if (category === "saved") {
    return "SAVED PLACE";
  }

  return "ITEM TITLE";
}

function getComposerNoteLabel(category) {
  if (category === "transit") {
    return "ROUTE NOTE";
  }

  if (category === "stay") {
    return "STAY NOTE";
  }

  return "DETAILS";
}

function createManualItemFromComposer() {
  const composer = appState.manual.composer;
  const category = composer.category;

  if (category === "saved") {
    const savedPlace = savedPlaces.find((place) => place.id === composer.savedPlaceId) || savedPlaces[0];
    return createItem({
      category,
      title: savedPlace.name,
      note: composer.note || savedPlace.note,
      time: composer.time || "10:00",
      savedPlaceId: savedPlace.id,
    });
  }

  const baseMeta = categoryMeta[category];
  return createItem({
    category,
    title: composer.title || baseMeta.defaultTitle,
    note: composer.note || baseMeta.defaultNote,
    time: composer.time || "Flexible",
  });
}

function setManualEditingState(itemId) {
  const match = findItemInPlan(appState.manual, itemId);
  if (!match) {
    return;
  }

  appState.manual.editingItemId = match.item.id;
  appState.manual.selectedItemId = match.item.id;
  appState.manual.activeTab = match.target;
  appState.manual.composer.category = match.item.category;
  appState.manual.composer.target = match.target;
  appState.manual.composer.title = match.item.category === "saved" ? "" : match.item.title;
  appState.manual.composer.note = match.item.note;
  appState.manual.composer.time = match.item.time;
  appState.manual.composer.savedPlaceId = match.item.savedPlaceId || savedPlaces[0].id;
}

function buildMapPins(plan, readOnly) {
  const activeItems = plan.activeTab === "summary" ? getAllPlanItems(plan).slice(0, 6) : getActiveCollection(plan).slice(0, 6);

  if (!activeItems.length) {
    return `
      <div class="map-empty">
        <strong>Map preview is ready</strong>
        <p>Add a place, stay, transit leg, saved place, or custom note to start shaping the route.</p>
      </div>
    `;
  }

  return activeItems
    .map((item, index) => {
      const position = mapPositions[index % mapPositions.length];
      const categoryClass = categoryMeta[item.category]?.accent ?? "place";
      const selectedClass = plan.selectedItemId === item.id ? "selected" : "";
      return `
        <button
          class="map-pin ${categoryClass} ${selectedClass} ${readOnly ? "readonly" : ""}"
          style="left: ${position.x}%; top: ${position.y}%"
          type="button"
          data-select-item="${item.id}"
        >
          <span class="map-pin-badge">${index + 1}</span>
          <span class="map-pin-label">${escapeHtml(item.title)}</span>
        </button>
      `;
    })
    .join("");
}

function renderItemCard(item, editable) {
  const meta = categoryMeta[item.category];
  const selectedClass = appState.manual.selectedItemId === item.id ? "selected" : "";

  return `
    <article class="item-card ${meta.accent} ${selectedClass}">
      <div class="item-main">
        <div class="item-topline">
          <span class="ghost-chip ${meta.accent}">${meta.label}</span>
          <span class="item-time">${escapeHtml(item.time)}</span>
        </div>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.note)}</p>
      </div>
      ${
        editable
          ? `
            <div class="item-actions">
              <button class="mini-button" type="button" data-edit-item="${item.id}">Edit</button>
              <button class="mini-button danger" type="button" data-delete-item="${item.id}">Delete</button>
            </div>
          `
          : ""
      }
    </article>
  `;
}

function renderDrawerTabs(plan) {
  const summaryActive = plan.activeTab === "summary" ? "active" : "";
  const ideasActive = plan.activeTab === "ideas" ? "active" : "";
  const dayTabs = plan.days
    .map(
      (day) => `
        <button class="drawer-tab ${plan.activeTab === day.id ? "active" : ""}" type="button" data-plan-tab="${day.id}">
          ${escapeHtml(day.label)}
        </button>
      `,
    )
    .join("");

  return `
    <div class="drawer-tab-row">
      <button class="drawer-tab ${summaryActive}" type="button" data-plan-tab="summary">Summary</button>
      ${dayTabs}
      <button class="drawer-tab ${ideasActive}" type="button" data-plan-tab="ideas">Ideas</button>
    </div>
  `;
}

function renderSummaryView(plan, sourceLabel) {
  const allItems = getAllPlanItems(plan);
  const counts = ["place", "stay", "transit", "saved", "custom"]
    .map((key) => {
      const count = allItems.filter((item) => item.category === key).length;
      return `
        <article class="summary-card">
          <strong>${count}</strong>
          <span>${categoryMeta[key].label}</span>
        </article>
      `;
    })
    .join("");

  const upcoming = plan.days
    .flatMap((day) =>
      day.items.map((item) => ({
        label: day.label,
        item,
      })),
    )
    .slice(0, 4)
    .map(
      (entry) => `
        <article class="item-card ${categoryMeta[entry.item.category].accent}">
          <div class="item-main">
            <div class="item-topline">
              <span class="ghost-chip ${categoryMeta[entry.item.category].accent}">${escapeHtml(entry.label)}</span>
              <span class="item-time">${escapeHtml(entry.item.time)}</span>
            </div>
            <strong>${escapeHtml(entry.item.title)}</strong>
            <p>${escapeHtml(entry.item.note)}</p>
          </div>
        </article>
      `,
    )
    .join("");

  return `
    <div class="summary-grid">${counts}</div>
    <div class="drawer-section">
      <div class="drawer-section-head">
        <strong>${escapeHtml(sourceLabel)}</strong>
        <span class="small-copy">${allItems.length} itinerary moments prepared</span>
      </div>
      <div class="item-list">
        ${
          upcoming ||
          `
            <div class="empty-card">
              <strong>The itinerary is still light</strong>
              <p>Add your first stop and the summary view will fill out automatically.</p>
            </div>
          `
        }
      </div>
    </div>
  `;
}

function renderCollectionView(plan, editable) {
  const activeTab = plan.activeTab;
  const items = getActiveCollection(plan);
  const tabLabel =
    activeTab === "ideas"
      ? "Ideas list"
      : plan.days.find((day) => day.id === activeTab)?.label || "Selected day";

  return `
    <div class="drawer-section">
      <div class="drawer-section-head">
        <strong>${escapeHtml(tabLabel)}</strong>
        <span class="small-copy">${items.length ? `${items.length} item${items.length > 1 ? "s" : ""}` : "No items yet"}</span>
      </div>
      <div class="item-list">
        ${
          items.length
            ? items.map((item) => renderItemCard(item, editable)).join("")
            : `
              <div class="empty-card">
                <strong>This section is ready</strong>
                <p>Add a place, stay, transit leg, saved place, or a custom note to build this part of the itinerary.</p>
              </div>
            `
        }
      </div>
    </div>
  `;
}

function renderPlanStudio(plan, options) {
  const sourceLabel = options.sourceLabel;
  const readOnly = options.readOnly;
  const mapHeadline = plan.activeTab === "ideas" ? "Ideas on deck" : getShortDestination(plan.destination);
  const visibleItems = plan.activeTab === "summary" ? getAllPlanItems(plan).slice(0, 6) : getActiveCollection(plan).slice(0, 6);

  return `
    <section class="studio-canvas">
      <div class="studio-header">
        <div class="plan-title-block">
          <span class="section-kicker">${escapeHtml(sourceLabel)}</span>
          <h3>${escapeHtml(plan.tripName)}</h3>
          <p>${escapeHtml(plan.destination)} • ${escapeHtml(formatDate(plan.startDate))} - ${escapeHtml(formatDate(plan.endDate))}</p>
        </div>
        <div class="drawer-mode-group">
          <button class="drawer-mode ${plan.drawerMode === "map" ? "active" : ""}" type="button" data-drawer-mode="map">Map focus</button>
          <button class="drawer-mode ${plan.drawerMode === "split" ? "active" : ""}" type="button" data-drawer-mode="split">Split view</button>
          <button class="drawer-mode ${plan.drawerMode === "plan" ? "active" : ""}" type="button" data-drawer-mode="plan">Plan focus</button>
        </div>
      </div>

      <div class="map-stage mode-${plan.drawerMode}">
        <div class="map-surface">
          <div class="map-backdrop"></div>
          <div class="map-grid"></div>
          <div class="map-headline">
            <strong>${escapeHtml(mapHeadline)}</strong>
            <span>${visibleItems.length ? `${visibleItems.length} visible stop${visibleItems.length > 1 ? "s" : ""}` : "No visible stops yet"}</span>
          </div>
          <div class="map-route-legend">
            ${Object.keys(categoryMeta)
              .map(
                (key) => `
                  <span class="ghost-chip ${categoryMeta[key].accent}">${categoryMeta[key].label}</span>
                `,
              )
              .join("")}
          </div>
          ${buildMapPins(plan, readOnly)}
        </div>

        <section class="drawer-panel">
          <div class="drawer-handle"></div>
          ${renderDrawerTabs(plan)}
          <div class="drawer-body">
            ${plan.activeTab === "summary" ? renderSummaryView(plan, sourceLabel) : renderCollectionView(plan, !readOnly)}
          </div>
        </section>
      </div>
    </section>
  `;
}

function renderManualPlanner() {
  const manual = appState.manual;
  const editing = Boolean(manual.editingItemId);
  const targetOptions = manual.days
    .map(
      (day) => `
        <option value="${day.id}" ${manual.composer.target === day.id ? "selected" : ""}>${escapeHtml(day.label)}</option>
      `,
    )
    .join("");

  return `
    <div class="planner-shell">
      <aside class="studio-panel">
        <section class="studio-card">
          <h3>Trip setup</h3>
          <p class="meta-copy">Update the trip basics and the planner will rebuild day tabs automatically.</p>
          <form id="manual-trip-form">
            <div class="field">
              <label for="manual-trip-name">TRIP NAME</label>
              <input id="manual-trip-name" name="tripName" value="${escapeHtml(manual.tripName)}" required />
            </div>
            <div class="field">
              <label for="manual-destination">DESTINATION</label>
              <input id="manual-destination" name="destination" value="${escapeHtml(manual.destination)}" required />
            </div>
            <div class="field-grid">
              <div class="field">
                <label for="manual-start">START DATE</label>
                <input id="manual-start" name="startDate" type="date" min="${today}" value="${escapeHtml(manual.startDate)}" required />
              </div>
              <div class="field">
                <label for="manual-end">END DATE</label>
                <input id="manual-end" name="endDate" type="date" min="${today}" value="${escapeHtml(manual.endDate)}" required />
              </div>
            </div>
            <p class="error-text hidden" id="manual-trip-error"></p>
            <button class="primary" type="submit">Update trip structure</button>
          </form>
        </section>

        <section class="studio-card">
          <div class="section-row">
            <div>
              <h3>${editing ? "Edit itinerary item" : "Add itinerary item"}</h3>
              <p class="meta-copy">Every itinerary type now adds directly into the planner drawer and map preview.</p>
            </div>
            ${
              editing
                ? `<span class="status-badge pending">Editing live</span>`
                : `<span class="status-badge ready">Interactive</span>`
            }
          </div>
          <div class="category-switcher">
            ${Object.entries(categoryMeta)
              .map(
                ([key, meta]) => `
                  <button class="category-button ${manual.composer.category === key ? "active" : ""}" type="button" data-manual-category="${key}">
                    ${meta.label}
                  </button>
                `,
              )
              .join("")}
          </div>
          <form id="manual-item-form">
            <div class="field">
              <label for="manual-target">ADD TO</label>
              <select id="manual-target" name="target">
                ${targetOptions}
                <option value="ideas" ${manual.composer.target === "ideas" ? "selected" : ""}>Ideas</option>
              </select>
            </div>

            ${
              manual.composer.category === "saved"
                ? `
                  <div class="field">
                    <label for="manual-saved-place">${getComposerTitleLabel(manual.composer.category)}</label>
                    <select id="manual-saved-place" name="savedPlaceId">
                      ${savedPlaces
                        .map(
                          (place) => `
                            <option value="${place.id}" ${manual.composer.savedPlaceId === place.id ? "selected" : ""}>${escapeHtml(place.name)} • ${escapeHtml(place.type)}</option>
                          `,
                        )
                        .join("")}
                    </select>
                  </div>
                `
                : `
                  <div class="field">
                    <label for="manual-item-title">${getComposerTitleLabel(manual.composer.category)}</label>
                    <input id="manual-item-title" name="title" value="${escapeHtml(manual.composer.title)}" placeholder="${escapeHtml(categoryMeta[manual.composer.category].defaultTitle)}" />
                  </div>
                `
            }

            <div class="field-grid">
              <div class="field">
                <label for="manual-item-time">TIME</label>
                <input id="manual-item-time" name="time" value="${escapeHtml(manual.composer.time)}" />
              </div>
              <div class="field">
                <label for="manual-item-note">${getComposerNoteLabel(manual.composer.category)}</label>
                <input id="manual-item-note" name="note" value="${escapeHtml(manual.composer.note)}" placeholder="${escapeHtml(categoryMeta[manual.composer.category].defaultNote)}" />
              </div>
            </div>
            <p class="error-text hidden" id="manual-item-error"></p>
            <div class="actions-row">
              <button class="primary" type="submit">${editing ? "Save changes" : "Add to itinerary"}</button>
              ${
                editing
                  ? `<button class="secondary" type="button" data-cancel-manual-edit="true">Cancel edit</button>`
                  : ""
              }
            </div>
          </form>
        </section>

        <section class="studio-card">
          <h3>Quick add</h3>
          <p class="meta-copy">Use one-tap presets to populate realistic moments fast.</p>
          <div class="quick-add-grid">
            <button class="secondary" type="button" data-manual-template="stay">Hotel check-in</button>
            <button class="secondary" type="button" data-manual-template="transit">Airport transfer</button>
            <button class="secondary" type="button" data-manual-template="custom">Photo note</button>
            <button class="secondary" type="button" data-manual-template="saved">Saved favorite</button>
          </div>
        </section>
      </aside>

      ${renderPlanStudio(manual, { sourceLabel: "Manual itinerary studio", readOnly: false })}
    </div>
  `;
}

function renderAutoIdleState() {
  const auto = appState.auto;
  return `
    <div class="planner-shell">
      <aside class="studio-panel">
        <section class="studio-card">
          <h3>Auto-generate a trip draft</h3>
          <p class="meta-copy">This version is honest: it assembles a polished local draft from your inputs now, and can be replaced by a live AI API later.</p>
          <form id="auto-form">
            <div class="field">
              <label for="auto-destination">DESTINATION</label>
              <input id="auto-destination" name="destination" value="${escapeHtml(auto.destination)}" required />
            </div>
            <div class="field-grid">
              <div class="field">
                <label for="auto-start">START DATE</label>
                <input id="auto-start" name="startDate" type="date" min="${today}" value="${escapeHtml(auto.startDate)}" required />
              </div>
              <div class="field">
                <label for="auto-end">END DATE</label>
                <input id="auto-end" name="endDate" type="date" min="${today}" value="${escapeHtml(auto.endDate)}" required />
              </div>
            </div>
            <div class="field">
              <label for="auto-vibe">TRAVEL VIBE</label>
              <textarea id="auto-vibe" name="vibe" required>${escapeHtml(auto.vibe)}</textarea>
            </div>
            <div class="field">
              <label>FOCUS AREAS</label>
              <div class="category-switcher">
                ${["food", "culture", "relax", "stay"]
                  .map(
                    (focus) => `
                      <button class="category-button ${auto.focus.includes(focus) ? "active" : ""}" type="button" data-auto-focus="${focus}">
                        ${escapeHtml(focus)}
                      </button>
                    `,
                  )
                  .join("")}
              </div>
            </div>
            <p class="error-text hidden" id="auto-error"></p>
            <button class="primary" type="submit">Generate premium draft</button>
          </form>
        </section>

        <section class="studio-card">
          <h3>What it will build</h3>
          <div class="timeline">
            <article class="timeline-item">
              <span class="time">Draft logic</span>
              <h4>Real route structure</h4>
              <p>Days, tabs, map pins, transit blocks, stay moments, and saved suggestions will all be assembled into one editable view.</p>
            </article>
            <article class="timeline-item">
              <span class="time">Result quality</span>
              <h4>Polished but honest</h4>
              <p>The result is presented as an auto-generated draft, not a misleading fully AI-verified itinerary.</p>
            </article>
          </div>
        </section>
      </aside>

      <section class="studio-canvas">
        <div class="studio-header">
          <div class="plan-title-block">
            <span class="section-kicker">Auto-generated draft preview</span>
            <h3>Premium itinerary workspace</h3>
            <p>Map focus, sliding drawer, and believable result states are all ready in this flow.</p>
          </div>
        </div>
        <div class="loading-panel preview">
          <div class="globe-visual">
            <div class="orbital-ring ring-one"></div>
            <div class="orbital-ring ring-two"></div>
            <div class="globe-core"></div>
          </div>
          <div class="loading-copy">
            <strong>Ready to assemble the draft</strong>
            <p>Use your destination, dates, and focus areas to generate a structured itinerary that can be pushed into manual editing.</p>
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderAutoLoadingState() {
  const auto = appState.auto;
  return `
    <div class="planner-shell">
      <aside class="studio-panel">
        <section class="studio-card">
          <h3>Building your draft</h3>
          <p class="meta-copy">The itinerary is being assembled locally from the trip details you provided.</p>
          <div class="loading-copy">
            <strong>${escapeHtml(auto.progressLabel)}</strong>
            <p>${escapeHtml(auto.destination)} • ${escapeHtml(formatDate(auto.startDate))} - ${escapeHtml(formatDate(auto.endDate))}</p>
          </div>
          <div class="loading-steps">
            ${draftProgressSteps
              .map(
                (step, index) => `
                  <div class="loading-step ${index <= auto.progressStep ? "active" : ""}">
                    <span>${index + 1}</span>
                    <p>${escapeHtml(step)}</p>
                  </div>
                `,
              )
              .join("")}
          </div>
        </section>
      </aside>

      <section class="studio-canvas">
        <div class="loading-panel">
          <div class="globe-visual">
            <div class="orbital-ring ring-one"></div>
            <div class="orbital-ring ring-two"></div>
            <div class="globe-core"></div>
          </div>
          <div class="loading-copy">
            <strong>Preparing an editable premium itinerary</strong>
            <p>This is a real local draft build, not a fake placeholder spinner.</p>
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderAutoReadyState() {
  const auto = appState.auto;
  return `
    <div class="planner-shell">
      <aside class="studio-panel">
        <section class="studio-card">
          <div class="section-row">
            <div>
              <h3>Auto-generated draft ready</h3>
              <p class="meta-copy">The draft is structured and believable. Move it into manual planning when you want full editing control.</p>
            </div>
            <span class="status-badge ready">Ready</span>
          </div>
          <div class="actions-row">
            <button class="primary" type="button" data-adopt-auto-plan="true">Make this editable</button>
            <button class="secondary" type="button" data-regenerate-auto="true">Generate another draft</button>
          </div>
        </section>
      </aside>

      ${renderPlanStudio(auto.plan, { sourceLabel: "Auto-generated draft", readOnly: true })}
    </div>
  `;
}

function renderAutoPlanner() {
  if (appState.auto.status === "loading") {
    return renderAutoLoadingState();
  }

  if (appState.auto.status === "ready" && appState.auto.plan) {
    return renderAutoReadyState();
  }

  return renderAutoIdleState();
}

function openManualPlanner() {
  clearAutoTimer();
  appState.workspaceMode = "manual";
  showWorkspace(
    "Manual itinerary studio",
    "Build a premium itinerary with real add, edit, map, and drawer interactions.",
    renderManualPlanner(),
  );
}

function openAutoPlanner() {
  clearAutoTimer();
  appState.workspaceMode = "auto";
  showWorkspace(
    "Auto-generated itinerary draft",
    "Create an honest premium draft now, then swap in a live AI API later.",
    renderAutoPlanner(),
  );
}

function rerenderWorkspace() {
  if (appState.workspaceMode === "manual") {
    openManualPlanner();
    return;
  }

  if (appState.workspaceMode === "auto") {
    openAutoPlanner();
  }
}

function createDraftSkeleton(autoInput) {
  const startDate = autoInput.startDate;
  const endDate = autoInput.endDate;
  const tripName = `${getShortDestination(autoInput.destination)} Food & Culture Escape`;
  const days = buildDays(startDate, endDate, []).days;

  return {
    tripName,
    destination: autoInput.destination,
    startDate,
    endDate,
    drawerMode: "split",
    activeTab: "day-0",
    selectedItemId: "",
    days,
    ideas: [],
  };
}

function addDraftThemes(plan, autoInput) {
  plan.days.forEach((day, index) => {
    const focus = autoInput.focus[index % autoInput.focus.length];
    day.note = `${dayThemes[index % dayThemes.length]} • ${focus}`;
  });
  return plan;
}

function addDraftItems(plan, autoInput) {
  const destinationLabel = getShortDestination(autoInput.destination);

  plan.days.forEach((day, index) => {
    const focus = autoInput.focus[index % autoInput.focus.length];
    const savedPlace = savedPlaces[index % savedPlaces.length];

    day.items.push(
      createItem({
        category: "place",
        title: `${destinationLabel} ${focus} anchor`,
        note: `A main stop shaped around the traveler’s vibe: ${autoInput.vibe}`,
        time: "10:00",
      }),
    );
    day.items.push(
      createItem({
        category: "transit",
        title: "Neighborhood transfer",
        note: "A realistic movement block between the strongest nearby experiences.",
        time: "12:30",
      }),
    );

    if (index === plan.days.length - 1) {
      day.items.push(
        createItem({
          category: "stay",
          title: "Hotel wind-down",
          note: "A stay-focused evening block with time to settle in and review the day.",
          time: "6:30 PM",
        }),
      );
    } else {
      day.items.push(
        createItem({
          category: "saved",
          title: savedPlace.name,
          note: savedPlace.note,
          time: "3:00 PM",
          savedPlaceId: savedPlace.id,
        }),
      );
    }
  });

  plan.ideas = [
    createItem({
      category: "custom",
      title: "Swap in a dinner reservation",
      note: "This draft leaves one flexible evening slot for a confirmed booking later.",
      time: "Flexible",
    }),
    createItem({
      category: "saved",
      title: savedPlaces[2].name,
      note: savedPlaces[2].note,
      time: "Flexible",
      savedPlaceId: savedPlaces[2].id,
    }),
  ];

  return plan;
}

function finalizeDraftPlan(plan) {
  plan.selectedItemId = plan.days[0]?.items[0]?.id ?? "";
  return plan;
}

function runAutoDraftBuild(autoInput) {
  clearAutoTimer();

  const builders = [
    {
      label: draftProgressSteps[0],
      action: () => createDraftSkeleton(autoInput),
    },
    {
      label: draftProgressSteps[1],
      action: (plan) => addDraftThemes(plan, autoInput),
    },
    {
      label: draftProgressSteps[2],
      action: (plan) => addDraftItems(plan, autoInput),
    },
    {
      label: draftProgressSteps[3],
      action: (plan) => finalizeDraftPlan(plan),
    },
  ];

  let plan = null;

  const stepForward = (index) => {
    const builder = builders[index];
    appState.auto.progressStep = index;
    appState.auto.progressLabel = builder.label;
    plan = builder.action(plan);
    rerenderWorkspace();

    if (index === builders.length - 1) {
      appState.autoBuildTimer = window.setTimeout(() => {
        appState.auto.status = "ready";
        appState.auto.plan = plan;
        appState.autoBuildTimer = null;
        rerenderWorkspace();
      }, 220);
      return;
    }

    appState.autoBuildTimer = window.setTimeout(() => stepForward(index + 1), 260);
  };

  stepForward(0);
}

function adoptAutoPlanIntoManual() {
  if (!appState.auto.plan) {
    return;
  }

  const adoptedPlan = JSON.parse(JSON.stringify(appState.auto.plan));
  appState.manual.tripName = adoptedPlan.tripName;
  appState.manual.destination = adoptedPlan.destination;
  appState.manual.startDate = adoptedPlan.startDate;
  appState.manual.endDate = adoptedPlan.endDate;
  appState.manual.drawerMode = adoptedPlan.drawerMode;
  appState.manual.activeTab = adoptedPlan.activeTab;
  appState.manual.selectedItemId = adoptedPlan.selectedItemId;
  appState.manual.days = adoptedPlan.days;
  appState.manual.ideas = adoptedPlan.ideas;
  appState.manual.editingItemId = "";
  appState.manual.composer = {
    category: "place",
    target: adoptedPlan.days[0]?.id ?? "ideas",
    title: "",
    note: "",
    time: "10:00",
    savedPlaceId: savedPlaces[0].id,
  };
  openManualPlanner();
}

function syncAutoInputsFromForm() {
  if (appState.workspaceMode !== "auto") {
    return;
  }

  const destination = document.querySelector("#auto-destination");
  const startDate = document.querySelector("#auto-start");
  const endDate = document.querySelector("#auto-end");
  const vibe = document.querySelector("#auto-vibe");

  if (destination) {
    appState.auto.destination = destination.value.trim() || appState.auto.destination;
  }
  if (startDate) {
    appState.auto.startDate = startDate.value || appState.auto.startDate;
  }
  if (endDate) {
    appState.auto.endDate = endDate.value || appState.auto.endDate;
  }
  if (vibe) {
    appState.auto.vibe = vibe.value.trim() || appState.auto.vibe;
  }
}

function generateOrderNumber() {
  const datePart = today.replace(/-/g, "");
  const randomBuffer = new Uint32Array(1);

  if (window.crypto && typeof window.crypto.getRandomValues === "function") {
    window.crypto.getRandomValues(randomBuffer);
  } else {
    randomBuffer[0] = Math.floor(Math.random() * 0xffffffff);
  }

  const token = randomBuffer[0].toString(36).toUpperCase().slice(-6).padStart(6, "0");
  return `DMR-${datePart}-${token}`;
}

function getStatusTone(status) {
  return status === "success" ? "succeeded" : status;
}

function getSelectedProviderKey() {
  const selected = document.querySelector('input[name="paymentProvider"]:checked');
  return selected ? selected.value : "";
}

function getProviderReadiness(providerKey) {
  const provider = paymentConfig.providers[providerKey];
  return {
    providerConfigured: Boolean(provider && provider.enabled),
    checkoutApiConfigured: paymentConfig.checkoutApiConfigured,
    webhookEndpointConfigured: paymentConfig.webhookEndpointConfigured,
    webhookSignatureVerified: paymentConfig.webhookSignatureVerified,
    canCheckout:
      Boolean(provider && provider.enabled) &&
      paymentConfig.checkoutApiConfigured &&
      paymentConfig.webhookEndpointConfigured &&
      paymentConfig.webhookSignatureVerified,
  };
}

function getCheckoutMessage(providerKey) {
  const hasEnabledProvider = Object.values(paymentConfig.providers).some((provider) => provider.enabled);

  if (!providerKey) {
    return {
      tone: "locked",
      title: hasEnabledProvider ? "Checkout is not ready yet" : "No payment provider is live yet",
      body: hasEnabledProvider
        ? "Choose a payment provider to review its readiness requirements."
        : "Stripe and ABA are still intentionally locked until credentials, API routes, and verified webhooks are connected.",
    };
  }

  const provider = paymentConfig.providers[providerKey];
  const readiness = getProviderReadiness(providerKey);

  if (readiness.canCheckout) {
    return {
      tone: "ready",
      title: `${provider.label} is ready for checkout`,
      body: "The provider, checkout endpoint, and verified webhook flow are configured for handoff to the live API.",
    };
  }

  const blockers = [];

  if (!readiness.providerConfigured) {
    blockers.push(`${provider.label} credentials`);
  }
  if (!readiness.checkoutApiConfigured) {
    blockers.push("checkout API");
  }
  if (!readiness.webhookEndpointConfigured) {
    blockers.push("webhook endpoint");
  }
  if (!readiness.webhookSignatureVerified) {
    blockers.push("webhook signature verification");
  }

  return {
    tone: "locked",
    title: `${provider.label} checkout is locked`,
    body: `Connect ${blockers.join(", ")} before allowing payments to go live.`,
  };
}

function getPaymentFormSnapshot() {
  return {
    tripName: document.querySelector("#payment-trip-name")?.value.trim() || "Chengdu Food & Culture Escape",
    travelerName: document.querySelector("#payment-traveler")?.value.trim() || "Traveler name",
    email: document.querySelector("#payment-email")?.value.trim() || "traveler@example.com",
    amount: document.querySelector("#payment-amount")?.value || "480",
  };
}

function buildStatusBadge(label, tone) {
  return `<span class="status-badge ${tone}">${escapeHtml(label)}</span>`;
}

function buildHealthCards() {
  const cards = [
    {
      title: "Stripe",
      body: paymentConfig.providers.stripe.enabled
        ? "Stripe keys are present and the adapter can be connected to the checkout endpoint."
        : "Add Stripe keys and enable the provider before accepting card payments.",
      tone: paymentConfig.providers.stripe.enabled ? "ready" : "missing",
      label: paymentConfig.providers.stripe.enabled ? "Ready" : "Missing",
    },
    {
      title: "ABA PayWay",
      body: paymentConfig.providers.aba.enabled
        ? "ABA credentials are available for local checkout handoff."
        : "Add ABA merchant credentials before enabling local bank checkout.",
      tone: paymentConfig.providers.aba.enabled ? "ready" : "missing",
      label: paymentConfig.providers.aba.enabled ? "Ready" : "Missing",
    },
    {
      title: "Checkout API",
      body: paymentConfig.checkoutApiConfigured
        ? "The create-payment endpoint is configured and can hand off secure payment payloads."
        : "Connect the create-payment API route before letting customers continue to payment.",
      tone: paymentConfig.checkoutApiConfigured ? "ready" : "missing",
      label: paymentConfig.checkoutApiConfigured ? "Ready" : "Missing",
    },
    {
      title: "Webhook verification",
      body: paymentConfig.webhookEndpointConfigured && paymentConfig.webhookSignatureVerified
        ? "Webhook delivery and signature verification are ready to confirm payments safely."
        : "Add the webhook endpoint and signature verification before confirming bookings automatically.",
      tone: paymentConfig.webhookEndpointConfigured && paymentConfig.webhookSignatureVerified ? "ready" : "missing",
      label: paymentConfig.webhookEndpointConfigured && paymentConfig.webhookSignatureVerified ? "Ready" : "Missing",
    },
  ];

  return cards
    .map(
      (card) => `
        <article class="health-card">
          <div class="status-head">
            <strong>${card.title}</strong>
            ${buildStatusBadge(card.label, card.tone)}
          </div>
          <p>${card.body}</p>
        </article>
      `,
    )
    .join("");
}

function buildProviderOptions() {
  return Object.entries(paymentConfig.providers)
    .map(([key, provider]) => {
      const disabled = !provider.enabled;
      return `
        <label class="provider-option ${disabled ? "disabled" : ""}">
          <input type="radio" name="paymentProvider" value="${key}" ${disabled ? "disabled" : ""} />
          <span>
            <span class="provider-head">
              <strong>${provider.label}</strong>
              ${buildStatusBadge(disabled ? "Unavailable" : "Ready", disabled ? "missing" : "ready")}
            </span>
            <small>${provider.description}</small>
            <span class="provider-note">Endpoint: ${provider.endpoint}</span>
          </span>
        </label>
      `;
    })
    .join("");
}

function buildPaymentStateCards() {
  const cards = [
    {
      key: "success",
      title: "Success",
      body: "The payment clears, the webhook verifies, and the booking can move into fulfillment.",
    },
    {
      key: "failed",
      title: "Failed",
      body: "The payment is rejected and the user is guided to retry with a safe error state.",
    },
    {
      key: "pending",
      title: "Pending",
      body: "The booking is held while the provider is still waiting for confirmation or settlement.",
    },
    {
      key: "expired",
      title: "Expired",
      body: "The checkout window ends and the order is closed without confirming the booking.",
    },
  ];

  return cards
    .map(
      (card) => `
        <article class="status-card">
          <div class="status-head">
            <strong>${card.title}</strong>
            ${buildStatusBadge(card.title, getStatusTone(card.key))}
          </div>
          <p>${card.body}</p>
        </article>
      `,
    )
    .join("");
}

function buildWebhookSteps(providerKey, previewStatus) {
  const provider = paymentConfig.providers[providerKey] || paymentConfig.providers.stripe;
  const orderNumber = paymentState.orderNumber;

  const steps = [
    {
      title: "order.created",
      detail: `${orderNumber} is created locally with a unique order reference.`,
      badge: buildStatusBadge("Delivered", "delivered"),
    },
    {
      title: "payment.intent.created",
      detail: paymentConfig.checkoutApiConfigured
        ? `A secure payload is ready for ${provider.endpoint}.`
        : `Waiting for ${provider.endpoint} to be connected.`,
      badge: buildStatusBadge(paymentConfig.checkoutApiConfigured ? "Delivered" : "Missing", paymentConfig.checkoutApiConfigured ? "delivered" : "missing"),
    },
    {
      title: provider.webhookEvent,
      detail: `Previewing the ${previewStatus} outcome for ${provider.label}.`,
      badge: buildStatusBadge(previewStatus, getStatusTone(previewStatus)),
    },
    {
      title: "webhook.delivery",
      detail:
        paymentConfig.webhookEndpointConfigured && paymentConfig.webhookSignatureVerified
          ? "Webhook delivery and signature verification can complete safely."
          : "Webhook verification is blocked until the endpoint and signature checks are configured.",
      badge: buildStatusBadge(
        paymentConfig.webhookEndpointConfigured && paymentConfig.webhookSignatureVerified ? "Delivered" : "Missing",
        paymentConfig.webhookEndpointConfigured && paymentConfig.webhookSignatureVerified ? "delivered" : "missing",
      ),
    },
    {
      title: "booking.fulfillment",
      detail:
        previewStatus === "success" && paymentConfig.webhookEndpointConfigured && paymentConfig.webhookSignatureVerified
          ? "Booking can move to confirmed fulfillment."
          : previewStatus === "pending"
            ? "Booking stays on hold until payment confirmation arrives."
            : previewStatus === "failed"
              ? "Booking remains unpaid and should prompt the user to retry."
              : "Booking expires cleanly without confirming inventory.",
      badge: buildStatusBadge(
        previewStatus === "success" && paymentConfig.webhookEndpointConfigured && paymentConfig.webhookSignatureVerified
          ? "Delivered"
          : previewStatus === "pending"
            ? "Queued"
            : previewStatus === "failed"
              ? "Failed"
              : "Expired",
        previewStatus === "success" && paymentConfig.webhookEndpointConfigured && paymentConfig.webhookSignatureVerified
          ? "delivered"
          : previewStatus === "pending"
            ? "queued"
            : previewStatus,
      ),
    },
  ];

  return steps
    .map(
      (step) => `
        <div class="webhook-step">
          <div>
            <strong>${step.title}</strong>
            <p class="small-copy">${step.detail}</p>
          </div>
          ${step.badge}
        </div>
      `,
    )
    .join("");
}

function buildPaymentTemplate() {
  return `
    <div class="payment-shell">
      <div class="payment-stack">
        <section class="status-banner locked" id="checkout-banner"></section>
        <form class="panel payment-form" id="payment-form">
          <h3>Secure booking checkout</h3>
          <p class="meta-copy">This layer is ready for Stripe and ABA API handoff, but checkout remains blocked until those services are truly configured.</p>
          <div class="field">
            <label for="payment-trip-name">TRIP OR PACKAGE</label>
            <input id="payment-trip-name" name="tripName" value="Chengdu Food & Culture Escape" required />
          </div>
          <div class="field">
            <label for="payment-traveler">LEAD TRAVELER</label>
            <input id="payment-traveler" name="travelerName" placeholder="Full name" required />
          </div>
          <div class="field">
            <label for="payment-email">EMAIL</label>
            <input id="payment-email" name="email" type="email" placeholder="traveler@example.com" required />
          </div>
          <div class="field">
            <label for="payment-amount">AMOUNT</label>
            <input id="payment-amount" name="amount" type="number" min="1" step="1" value="480" required />
            <span class="field-hint">Shown as a checkout-ready amount so the API can attach taxes, fees, or deposits later.</span>
          </div>
          <div class="field">
            <label>PAYMENT PROVIDER</label>
            <div class="provider-list">${buildProviderOptions()}</div>
          </div>
          <p class="error-text hidden" id="payment-error"></p>
          <div class="actions-row">
            <button class="primary" id="checkout-button" type="submit">Continue to payment</button>
            <button class="secondary" id="refresh-order" type="button">Generate new order number</button>
          </div>
        </form>
        <section class="panel">
          <h3>Payment state preview</h3>
          <p class="meta-copy">Review pending, success, failed, and expired states now, then wire the live API into the same flow later.</p>
          <div class="actions-row">
            <button class="secondary active" type="button" data-payment-state="pending">Pending</button>
            <button class="secondary" type="button" data-payment-state="success">Success</button>
            <button class="secondary" type="button" data-payment-state="failed">Failed</button>
            <button class="secondary" type="button" data-payment-state="expired">Expired</button>
          </div>
          <div class="status-grid">${buildPaymentStateCards()}</div>
        </section>
      </div>

      <div class="payment-stack">
        <section class="checkout-summary" id="checkout-summary"></section>
        <section class="panel">
          <h3>Service health</h3>
          <div class="health-grid" id="payment-health-grid"></div>
        </section>
        <section class="panel webhook-card">
          <div class="webhook-row">
            <strong>Webhook flow</strong>
            <span class="small-copy">Preview of payment confirmation events</span>
          </div>
          <div class="webhook-timeline" id="webhook-timeline"></div>
        </section>
      </div>
    </div>
  `;
}

function syncPaymentUI() {
  const selectedProviderKey = getSelectedProviderKey();
  const providerKey = selectedProviderKey || "stripe";
  const provider = paymentConfig.providers[providerKey];
  const readiness = getProviderReadiness(providerKey);
  const checkoutMessage = getCheckoutMessage(selectedProviderKey);
  const snapshot = getPaymentFormSnapshot();
  const checkoutButton = document.querySelector("#checkout-button");
  const banner = document.querySelector("#checkout-banner");
  const summary = document.querySelector("#checkout-summary");
  const healthGrid = document.querySelector("#payment-health-grid");
  const webhookTimeline = document.querySelector("#webhook-timeline");
  const providerLabel = selectedProviderKey ? provider.label : "No live provider";

  banner.className = `status-banner ${checkoutMessage.tone}`;
  banner.innerHTML = `<strong>${checkoutMessage.title}</strong><p>${checkoutMessage.body}</p>`;

  checkoutButton.disabled = !selectedProviderKey || !readiness.canCheckout;
  checkoutButton.textContent = readiness.canCheckout ? "Continue to payment" : "Checkout unavailable";

  summary.innerHTML = `
    <div class="summary-head">
      <strong>Checkout summary</strong>
      ${buildStatusBadge(paymentState.previewStatus, getStatusTone(paymentState.previewStatus))}
    </div>
    <div>
      <div class="small-copy">Order number</div>
      <div class="summary-value">${escapeHtml(paymentState.orderNumber)}</div>
    </div>
    <div class="inline-list">
      <span class="tag">${escapeHtml(snapshot.tripName)}</span>
      <span class="tag">${escapeHtml(paymentConfig.currency)} ${escapeHtml(snapshot.amount)}</span>
      <span class="tag">${escapeHtml(providerLabel)}</span>
    </div>
    <p>${escapeHtml(paymentState.lastCheckoutMessage)}</p>
  `;

  healthGrid.innerHTML = buildHealthCards();
  webhookTimeline.innerHTML = buildWebhookSteps(providerKey, paymentState.previewStatus);

  document.querySelectorAll("[data-payment-state]").forEach((button) => {
    button.classList.toggle("active", button.dataset.paymentState === paymentState.previewStatus);
  });
}

function createCheckoutPayload(formValues, providerKey) {
  const provider = paymentConfig.providers[providerKey];
  return {
    orderNumber: paymentState.orderNumber,
    tripName: formValues.tripName,
    travelerName: formValues.travelerName,
    email: formValues.email,
    amount: Number(formValues.amount),
    currency: paymentConfig.currency,
    provider: providerKey,
    providerLabel: provider.label,
    providerEndpoint: provider.endpoint,
    expiresAt: `${today} + ${paymentConfig.checkoutTimeoutMinutes} minutes`,
    status: "pending",
  };
}

function renderPaymentApp() {
  paymentState.orderNumber = generateOrderNumber();
  paymentRoot.innerHTML = buildPaymentTemplate();
  syncPaymentUI();
}

document.querySelectorAll("[data-path]").forEach((element) => {
  element.addEventListener("click", () => {
    if (element.dataset.path === "manual") {
      openManualPlanner();
      return;
    }

    openAutoPlanner();
  });
});

resetWorkspaceButton.addEventListener("click", () => {
  clearAutoTimer();
  appState.workspaceMode = "";
  workspace.classList.add("hidden");
  workspaceContent.innerHTML = "";
});

document.addEventListener("pointerdown", (event) => {
  if (!event.isPrimary || !["touch", "pen"].includes(event.pointerType)) {
    return;
  }

  const handle = event.target.closest(".drawer-handle");
  if (!handle || !getActivePlanForWorkspace()) {
    return;
  }

  drawerGesture.active = true;
  drawerGesture.startY = event.clientY;
  drawerGesture.pointerId = event.pointerId;
  handle.setPointerCapture?.(event.pointerId);
});

document.addEventListener("pointerup", (event) => {
  if (!drawerGesture.active || event.pointerId !== drawerGesture.pointerId) {
    return;
  }

  const distance = event.clientY - drawerGesture.startY;
  drawerGesture.active = false;
  drawerGesture.pointerId = null;

  if (Math.abs(distance) < 44) {
    return;
  }

  moveDrawerByGesture(distance < 0 ? 1 : -1);
});

document.addEventListener("pointercancel", () => {
  drawerGesture.active = false;
  drawerGesture.pointerId = null;
});

document.addEventListener("click", (event) => {
  const manualCategoryButton = event.target.closest("[data-manual-category]");
  if (manualCategoryButton) {
    appState.manual.composer.category = manualCategoryButton.dataset.manualCategory;
    resetManualComposer();
    rerenderWorkspace();
    return;
  }

  const drawerModeButton = event.target.closest("[data-drawer-mode]");
  if (drawerModeButton) {
    const mode = drawerModeButton.dataset.drawerMode;
    if (appState.workspaceMode === "manual") {
      appState.manual.drawerMode = mode;
    }
    if (appState.workspaceMode === "auto" && appState.auto.plan) {
      appState.auto.plan.drawerMode = mode;
    }
    rerenderWorkspace();
    return;
  }

  const planTabButton = event.target.closest("[data-plan-tab]");
  if (planTabButton) {
    const tab = planTabButton.dataset.planTab;
    if (appState.workspaceMode === "manual") {
      appState.manual.activeTab = tab;
    }
    if (appState.workspaceMode === "auto" && appState.auto.plan) {
      appState.auto.plan.activeTab = tab;
    }
    rerenderWorkspace();
    return;
  }

  const selectItemButton = event.target.closest("[data-select-item]");
  if (selectItemButton) {
    const itemId = selectItemButton.dataset.selectItem;
    if (appState.workspaceMode === "manual") {
      appState.manual.selectedItemId = itemId;
    }
    if (appState.workspaceMode === "auto" && appState.auto.plan) {
      appState.auto.plan.selectedItemId = itemId;
    }
    rerenderWorkspace();
    return;
  }

  const editItemButton = event.target.closest("[data-edit-item]");
  if (editItemButton) {
    setManualEditingState(editItemButton.dataset.editItem);
    rerenderWorkspace();
    return;
  }

  const deleteItemButton = event.target.closest("[data-delete-item]");
  if (deleteItemButton) {
    removeItemFromPlan(appState.manual, deleteItemButton.dataset.deleteItem);
    appState.manual.selectedItemId = "";
    appState.manual.editingItemId = "";
    resetManualComposer();
    rerenderWorkspace();
    return;
  }

  const cancelEditButton = event.target.closest("[data-cancel-manual-edit]");
  if (cancelEditButton) {
    resetManualComposer();
    rerenderWorkspace();
    return;
  }

  const templateButton = event.target.closest("[data-manual-template]");
  if (templateButton) {
    const template = templateButton.dataset.manualTemplate;
    appState.manual.composer.category = template;
    appState.manual.composer.target = appState.manual.activeTab === "summary" ? appState.manual.days[0]?.id ?? "ideas" : appState.manual.activeTab;
    appState.manual.composer.time = template === "stay" ? "4:00 PM" : template === "transit" ? "12:30 PM" : template === "custom" ? "6:15 PM" : "10:00 AM";
    appState.manual.composer.savedPlaceId = savedPlaces[1].id;
    appState.manual.composer.title =
      template === "stay" ? "Hotel check-in" : template === "transit" ? "Airport transfer" : template === "custom" ? "Golden hour reminder" : "";
    appState.manual.composer.note =
      template === "stay"
        ? "A calm stay block with time to settle in before the evening."
        : template === "transit"
          ? "A direct transfer segment between the arrival point and the next neighborhood."
          : template === "custom"
            ? "Capture the evening light before dinner."
            : "";
    rerenderWorkspace();
    return;
  }

  const autoFocusButton = event.target.closest("[data-auto-focus]");
  if (autoFocusButton) {
    syncAutoInputsFromForm();
    const focus = autoFocusButton.dataset.autoFocus;
    if (appState.auto.focus.includes(focus)) {
      appState.auto.focus = appState.auto.focus.filter((entry) => entry !== focus);
    } else {
      appState.auto.focus.push(focus);
    }
    rerenderWorkspace();
    return;
  }

  const adoptButton = event.target.closest("[data-adopt-auto-plan]");
  if (adoptButton) {
    adoptAutoPlanIntoManual();
    return;
  }

  const regenerateButton = event.target.closest("[data-regenerate-auto]");
  if (regenerateButton) {
    appState.auto.status = "idle";
    appState.auto.plan = null;
    clearAutoTimer();
    rerenderWorkspace();
    return;
  }

  if (event.target.id === "refresh-order") {
    paymentState.orderNumber = generateOrderNumber();
    paymentState.lastCheckoutMessage = "A fresh secure order number has been generated for the next checkout attempt.";
    syncPaymentUI();
    return;
  }

  const paymentStateButton = event.target.closest("[data-payment-state]");
  if (paymentStateButton) {
    paymentState.previewStatus = paymentStateButton.dataset.paymentState;
    paymentState.lastCheckoutMessage = `Previewing the ${paymentState.previewStatus} payment state for the current order flow.`;
    syncPaymentUI();
  }
});

document.addEventListener("change", (event) => {
  if (event.target.name === "paymentProvider") {
    paymentState.lastCheckoutMessage = `Reviewing ${paymentConfig.providers[event.target.value].label} readiness for this order.`;
    syncPaymentUI();
  }
});

document.addEventListener("input", (event) => {
  if (event.target.closest("#payment-form")) {
    syncPaymentUI();
    return;
  }

  if (event.target.id === "manual-target") {
    appState.manual.composer.target = event.target.value;
  }

  if (event.target.id === "manual-saved-place") {
    appState.manual.composer.savedPlaceId = event.target.value;
  }
});

document.addEventListener("submit", (event) => {
  if (event.target.id === "manual-trip-form") {
    event.preventDefault();
    const form = new FormData(event.target);
    const tripName = String(form.get("tripName") || "").trim();
    const destination = String(form.get("destination") || "").trim();
    const startDate = String(form.get("startDate") || "");
    const endDate = String(form.get("endDate") || "");
    const error = document.querySelector("#manual-trip-error");

    if (!tripName || !destination || !startDate || !endDate) {
      error.textContent = "Add the trip name, destination, and valid dates before rebuilding the itinerary.";
      error.classList.remove("hidden");
      return;
    }

    if (new Date(`${endDate}T12:00:00`) < new Date(`${startDate}T12:00:00`)) {
      error.textContent = "End date must be the same as or after the start date.";
      error.classList.remove("hidden");
      return;
    }

    error.classList.add("hidden");
    appState.manual.tripName = tripName;
    appState.manual.destination = destination;
    appState.manual.startDate = startDate;
    appState.manual.endDate = endDate;
    updateManualDaysFromDates();
    rerenderWorkspace();
    return;
  }

  if (event.target.id === "manual-item-form") {
    event.preventDefault();
    const form = new FormData(event.target);
    const target = String(form.get("target") || appState.manual.composer.target || "ideas");
    const title = String(form.get("title") || "").trim();
    const note = String(form.get("note") || "").trim();
    const time = String(form.get("time") || "").trim();
    const savedPlaceId = String(form.get("savedPlaceId") || appState.manual.composer.savedPlaceId || savedPlaces[0].id);
    const error = document.querySelector("#manual-item-error");

    appState.manual.composer.target = target;
    appState.manual.composer.title = title;
    appState.manual.composer.note = note;
    appState.manual.composer.time = time;
    appState.manual.composer.savedPlaceId = savedPlaceId;

    if (appState.manual.composer.category !== "saved" && !title && !note) {
      error.textContent = "Add a title or note so the itinerary item feels complete.";
      error.classList.remove("hidden");
      return;
    }

    error.classList.add("hidden");

    if (appState.manual.editingItemId) {
      removeItemFromPlan(appState.manual, appState.manual.editingItemId);
    }

    const nextItem = createManualItemFromComposer();
    addItemToPlan(appState.manual, target, nextItem);
    appState.manual.activeTab = target;
    appState.manual.selectedItemId = nextItem.id;
    resetManualComposer();
    rerenderWorkspace();
    return;
  }

  if (event.target.id === "auto-form") {
    event.preventDefault();
    const form = new FormData(event.target);
    const destination = String(form.get("destination") || "").trim();
    const startDate = String(form.get("startDate") || "");
    const endDate = String(form.get("endDate") || "");
    const vibe = String(form.get("vibe") || "").trim();
    const error = document.querySelector("#auto-error");

    if (!destination || !startDate || !endDate || !vibe) {
      error.textContent = "Add destination, travel dates, and the trip vibe before generating the draft.";
      error.classList.remove("hidden");
      return;
    }

    if (new Date(`${endDate}T12:00:00`) < new Date(`${startDate}T12:00:00`)) {
      error.textContent = "End date must be the same as or after the start date.";
      error.classList.remove("hidden");
      return;
    }

    if (!appState.auto.focus.length) {
      error.textContent = "Choose at least one focus area for the draft.";
      error.classList.remove("hidden");
      return;
    }

    error.classList.add("hidden");
    appState.auto.destination = destination;
    appState.auto.startDate = startDate;
    appState.auto.endDate = endDate;
    appState.auto.vibe = vibe;
    appState.auto.status = "loading";
    appState.auto.progressStep = 0;
    appState.auto.progressLabel = draftProgressSteps[0];
    appState.auto.plan = null;
    rerenderWorkspace();
    runAutoDraftBuild({
      destination,
      startDate,
      endDate,
      vibe,
      focus: [...appState.auto.focus],
    });
    return;
  }

  if (event.target.id === "payment-form") {
    event.preventDefault();
    const providerKey = getSelectedProviderKey();
    const error = document.querySelector("#payment-error");
    const formValues = getPaymentFormSnapshot();

    if (!formValues.tripName || !formValues.travelerName || !formValues.email || !formValues.amount) {
      error.textContent = "Add the booking name, traveler, email, amount, and provider before continuing.";
      error.classList.remove("hidden");
      return;
    }

    if (!providerKey) {
      error.textContent = "Choose an available payment provider before continuing.";
      error.classList.remove("hidden");
      return;
    }

    const readiness = getProviderReadiness(providerKey);

    if (!readiness.canCheckout) {
      error.textContent = "Checkout is disabled because the provider, payment API, or verified webhook flow is still not fully configured.";
      error.classList.remove("hidden");
      paymentState.lastCheckoutMessage = "Checkout stayed locked because readiness checks failed.";
      syncPaymentUI();
      return;
    }

    error.classList.add("hidden");
    const payload = createCheckoutPayload(formValues, providerKey);
    paymentState.previewStatus = "pending";
    paymentState.lastCheckoutMessage = `Checkout payload prepared for ${payload.providerLabel}. Connect ${payload.providerEndpoint} to create the live payment session next.`;
    syncPaymentUI();
  }
});

renderPaymentApp();
