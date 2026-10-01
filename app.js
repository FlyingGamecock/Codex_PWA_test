const storageKey = "launchpad-ideas-v1";
const pendingDeletesKey = "launchpad-pending-deletes-v1";
const supabaseUrl = "https://ovqksdgfmyxwpjwrhbcr.supabase.co";
const supabaseKey = "sb_publishable_fpMh8zZ--K3G215ykdzTbA_qZoge-SS";
const ideasEndpoint = `${supabaseUrl}/rest/v1/ideas`;
const ideaForm = document.querySelector("#ideaForm");
const ideaInput = document.querySelector("#ideaInput");
const ideaList = document.querySelector("#ideaList");
const emptyState = document.querySelector("#emptyState");
const totalCount = document.querySelector("#totalCount");
const readyCount = document.querySelector("#readyCount");
const offlineStatus = document.querySelector("#offlineStatus");
const clearDone = document.querySelector("#clearDone");
const installButton = document.querySelector("#installButton");

let deferredInstallPrompt = null;
let ideas = loadIdeas();
let pendingDeletes = loadPendingDeletes();
let isSyncing = false;

function loadIdeas() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    return Array.isArray(saved) ? saved.map(normalizeIdea) : [];
  } catch {
    return [];
  }
}

function saveIdeas() {
  localStorage.setItem(storageKey, JSON.stringify(ideas));
}

function loadPendingDeletes() {
  try {
    const saved = JSON.parse(localStorage.getItem(pendingDeletesKey));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function savePendingDeletes() {
  localStorage.setItem(pendingDeletesKey, JSON.stringify(pendingDeletes));
}

function getHeaders({ write = false } = {}) {
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`
  };

  if (!write) return headers;

  return {
    ...headers,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=representation"
  };
}

function normalizeIdea(row) {
  return {
    id: row.id,
    text: row.text,
    done: Boolean(row.done),
    updated_at: row.updated_at || new Date().toISOString(),
    pending: Boolean(row.pending)
  };
}

function sortIdeas(entries) {
  return entries.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
}

async function loadCloudIdeas() {
  if (!navigator.onLine || isSyncing) return;
  isSyncing = true;
  updateNetworkStatus("Syncing");

  try {
    await flushPendingChanges();

    const response = await fetch(`${ideasEndpoint}?select=*&order=updated_at.desc`, {
      cache: "no-store",
      headers: getHeaders()
    });

    if (!response.ok) throw new Error(`Load failed: ${response.status}`);

    const cloudIdeas = (await response.json()).map(normalizeIdea);
    const pendingIdeas = ideas.filter((idea) => idea.pending);
    const merged = new Map(cloudIdeas.map((idea) => [idea.id, idea]));
    pendingIdeas.forEach((idea) => merged.set(idea.id, idea));

    ideas = sortIdeas([...merged.values()]);
    saveIdeas();
    render();
    updateNetworkStatus("Synced");
  } catch (error) {
    console.warn(error);
    updateNetworkStatus("Local");
  } finally {
    isSyncing = false;
  }
}

async function flushPendingChanges() {
  const pendingIdeas = ideas.filter((idea) => idea.pending);

  for (const idea of pendingIdeas) {
    await syncIdea(idea);
  }

  for (const id of [...pendingDeletes]) {
    await deleteCloudIdea(id);
  }
}

async function upsertCloudIdea(idea) {
  return fetch(`${ideasEndpoint}?on_conflict=id`, {
    method: "POST",
    headers: getHeaders({ write: true }),
    body: JSON.stringify({
      id: idea.id,
      text: idea.text,
      done: idea.done,
      updated_at: idea.updated_at
    })
  });
}

async function syncIdea(idea) {
  if (!navigator.onLine) {
    idea.pending = true;
    saveIdeas();
    updateNetworkStatus("Local");
    return;
  }

  try {
    const response = await upsertCloudIdea(idea);

    if (!response.ok) throw new Error(`Save failed: ${response.status}`);
    idea.pending = false;
    saveIdeas();
    updateNetworkStatus("Synced");
  } catch (error) {
    console.warn(error);
    idea.pending = true;
    saveIdeas();
    updateNetworkStatus("Local");
  }
}

async function deleteCloudIdea(id) {
  if (!navigator.onLine) {
    if (!pendingDeletes.includes(id)) pendingDeletes.push(id);
    savePendingDeletes();
    updateNetworkStatus("Local");
    return;
  }

  try {
    const response = await fetch(`${ideasEndpoint}?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: getHeaders({ write: true })
    });

    if (!response.ok) throw new Error(`Delete failed: ${response.status}`);
    pendingDeletes = pendingDeletes.filter((entry) => entry !== id);
    savePendingDeletes();
    updateNetworkStatus("Synced");
  } catch (error) {
    console.warn(error);
    if (!pendingDeletes.includes(id)) pendingDeletes.push(id);
    savePendingDeletes();
    updateNetworkStatus("Local");
  }
}

function render() {
  ideaList.innerHTML = "";
  totalCount.textContent = ideas.length;
  readyCount.textContent = ideas.filter((idea) => idea.done).length;
  emptyState.hidden = ideas.length > 0;

  for (const idea of ideas) {
    const item = document.createElement("li");
    item.className = `idea-item${idea.done ? " done" : ""}`;
    item.dataset.id = idea.id;

    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = idea.done;
    checkbox.setAttribute("aria-label", `Mark ${idea.text} as ready`);

    const text = document.createElement("span");
    text.textContent = idea.text;

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.type = "button";
    deleteButton.textContent = "X";
    deleteButton.setAttribute("aria-label", `Delete ${idea.text}`);

    label.append(checkbox, text);
    item.append(label, deleteButton);
    ideaList.append(item);
  }
}

function updateNetworkStatus(status) {
  offlineStatus.textContent = status || (navigator.onLine ? "Online" : "Offline");
}

ideaForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = ideaInput.value.trim();
  if (!text) return;

  const idea = { id: crypto.randomUUID(), text, done: false, updated_at: new Date().toISOString(), pending: true };
  ideas.unshift(idea);
  saveIdeas();
  render();
  syncIdea(idea);
  ideaInput.value = "";
  ideaInput.focus();
});

ideaList.addEventListener("change", (event) => {
  const checkbox = event.target;
  if (!(checkbox instanceof HTMLInputElement)) return;

  const item = checkbox.closest(".idea-item");
  const idea = ideas.find((entry) => entry.id === item?.dataset.id);
  if (!idea) return;

  idea.done = checkbox.checked;
  idea.updated_at = new Date().toISOString();
  saveIdeas();
  render();
  syncIdea(idea);
});

ideaList.addEventListener("click", (event) => {
  const button = event.target;
  if (!(button instanceof HTMLButtonElement) || !button.classList.contains("delete-button")) return;

  const item = button.closest(".idea-item");
  const id = item?.dataset.id;
  ideas = ideas.filter((idea) => idea.id !== item?.dataset.id);
  saveIdeas();
  render();
  if (id) deleteCloudIdea(id);
});

clearDone.addEventListener("click", () => {
  const deletedIds = ideas.filter((idea) => idea.done).map((idea) => idea.id);
  ideas = ideas.filter((idea) => !idea.done);
  saveIdeas();
  render();
  deletedIds.forEach((id) => deleteCloudIdea(id));
});

window.addEventListener("online", () => {
  updateNetworkStatus();
  loadCloudIdeas();
});
window.addEventListener("offline", updateNetworkStatus);

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js");
  });
}

updateNetworkStatus(navigator.onLine ? "Loading" : "Offline");
render();
loadCloudIdeas();
