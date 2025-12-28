// app.js (ESM) - Firebase v9+ CDN modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  getDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

/**
 * Pega tu firebaseConfig real aquí (Firebase Console -> Project settings -> Web app).
 */
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROJECT.firebaseapp.com",
  projectId: "TU_PROJECT_ID",
  storageBucket: "TU_PROJECT.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Tareas por defecto (puedes cambiar nombres y frecuencias)
const TASK_TEMPLATES = [
  { type: "ENT", label: "Entorno", intervalMonths: 1 },
  { type: "FAM", label: "Sesión familiar", intervalMonths: 3 },
  { type: "PIAT", label: "PIAT", intervalMonths: 6 }
];

// ===== UI refs
const toggleAdd = document.getElementById("toggleAdd");
const addCard = document.getElementById("addCard");
const closeAdd = document.getElementById("closeAdd");

const patientForm = document.getElementById("patientForm");
const patientName = document.getElementById("patientName");
const patientNotes = document.getElementById("patientNotes");

const prevMonthBtn = document.getElementById("prevMonth");
const nextMonthBtn = document.getElementById("nextMonth");
const goTodayBtn = document.getElementById("goToday");
const monthTitle = document.getElementById("monthTitle");
const monthSubtitle = document.getElementById("monthSubtitle");

const searchBox = document.getElementById("searchBox");
const kpisEl = document.getElementById("kpis");
const listEl = document.getElementById("list");
const listHint = document.getElementById("listHint");

const segButtons = Array.from(document.querySelectorAll(".seg"));

// ===== State
let patients = [];
let tasksByPatient = new Map();

let viewMode = "month"; // month | urgent | all
let cursor = new Date(); // month cursor

// ===== Collections
const patientsCol = collection(db, "patients");
const tasksCol = collection(db, "tasks");

// ===== Helpers
function pad(n){ return String(n).padStart(2, "0"); }

function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function toDate(maybeTimestamp){
  if (!maybeTimestamp) return null;
  if (maybeTimestamp instanceof Date) return maybeTimestamp;
  if (maybeTimestamp.seconds) return new Date(maybeTimestamp.seconds * 1000);
  return new Date(maybeTimestamp);
}

function formatDate(d){
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d);
  return `${pad(dt.getDate())}/${pad(dt.getMonth()+1)}/${dt.getFullYear()}`;
}

function startOfMonth(d){
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d){
  return new Date(d.getFullYear(), d.getMonth()+1, 0, 23, 59, 59, 999);
}
function isSameMonth(a, b){
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function addMonths(date, months){
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

function dayDiff(from, to){
  const ms = 24 * 60 * 60 * 1000;
  const A = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const B = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((B - A) / ms);
}

// Status logic -> “se intuye” por color + tag (ATR / HOY / MES / +Xd / OK)
function statusFor(nextDue){
  if (!nextDue) return { cls: "warn", tag: "—", sort: 999999 };

  const today = new Date();
  const diff = dayDiff(today, nextDue); // next - today

  if (diff < 0) return { cls: "bad", tag: "ATR", sort: -10000 + diff };
  if (diff === 0) return { cls: "bad", tag: "HOY", sort: -5000 };
  if (diff <= 14) return { cls: "warn", tag: `+${diff}d`, sort: diff };
  return { cls: "ok", tag: "OK", sort: diff };
}

function monthLabel(d){
  const months = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function setActiveSeg(){
  segButtons.forEach(b => b.classList.toggle("active", b.dataset.view === viewMode));
}

// ===== UI show/hide add card
toggleAdd.addEventListener("click", () => addCard.classList.toggle("hidden"));
closeAdd.addEventListener("click", () => addCard.classList.add("hidden"));

// ===== Month navigation
prevMonthBtn.addEventListener("click", () => { cursor = addMonths(cursor, -1); render(); });
nextMonthBtn.addEventListener("click", () => { cursor = addMonths(cursor, 1); render(); });
goTodayBtn.addEventListener("click", () => { cursor = new Date(); render(); });

// ===== Segmented view
segButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    viewMode = btn.dataset.view;
    setActiveSeg();
    render();
  });
});
setActiveSeg();

// ===== Create patient + default tasks (nextDue = hoy)
patientForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = patientName.value.trim();
  const notes = patientNotes.value.trim();
  if (!name) return;

  const patientRef = await addDoc(patientsCol, {
    name,
    notes,
    createdAt: serverTimestamp()
  });

  const now = new Date();
  for (const tpl of TASK_TEMPLATES){
    await addDoc(tasksCol, {
      patientId: patientRef.id,
      type: tpl.type,           // ENT / FAM / PIAT
      label: tpl.label,         // texto corto interno (por si lo quieres mostrar luego)
      intervalMonths: tpl.intervalMonths,
      lastDone: null,
      nextDue: Timestamp.fromDate(now),
      createdAt: serverTimestamp()
    });
  }

  patientName.value = "";
  patientNotes.value = "";
  addCard.classList.add("hidden");
});

// ===== Realtime listeners
onSnapshot(query(patientsCol, orderBy("createdAt", "desc")), (snap) => {
  patients = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  render();
});

onSnapshot(query(tasksCol, orderBy("createdAt", "desc")), (snap) => {
  tasksByPatient = new Map();

  snap.docs.forEach(d => {
    const t = { id: d.id, ...d.data() };
    const arr = tasksByPatient.get(t.patientId) || [];
    arr.push(t);
    tasksByPatient.set(t.patientId, arr);
  });

  // Ordena por urgencia
  for (const [pid, arr] of tasksByPatient.entries()){
    arr.sort((a,b) => {
      const da = toDate(a.nextDue) || new Date(8640000000000000);
      const dbb = toDate(b.nextDue) || new Date(8640000000000000);
      return da - dbb;
    });
    tasksByPatient.set(pid, arr);
  }

  render();
});

// ===== Actions
async function markDone(taskId){
  const taskRef = doc(db, "tasks", taskId);
  const snap = await getDoc(taskRef);
  if (!snap.exists()) return;

  const t = snap.data();
  const now = new Date();
  const next = addMonths(now, Number(t.intervalMonths || 0));

  await updateDoc(taskRef, {
    lastDone: Timestamp.fromDate(now),
    nextDue: Timestamp.fromDate(next)
  });
}

async function deletePatient(patientId){
  await deleteDoc(doc(db, "patients", patientId));

  const tasks = tasksByPatient.get(patientId) || [];
  for (const t of tasks){
    await deleteDoc(doc(db, "tasks", t.id));
  }
}

// ===== Filtering logic (no frases largas, por color + chips)
function getFilteredPatients(){
  const q = (searchBox.value || "").trim().toLowerCase();
  if (!q) return patients;
  return patients.filter(p =>
    (p.name || "").toLowerCase().includes(q) ||
    (p.notes || "").toLowerCase().includes(q)
  );
}

function taskIncludedByView(nextDue){
  if (viewMode === "all") return true;
  if (!nextDue) return true;

  const today = new Date();
  const diff = dayDiff(today, nextDue);

  if (viewMode === "urgent") return diff <= 14; // incluye ATR, HOY, +14d
  // viewMode === "month"
  return isSameMonth(nextDue, cursor);
}

function patientIncludedByView(patientId){
  const tasks = tasksByPatient.get(patientId) || [];
  // un paciente “entra” si tiene al menos 1 chip en esta vista
  return tasks.some(t => taskIncludedByView(toDate(t.nextDue)));
}

function sortTasksForDisplay(tasks){
  // en cada paciente, primero ATR/HOY/+Xd/OK
  return [...tasks].sort((a,b) => {
    const sa = statusFor(toDate(a.nextDue)).sort;
    const sb = statusFor(toDate(b.nextDue)).sort;
    return sa - sb;
  });
}

function computeKpis(filteredPatients){
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);

  let totalChips = 0;
  let overdue = 0;
  let dueThisMonth = 0;
  let dueSoon = 0;

  const today = new Date();

  filteredPatients.forEach(p => {
    const tasks = tasksByPatient.get(p.id) || [];
    tasks.forEach(t => {
      const nd = toDate(t.nextDue);
      if (!nd) return;

      totalChips++;

      const diff = dayDiff(today, nd);
      if (diff < 0) overdue++;
      if (diff >= 0 && diff <= 14) dueSoon++;
      if (nd >= monthStart && nd <= monthEnd) dueThisMonth++;
    });
  });

  const activePatients = filteredPatients.filter(p => patientIncludedByView(p.id)).length;

  return { activePatients, totalChips, overdue, dueThisMonth, dueSoon };
}

// ===== Render
searchBox.addEventListener("input", render);

function render(){
  // Header month text
  monthTitle.textContent = monthLabel(cursor);
  monthSubtitle.textContent =
    viewMode === "month" ? "Chips solo de este mes" :
    viewMode === "urgent" ? "ATR / HOY / +14d" :
    "Todas las tareas";

  const filtered = getFilteredPatients();

  // KPIs
  const k = computeKpis(filtered);
  kpisEl.innerHTML = `
    <div class="kpi">
      <div class="label">Pacientes en vista</div>
      <div class="value">${k.activePatients}</div>
      <div class="mini"><span class="pulse warn"></span><span>con algo visible</span></div>
    </div>
    <div class="kpi">
      <div class="label">Chips (total)</div>
      <div class="value">${k.totalChips}</div>
      <div class="mini"><span class="pulse ok"></span><span>todas las tareas</span></div>
    </div>
    <div class="kpi">
      <div class="label">Atrasadas</div>
      <div class="value">${k.overdue}</div>
      <div class="mini"><span class="pulse bad"></span><span>ATR</span></div>
    </div>
    <div class="kpi">
      <div class="label">Este mes</div>
      <div class="value">${k.dueThisMonth}</div>
      <div class="mini"><span class="pulse warn"></span><span>MES</span></div>
    </div>
  `;

  // List hint
  const viewLabel = viewMode === "month" ? "MES" : (viewMode === "urgent" ? "URGENTE" : "TODO");
  listHint.textContent = `${viewLabel} · ${filtered.length} pacientes (buscador incluido)`;

  // Build list
  listEl.innerHTML = "";

  // Filtra pacientes que tengan algo que mostrar (en month/urgent)
  const listPatients =
    viewMode === "all"
      ? filtered
      : filtered.filter(p => patientIncludedByView(p.id));

  // Ordena pacientes por chip más urgente visible
  const sortedPatients = [...listPatients].sort((a,b) => {
    const ta = sortTasksForDisplay((tasksByPatient.get(a.id) || []).filter(t => taskIncludedByView(toDate(t.nextDue))));
    const tb = sortTasksForDisplay((tasksByPatient.get(b.id) || []).filter(t => taskIncludedByView(toDate(t.nextDue))));
    const sa = ta.length ? statusFor(toDate(ta[0].nextDue)).sort : 999999;
    const sb = tb.length ? statusFor(toDate(tb[0].nextDue)).sort : 999999;
    return sa - sb;
  });

  if (!sortedPatients.length){
    listEl.innerHTML = `<div class="subtle">No hay pacientes con chips en esta vista.</div>`;
    return;
  }

  sortedPatients.forEach(p => {
    const allTasks = tasksByPatient.get(p.id) || [];
    const visibleTasks = sortTasksForDisplay(allTasks.filter(t => taskIncludedByView(toDate(t.nextDue))));

    const notes = (p.notes || "").trim();

    const patientNode = document.createElement("div");
    patientNode.className = "patient";
    patientNode.innerHTML = `
      <div class="patient-top">
        <div>
          <div class="patient-name">
            ${escapeHtml(p.name || "Sin nombre")}
          </div>
          <div class="patient-not
