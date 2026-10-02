import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const baseStorageKey = "launchpad-ideas-v2";
const basePendingDeletesKey = "launchpad-pending-deletes-v2";
const supabaseUrl = "https://ovqksdgfmyxwpjwrhbcr.supabase.co";
const supabaseKey = "sb_publishable_fpMh8zZ--K3G215ykdzTbA_qZoge-SS";
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

const ideaForm = document.querySelector("#ideaForm");
const ideaInput = document.querySelector("#ideaInput");
const categoryInput = document.querySelector("#categoryInput");
const dueDateInput = document.querySelector("#dueDateInput");
const notesInput = document.querySelector("#notesInput");
const ideaList = document.querySelector("#ideaList");
const emptyState = document.querySelector("#emptyState");
const totalCount = document.querySelector("#totalCount");
const readyCount = document.querySelector("#readyCount");
const offlineStatus = document.querySelector("#offlineStatus");
const clearDone = document.querySelector("#clearDone");
const installButton = document.querySelector("#installButton");
const authForm = document.querySelector("#authForm");
const emailInput = document.querySelector("#emailInput");
const passwordInput = document.querySelector("#passwordInput");
const signInButton = document.querySelector("#signInButton");
const signUpButton = document.querySelector("#signUpButton");
const googleSignInButton = document.querySelector("#googleSignInButton");
const signOutButton = document.querySelector("#signOutButton");
const profilePanel = document.querySelector("#profilePanel");
const userEmail = document.querySelector("#userEmail");
const authMessage = document.querySelector("#authMessage");

let deferredInstallPrompt = null;
let session = null;
let user = null;
let ideas = [];
let pendingDeletes = [];
let isSyncing = false;

function userStorageKey() {
  return `${baseStorageKey}-${user.id}`;
}

function userPendingDeletesKey() {
  return `${basePendingDeletesKey}-${user.id}`;
}

function normalizeIdea(row) {
  return {
    id: row.id,
    user_id: row.user_id || user?.id,
    text: row.text,
    notes: row.notes || "",
    category: row.category || "General",
    due_date: row.due_date || "",
    done: Boolean(row.done),
    updated_at: row.updated_at || new Date().toISOString(),
    pending: Boolean(row.pending)
  };
}

function loadIdeas() {
  if (!user) return [];

  try {
    const saved = JSON.parse(localStorage.getItem(userStorageKey()));
    return Array.isArray(saved) ? saved.map(normalizeIdea) : [];
  } catch {
    return [];
  }
}

function saveIdeas() {
  if (!user) return;
  localStorage.setItem(userStorageKey(), JSON.stringify(ideas));
}

function loadPendingDeletes() {
  if (!user) return [];

  try {
    const saved = JSON.parse(localStorage.getItem(userPendingDeletesKey()));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function savePendingDeletes() {
  if (!user) return;
  localStorage.setItem(userPendingDeletesKey(), JSON.stringify(pendingDeletes));
}

function sortIdeas(entries) {
  return entries.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
}

function setAuthMessage(message) {
  authMessage.textContent = message;
}

function renderAuth() {
  const signedIn = Boolean(user);

  authForm.hidden = signedIn;
  profilePanel.hidden = !signedIn;
  userEmail.textContent = signedIn ? user.email : "";
  ideaInput.disabled = !signedIn;
  categoryInput.disabled = !signedIn;
  dueDateInput.disabled = !signedIn;
  notesInput.disabled = !signedIn;
  ideaForm.querySelector("button").disabled = !signedIn;
  clearDone.disabled = !signedIn;
  emptyState.textContent = signedIn
    ? "Add the first idea and this PWA will keep it here, even after refresh or while offline."
    : "Sign in to load your private build queue.";
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

    const main = document.createElement("div");
    main.className = "idea-main";

    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = idea.done;
    checkbox.setAttribute("aria-label", `Mark ${idea.text} as ready`);

    const content = document.createElement("div");
    content.className = "idea-content";

    const title = document.createElement("span");
    title.className = "idea-title";
    title.textContent = idea.text;

    const meta = document.createElement("div");
    meta.className = "idea-meta";

    const category = document.createElement("span");
    category.textContent = idea.category || "General";
    meta.append(category);

    if (idea.due_date) {
      const dueDate = document.createElement("span");
      dueDate.textContent = `Due ${idea.due_date}`;
      meta.append(dueDate);
    }

    content.append(title, meta);

    if (idea.notes) {
      const notes = document.createElement("p");
      notes.className = "idea-notes";
      notes.textContent = idea.notes;
      content.append(notes);
    }

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.type = "button";
    deleteButton.textContent = "X";
    deleteButton.setAttribute("aria-label", `Delete ${idea.text}`);

    label.append(checkbox);
    main.append(label, content);
    item.append(main, deleteButton);
    ideaList.append(item);
  }
}

function updateNetworkStatus(status) {
  offlineStatus.textContent = status || (navigator.onLine ? "Online" : "Offline");
}

async function loadCloudIdeas() {
  if (!user || !navigator.onLine || isSyncing) return;
  isSyncing = true;
  updateNetworkStatus("Syncing");

  try {
    await flushPendingChanges();

    const { data, error } = await supabase
      .from("ideas")
      .select("id,user_id,text,notes,category,due_date,done,updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const cloudIdeas = (data || []).map(normalizeIdea);
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

async function syncIdea(idea) {
  if (!user || !navigator.onLine) {
    idea.pending = true;
    saveIdeas();
    updateNetworkStatus("Local");
    return;
  }

  try {
    const { error } = await supabase
      .from("ideas")
      .upsert(
        {
          id: idea.id,
          user_id: user.id,
          text: idea.text,
          notes: idea.notes,
          category: idea.category,
          due_date: idea.due_date || null,
          done: idea.done,
          updated_at: idea.updated_at
        },
        { onConflict: "id" }
      )
      .select();

    if (error) throw error;

    idea.user_id = user.id;
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
  if (!user || !navigator.onLine) {
    if (!pendingDeletes.includes(id)) pendingDeletes.push(id);
    savePendingDeletes();
    updateNetworkStatus("Local");
    return;
  }

  try {
    const { error } = await supabase
      .from("ideas")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;

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

async function handleSession(nextSession) {
  session = nextSession;
  user = session?.user || null;
  ideas = loadIdeas();
  pendingDeletes = loadPendingDeletes();
  renderAuth();
  render();

  if (user) {
    setAuthMessage("");
    updateNetworkStatus(navigator.onLine ? "Loading" : "Offline");
    await loadCloudIdeas();
  } else {
    updateNetworkStatus(navigator.onLine ? "Online" : "Offline");
  }
}

async function authenticate(mode) {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) return;

  setAuthMessage(mode === "sign-up" ? "Creating account" : "Signing in");

  const result =
    mode === "sign-up"
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

  if (result.error) {
    setAuthMessage(result.error.message);
    return;
  }

  passwordInput.value = "";
  setAuthMessage(mode === "sign-up" && !result.data.session ? "Check your email to confirm the account." : "");
  await handleSession(result.data.session);
}

async function signInWithGoogle() {
  setAuthMessage("Opening Google");

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}${window.location.pathname}`
    }
  });

  if (error) setAuthMessage(error.message);
}

ideaForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!user) {
    setAuthMessage("Sign in before adding ideas.");
    return;
  }

  const text = ideaInput.value.trim();
  const category = categoryInput.value.trim() || "General";
  const dueDate = dueDateInput.value;
  const notes = notesInput.value.trim();
  if (!text) return;

  const idea = {
    id: crypto.randomUUID(),
    user_id: user.id,
    text,
    notes,
    category,
    due_date: dueDate,
    done: false,
    updated_at: new Date().toISOString(),
    pending: true
  };

  ideas.unshift(idea);
  saveIdeas();
  render();
  syncIdea(idea);
  ideaInput.value = "";
  categoryInput.value = "";
  dueDateInput.value = "";
  notesInput.value = "";
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

signInButton.addEventListener("click", () => authenticate("sign-in"));
signUpButton.addEventListener("click", () => authenticate("sign-up"));
googleSignInButton.addEventListener("click", signInWithGoogle);
authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  authenticate("sign-in");
});

signOutButton.addEventListener("click", async () => {
  await supabase.auth.signOut();
  setAuthMessage("");
  await handleSession(null);
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

supabase.auth.onAuthStateChange((_event, nextSession) => {
  handleSession(nextSession);
});

const {
  data: { session: initialSession }
} = await supabase.auth.getSession();

renderAuth();
render();
handleSession(initialSession);
