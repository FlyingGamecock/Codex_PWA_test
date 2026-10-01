const storageKey = "launchpad-ideas-v1";
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

function loadIdeas() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    return Array.isArray(saved) ? saved : seedIdeas();
  } catch {
    return seedIdeas();
  }
}

function seedIdeas() {
  return [
    { id: crypto.randomUUID(), text: "Offline personal budget notebook", done: false },
    { id: crypto.randomUUID(), text: "Neighborhood pickup basketball finder", done: true },
    { id: crypto.randomUUID(), text: "Recipe planner for pantry leftovers", done: false }
  ];
}

function saveIdeas() {
  localStorage.setItem(storageKey, JSON.stringify(ideas));
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

function updateNetworkStatus() {
  offlineStatus.textContent = navigator.onLine ? "Online" : "Offline";
}

ideaForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = ideaInput.value.trim();
  if (!text) return;

  ideas.unshift({ id: crypto.randomUUID(), text, done: false });
  saveIdeas();
  render();
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
  saveIdeas();
  render();
});

ideaList.addEventListener("click", (event) => {
  const button = event.target;
  if (!(button instanceof HTMLButtonElement) || !button.classList.contains("delete-button")) return;

  const item = button.closest(".idea-item");
  ideas = ideas.filter((idea) => idea.id !== item?.dataset.id);
  saveIdeas();
  render();
});

clearDone.addEventListener("click", () => {
  ideas = ideas.filter((idea) => !idea.done);
  saveIdeas();
  render();
});

window.addEventListener("online", updateNetworkStatus);
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

updateNetworkStatus();
render();
