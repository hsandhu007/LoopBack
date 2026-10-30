const DB_NAME = "loopback-local";
const STORE = "items";
let db;
let currentView = "inbox";
let currentFilter = "all";
let deferredInstall = null;
let recognition = null;
let toastTimer;

const $ = (id) => document.getElementById(id);
const views = {
  inbox: ["Your inbox", "Everything you don't want to forget, in one place."],
  today: ["Today", "Your next actions, without the noise."],
  upcoming: ["Coming up", "A little preparation goes a long way."],
  completed: ["Completed", "Look at everything you've followed through on."]
};

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function store(mode = "readonly") { return db.transaction(STORE, mode).objectStore(STORE); }
function getAll() {
  return new Promise((resolve, reject) => {
    const req = store().getAll();
    req.onsuccess = () => resolve(req.result.sort((a,b) => b.createdAt-a.createdAt));
    req.onerror = () => reject(req.error);
  });
}
function putItem(item) {
  return new Promise((resolve,reject) => {
    const req = store("readwrite").put(item);
    req.onsuccess = () => resolve(item);
    req.onerror = () => reject(req.error);
  });
}
function deleteItem(id) {
  return new Promise((resolve,reject) => {
    const req = store("readwrite").delete(id);
    req.onsuccess = resolve; req.onerror = () => reject(req.error);
  });
}
function makeId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function escapeHTML(value="") {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function fmtDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return date.toLocaleString([], { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" });
}
function showToast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2500);
}
function setView(view) {
  currentView = view;
  document.querySelectorAll("[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  $("viewTitle").innerHTML = `${views[view][0]}<span class="yellow-dot">.</span>`;
  $("viewSubtitle").textContent = views[view][1];
  $("eyebrow").textContent = view === "inbox" ? "YOUR PERSONAL FOLLOW-THROUGH SPACE" : "YOUR LOOPBACK";
  render();
}
function matchesView(item) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = start + 86400000;
  if (currentView === "completed") return item.completed;
  if (item.completed) return false;
  if (currentView === "today") return item.reminderAt && new Date(item.reminderAt).getTime() < end;
  if (currentView === "upcoming") return item.reminderAt && new Date(item.reminderAt).getTime() >= end;
  return true;
}
function cardHTML(item) {
  const type = item.type || "note";
  const icon = {note:"✎",task:"✓",link:"↗",image:"▧",voice:"♫"}[type] || "•";
  const content = item.content ? `<p>${escapeHTML(item.content)}</p>` : "";
  const link = item.url ? `<a href="${escapeHTML(item.url)}" target="_blank" rel="noopener noreferrer">↗ Open saved link</a>` : "";
  const image = item.image ? `<img class="item-image" src="${item.image}" alt="Saved image">` : "";
  const reminder = item.reminderAt ? `<span class="reminder-tag">◷ ${escapeHTML(fmtDate(item.reminderAt))}</span>` : `<span>${item.completed ? "Completed" : "No reminder"}</span>`;
  return `<article class="item-card ${item.completed?"done-card":""}">
    <div class="card-top"><span class="type-pill">${icon} ${escapeHTML(type)}</span><div class="card-actions">
      ${item.important?'<span class="important" title="Important">★</span>':""}
      ${!item.completed?`<button class="icon-button" data-action="complete" data-id="${item.id}" title="Mark complete">✓</button>`:`<button class="icon-button" data-action="reopen" data-id="${item.id}" title="Reopen">↶</button>`}
      <button class="icon-button" data-action="delete" data-id="${item.id}" title="Delete">×</button>
    </div></div>
    <h3>${escapeHTML(item.title)}</h3>${content}${link}${image}
    <div class="card-meta">${reminder}<span>${new Date(item.createdAt).toLocaleDateString()}</span></div>
  </article>`;
}
async function render() {
  const items = await getAll();
  const query = $("searchInput").value.trim().toLowerCase();
  const visible = items.filter(item => matchesView(item))
    .filter(item => currentFilter === "all" || item.type === currentFilter)
    .filter(item => !query || [item.title,item.content,item.url,item.type].join(" ").toLowerCase().includes(query));
  $("itemsGrid").innerHTML = visible.map(cardHTML).join("");
  $("emptyState").classList.toggle("show", visible.length === 0);
  $("itemsGrid").style.display = visible.length ? "grid" : "none";
  const active = items.filter(i => !i.completed);
  $("inboxCount").textContent = active.length;
  const now = new Date(), end = new Date(now.getFullYear(),now.getMonth(),now.getDate()+1).getTime();
  $("todayCount").textContent = active.filter(i => i.reminderAt && new Date(i.reminderAt).getTime() < end).length;
}
function openModal(type="note") {
  $("captureForm").reset();
  $("itemType").value = type;
  updateTypeFields();
  $("captureModal").hidden = false;
  $("itemTitle").focus();
}
function closeModal() { $("captureModal").hidden = true; stopRecognition(); }
function updateTypeFields() {
  const type = $("itemType").value;
  $("linkField").hidden = type !== "link";
  $("imageField").hidden = type !== "image";
  $("voiceField").hidden = type !== "voice";
}
function fileToDataURL(file) {
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
async function saveCapture(event) {
  event.preventDefault();
  const type = $("itemType").value;
  const title = $("itemTitle").value.trim();
  if (!title) return;
  let image = null;
  const file = $("itemImage").files[0];
  if (file) {
    if (file.size > 5 * 1024 * 1024) { showToast("Please choose an image smaller than 5 MB."); return; }
    image = await fileToDataURL(file);
  }
  const url = $("itemUrl").value.trim();
  if (type === "link" && url) {
    try { new URL(url); } catch { showToast("Please enter a valid website URL."); return; }
  }
  const item = {
    id: makeId(), title, type, content: $("itemContent").value.trim(),
    url: type === "link" ? url : "", image,
    reminderAt: $("reminderAt").value ? new Date($("reminderAt").value).toISOString() : "",
    important: $("isImportant").checked, completed: false,
    createdAt: Date.now(), updatedAt: Date.now(), notified: false
  };
  await putItem(item);
  closeModal();
  await render();
  showToast("Saved to LOOPBACK.");
  checkReminders();
}
async function handleCardAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  const items = await getAll();
  const item = items.find(i => i.id === id);
  if (!item) return;
  if (button.dataset.action === "delete") {
    if (!confirm("Delete this item permanently from this device?")) return;
    await deleteItem(id); showToast("Item deleted.");
  } else {
    item.completed = button.dataset.action === "complete";
    item.updatedAt = Date.now();
    await putItem(item); showToast(item.completed ? "Nice work. Loop closed!" : "Item reopened.");
  }
  render();
}
function startRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { $("voiceStatus").textContent = "Voice transcription is not supported in this browser. You can type your note instead."; return; }
  recognition = new SpeechRecognition();
  recognition.lang = navigator.language || "en-US";
  recognition.interimResults = true;
  recognition.continuous = true;
  $("voiceStatus").textContent = "Listening… speak naturally. Tap Stop when finished.";
  $("recordBtn").textContent = "■ Stop speaking";
  recognition.onresult = event => {
    let transcript = "";
    for (let i=0; i<event.results.length; i++) transcript += event.results[i][0].transcript + " ";
    $("itemContent").value = transcript.trim();
    if (!$("itemTitle").value.trim()) $("itemTitle").value = transcript.trim().split(/[.!?]/)[0].slice(0,80);
  };
  recognition.onerror = () => { $("voiceStatus").textContent = "Voice capture stopped. You can edit the transcription."; stopRecognition(); };
  recognition.onend = () => { $("recordBtn").textContent = "● Start speaking"; };
  recognition.start();
}
function stopRecognition() {
  if (recognition) { try { recognition.stop(); } catch {} recognition = null; }
  if ($("recordBtn")) $("recordBtn").textContent = "● Start speaking";
}
async function checkReminders() {
  const items = await getAll();
  const now = Date.now();
  const due = items.filter(i => !i.completed && i.reminderAt && !i.notified && new Date(i.reminderAt).getTime() <= now);
  if (!due.length) return;
  if ("Notification" in window && Notification.permission === "granted") {
    due.slice(0,3).forEach(i => new Notification("LOOPBACK reminder", { body: i.title }));
  } else {
    showToast(due.length === 1 ? `Reminder: ${due[0].title}` : `You have ${due.length} reminders waiting.`);
  }
  for (const item of due) { item.notified = true; await putItem(item); }
  render();
}
async function requestNotifications() {
  if (!("Notification" in window)) { showToast("Notifications are not supported in this browser."); return; }
  const permission = await Notification.requestPermission();
  showToast(permission === "granted" ? "Notifications enabled while LOOPBACK is active." : "Notifications were not enabled.");
}
function exportData() {
  getAll().then(items => {
    const blob = new Blob([JSON.stringify({app:"LOOPBACK",version:1,exportedAt:new Date().toISOString(),items},null,2)],{type:"application/json"});
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href=url; a.download=`loopback-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
    showToast("Backup exported.");
  });
}
async function importData(file) {
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed.items)) throw new Error("Invalid backup");
    for (const item of parsed.items) if (item.id && item.title) await putItem(item);
    render(); showToast("Backup imported.");
  } catch { showToast("That backup file could not be imported."); }
}

document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
document.querySelectorAll(".capture-option").forEach(b => b.addEventListener("click", () => openModal(b.dataset.type)));
document.querySelectorAll(".filter-button").forEach(b => b.addEventListener("click", () => {
  currentFilter=b.dataset.filter;
  document.querySelectorAll(".filter-button").forEach(x=>x.classList.toggle("selected",x===b));
  render();
}));
$("openCapture").addEventListener("click",()=>openModal());
$("emptyCapture").addEventListener("click",()=>openModal());
$("closeModal").addEventListener("click",closeModal);
$("cancelModal").addEventListener("click",closeModal);
$("captureModal").addEventListener("click",e=>{if(e.target===$("captureModal"))closeModal();});
$("itemType").addEventListener("change",updateTypeFields);
$("captureForm").addEventListener("submit",saveCapture);
$("itemsGrid").addEventListener("click",handleCardAction);
$("searchInput").addEventListener("input",render);
$("recordBtn").addEventListener("click",()=>recognition?stopRecognition():startRecognition());
$("exportBtn")?.addEventListener("click",exportData);
$("importInput").addEventListener("change",e=>{if(e.target.files[0])importData(e.target.files[0]);e.target.value="";});
$("installBtn").addEventListener("click",async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$("installBtn").hidden=true;});

window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;$("installBtn").hidden=false;});
window.addEventListener("appinstalled",()=>showToast("LOOPBACK installed."));
window.addEventListener("focus",checkReminders);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)checkReminders();});
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
}
(async function init(){
  try { db=await openDB(); await render(); checkReminders(); }
  catch (error) { console.error(error); showToast("Local storage could not be opened in this browser."); }
})();
