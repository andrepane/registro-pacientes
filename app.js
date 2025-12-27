// app.js (ESM)
// Firebase v9+ via CDN modules

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

/**
 * 1) Crea un proyecto en Firebase Console
 * 2) Activa Firestore Database
 * 3) Copia aquí tu firebaseConfig (Project settings -> Your apps -> Web app)
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

// ====== Ajusta tus tareas recurrentes aquí ======
const TASK_TEMPLATES = [
  { type: "Entorno", intervalMonths: 1 },
  { type: "Sesión familiar", intervalMonths: 3 },
  { type: "PIAT", intervalMonths: 6 }
];

// ====== UI Refs ======
const patientForm = document.getElementById("patientForm");
const patientName = document.getElementById("patientName");
const patientNotes = document.getElementById("patientNotes");
const viewFilter = document.getElementById("viewFilter");
const searchBox = document.getElementById("searchBox");
const listEl = document.getElementById("list");
const statsEl = document.getElementById("stats");

// ====== Helpers ======
function pad(n){ return String(n).padStart(2, "0"); }

function formatDate(d){
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d);
  return `${pad(dt.getDate())}/${pad(dt.getMonth()+1)}/${dt.getFullYear()}`;
}

function toDate(maybeTimestamp){
  if (!maybeTimestamp) return null;
  if (maybeTimestamp instanceof Date) return maybeTimestamp;
  // Firestore Timestamp
  if (maybeTimestamp.seconds) return new Date(maybeTimestamp.seconds * 1000);
  return new Date(maybeTimestamp);
}

function addMonths(date, months){
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);

  // Ajuste para meses con menos días (ej: 31 -> 30/28)
  if (d.getDate() < day) d.setDate(0);
  return d;
}

function daysDiff(a, b){
  // b - a en días
  const ms = 24 * 60 * 60 * 1000;
  const A = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const B = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((B - A) / ms);
}

function statusFor(nextDue){
  if (!nextDue) return { label:"Sin fecha", cls:"warn" };
  const today = new Date();
  const diff = daysDiff(today, nextDue); // nextDue - today
  if (diff < 0) return { label:`Atrasada (${Math.abs(diff)}d)`, cls:"bad" };
  if (diff === 0) return { label:"Hoy", cls:"bad" };
  if (diff <= 14) return { label:`Próxima (${diff}d)`, cls:"warn" };
  return { label:`Ok (${diff}d)`, cls:"ok" };
}

function matchesView(nextDue){
  const v = viewFilter.value;
  if (v === "all") return true;
  if (!nextDue) return true;

  const today = new Date();
  const diff = daysDiff(today, nextDue);
  if (v === "overdue") return diff < 0;
  if (v === "dueSoon") return diff >= 0 && diff <= 14;
  if (v === "dueNow") return diff <= 0;
  return true;
}

// ====== Data Model ======
// patients/{patientId}
// tasks/{taskId} -> { patientId, type, intervalMonths, lastDone, nextDue, createdAt }

const patientsCol = collection(db, "patients");
const tasksCol = collection(db, "tasks");

// ====== Create patient + default tasks ======
patientForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = patientName.value.trim();
  const notes = patientNotes.value.trim();

  if (!name) return;

  // 1) Create patient
  const patientRef = await addDoc(patientsCol, {
    name,
    notes,
    createdAt: serverTimestamp()
  });

  // 2) Create default tasks (initially due today)
  const now = new Date();
  for (const tpl of TASK_TEMPLATES){
    await addDoc(tasksCol, {
      patientId: patientRef.id,
      type: tpl.type,
      intervalMonths: tpl.intervalMonths,
      lastDone: null,
      nextDue: Timestamp.fromDate(now),
      createdAt: serverTimestamp()
    });
  }

  patientName.value = "";
  patientNotes.value = "";
});

// ====== Live listeners ======
let patients = [];
let tasksByPatient = new Map();

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

  // Orden interno: primero las más urgentes
  for (const [pid, arr] of tasksByPatient.entries()){
    arr.sort((a,b) => {
      const da = toDate(a.nextDue) || new Date(0);
      const dbb = toDate(b.nextDue) || new Date(0);
      return da - dbb;
    });
    tasksByPatient.set(pid, arr);
  }

  render();
});

// ====== Actions ======
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
  // borra paciente y sus tareas
  const pRef = doc(db, "patients", patientId);
  await deleteDoc(pRef);

  const tasks = tasksByPatient.get(patientId) || [];
  for (const t of tasks){
    await deleteDoc(doc(db, "tasks", t.id));
  }
}

function getFilteredPatients(){
  const q = (searchBox.value || "").trim().toLowerCase();
  if (!q) return patients;
  return patients.filter(p => (p.name || "").toLowerCase().includes(q) || (p.notes || "").toLowerCase().includes(q));
}

// ====== Render ======
viewFilter.addEventListener("change", render);
searchBox.addEventListener("input", render);

function render(){
  const filtered = getFilteredPatients();

  // Stats
  let overdue = 0, dueSoon = 0, dueNow = 0, totalTasks = 0;

  filtered.forEach(p => {
    const tasks = tasksByPatient.get(p.id) || [];
    tasks.forEach(t => {
      const nd = toDate(t.nextDue);
      if (!nd) return;
      totalTasks++;
      const diff = daysDiff(new Date(), nd);
      if (diff < 0) overdue++;
      if (diff <= 0) dueNow++;
      if (diff >= 0 && diff <= 14) dueSoon++;
    });
  });

  statsEl.innerHTML = `
    <div class="pill"><b>${filtered.length}</b> pacientes</div>
    <div class="pill"><b>${dueNow}</b> pendientes (hoy/antes)</div>
    <div class="pill"><b>${overdue}</b> atrasadas</div>
    <div class="pill"><b>${dueSoon}</b> próximas (≤14d)</div>
  `;

  // List
  listEl.innerHTML = "";

  filtered.forEach(p => {
    const tasks = (tasksByPatient.get(p.id) || []).filter(t => matchesView(toDate(t.nextDue)));
    const patientNode = document.createElement("div");
    patientNode.className = "patient";

    const notes = (p.notes || "").trim();
    patientNode.innerHTML = `
      <div class="patientHeader">
        <div class="patientTitle">
          <div class="name">${escapeHtml(p.name || "Sin nombre")}</div>
          ${notes ? `<div class="notes">${escapeHtml(notes)}</div>` : `<div class="notes">—</div>`}
        </div>

        <button class="btn small" data-del="${p.id}" title="Borrar paciente">Borrar</button>
      </div>

      <div class="tasks">
        ${tasks.length ? tasks.map(taskRow).join("") : `<div class="hint">No hay tareas en esta vista (prueba “Ver: todo”).</div>`}
      </div>
    `;

    listEl.appendChild(patientNode);
  });

  // Bind buttons
  listEl.querySelectorAll("[data-done]").forEach(btn => {
    btn.addEventListener("click", () => markDone(btn.getAttribute("data-done")));
  });

  listEl.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del");
      const ok = confirm("¿Seguro que quieres borrar este paciente y sus tareas?");
      if (ok) deletePatient(id);
    });
  });
}

function taskRow(t){
  const last = toDate(t.lastDone);
  const next = toDate(t.nextDue);
  const st = statusFor(next);

  return `
    <div class="task">
      <div class="taskLeft">
        <div class="type">${escapeHtml(t.type || "Tarea")}</div>
        <div class="meta">
          Último: <b>${last ? formatDate(last) : "nunca"}</b> · Próximo: <b>${next ? formatDate(next) : "—"}</b> · Frec.: cada <b>${t.intervalMonths || "?"}</b> mes(es)
        </div>
      </div>

      <div style="display:flex; gap:8px; align-items:center;">
        <span class="badge ${st.cls}">${st.label}</span>
        <button class="btn small primary" data-done="${t.id}">Hecho</button>
      </div>
    </div>
  `;
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
