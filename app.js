import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// =====================
// Simple CAIT/Privado tracker (localStorage + Firebase)
// =====================

const STORAGE_KEY = "cait_private_tracker_v1";

const firebaseConfig = {
    apiKey: "AIzaSyBkDRJqz2YoJPzD4xlIpu_ffyMQ1LBvydo",
    authDomain: "registro-paciente-83692.firebaseapp.com",
    projectId: "registro-paciente-83692",
    storageBucket: "registro-paciente-83692.firebasestorage.app",
    messagingSenderId: "191198228050",
    appId: "1:191198228050:web:a07501143ac178ff3d798b"
  };
const FIREBASE_COLLECTION = "sharedState";
const FIREBASE_DOC_ID = "default";

let state = loadLocalState();
let firestore = null;
let stateDocRef = null;

// Tabs
const tabs = document.querySelectorAll(".tab");
const sections = document.querySelectorAll("[data-section]");

tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    tabs.forEach(b => {
      const isActive = b === btn;
      b.classList.toggle("active", isActive);
      b.setAttribute("aria-selected", String(isActive));
    });
    const view = btn.dataset.view;
    sections.forEach(sec => sec.classList.toggle("hidden", sec.dataset.section !== view));
    render();
  });
});

// Forms
const caitForm = document.getElementById("caitForm");
const caitName = document.getElementById("caitName");
const caitSearch = document.getElementById("caitSearch");
const privateForm = document.getElementById("privateForm");
const privateName = document.getElementById("privateName");
const privateSearch = document.getElementById("privateSearch");

const exportBtn = document.getElementById("exportBtn");
const importInput = document.getElementById("importInput");
const lastUpdated = document.getElementById("lastUpdated");
const summarySearch = document.getElementById("summarySearch");
const summaryFilterButtons = document.querySelectorAll("[data-summary-filter]");
const summarySubFilterButtons = document.querySelectorAll("[data-summary-subfilter]");
const toast = document.getElementById("toast");

let summaryFilter = "all";
let summarySubFilter = "all";
let toastTimer = null;

caitForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = normalizeName(caitName.value);
  if (!isValidName(name)) return;
  if (hasDuplicate(name, "cait")) {
    alert("Este paciente ya existe en CAIT.");
    return;
  }
  state.cait.push(makeCaitPatient(name));
  caitName.value = "";
  saveAndRender();
});

privateForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = normalizeName(privateName.value);
  if (!isValidName(name)) return;
  if (hasDuplicate(name, "private")) {
    alert("Este paciente ya existe en Privado.");
    return;
  }
  state.private.push(makePrivatePatient(name));
  privateName.value = "";
  saveAndRender();
});

caitSearch.addEventListener("input", () => renderCait());
privateSearch.addEventListener("input", () => renderPrivate());
summarySearch.addEventListener("input", () => renderSummary());

summaryFilterButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const nextFilter = btn.dataset.summaryFilter;
    summaryFilter = summaryFilter === nextFilter ? "all" : nextFilter;
    summaryFilterButtons.forEach(b => {
      const isActive = b.dataset.summaryFilter === summaryFilter;
      b.classList.toggle("active", isActive);
      b.setAttribute("aria-pressed", String(isActive));
    });
    renderSummary();
  });
});

summarySubFilterButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    summarySubFilter = btn.dataset.summarySubfilter;
    summarySubFilterButtons.forEach(b => {
      const isActive = b.dataset.summarySubfilter === summarySubFilter;
      b.classList.toggle("active", isActive);
      b.setAttribute("aria-pressed", String(isActive));
    });
    renderSummary();
  });
});

exportBtn.addEventListener("click", () => {
  const payload = JSON.stringify(state, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pacientes-backup-${todayYMD()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

importInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const parsed = JSON.parse(reader.result);
      const next = hydrateState(parsed);
      state.cait = next.cait;
      state.private = next.private;
      state.lastUpdatedAt = next.lastUpdatedAt;
      saveAndRender();
    }catch{
      alert("El archivo no es válido.");
    }finally{
      importInput.value = "";
    }
  };
  reader.readAsText(file);
});

// Render targets
const caitList = document.getElementById("caitList");
const privateList = document.getElementById("privateList");
const summaryStats = document.getElementById("summaryStats");
const summaryList = document.getElementById("summaryList");

// Initial render
render();
initFirebaseSync();

// =====================
// Data model
// =====================
function makeId(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function makeCaitPatient(name){
  return {
    id: makeId(),
    name,
    notes: "",
    // Dates stored as yyyy-mm-dd string or null
    lastPIAT: null,
    lastENT: null,
    lastFAM: null
  };
}

function makePrivatePatient(name){
  return {
    id: makeId(),
    name,
    notes: "",
    // recoveries: array of {date: yyyy-mm-dd, count:number}
    recoveries: []
  };
}

// =====================
// Date helpers
// =====================
function todayYMD(){
  const d = new Date();
  return toYMD(d);
}

function getMonthKey(ymdOrDate){
  if (!ymdOrDate) return null;
  const d = ymdOrDate instanceof Date ? ymdOrDate : parseYMD(ymdOrDate);
  if (!d) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2,"0");
  return `${yyyy}-${mm}`;
}

function toYMD(d){
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseYMD(ymd){
  if (!ymd) return null;
  const [y,m,d] = ymd.split("-").map(Number);
  return new Date(y, m-1, d);
}

function formatDMY(ymd){
  const d = parseYMD(ymd);
  if (!d) return "—";
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth() + 1).padStart(2,"0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function addMonths(ymd, months){
  const d = parseYMD(ymd);
  if (!d) return null;
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return toYMD(d);
}

function dayDiff(fromYMD, toYMDStr){
  const A = parseYMD(fromYMD);
  const B = parseYMD(toYMDStr);
  if (!A || !B) return null;
  const ms = 24*60*60*1000;
  const a = new Date(A.getFullYear(), A.getMonth(), A.getDate()).getTime();
  const b = new Date(B.getFullYear(), B.getMonth(), B.getDate()).getTime();
  return Math.round((b - a) / ms);
}

function statusFor(dueYMD){
  if (!dueYMD) return {cls:"warn", label:"—"};
  const diff = dayDiff(todayYMD(), dueYMD);
  if (diff === null) return {cls:"warn", label:"—"};
  if (diff < 0) return {cls:"bad", label:`ATR ${Math.abs(diff)}d`};
  if (diff === 0) return {cls:"bad", label:"HOY"};
  if (diff <= 14) return {cls:"warn", label:`+${diff}d`};
  return {cls:"ok", label:"OK"};
}

function isDueInThisMonth(dueYMD, monthKey){
  if (!dueYMD || !monthKey) return false;
  return getMonthKey(dueYMD) === monthKey;
}

function getCaitMonthTodo(patient, monthKey){
  const today = todayYMD();
  const dueKinds = [];
  const missingKinds = [];
  const kinds = [
    { label: "PIAT", last: patient.lastPIAT, months: 6 },
    { label: "ENT", last: patient.lastENT, months: 1 },
    { label: "FAM", last: patient.lastFAM, months: 3 }
  ];

  kinds.forEach(({ label, last, months }) => {
    const next = last ? addMonths(last, months) : null;
    if (!next) {
      missingKinds.push(label);
      dueKinds.push(label);
      return;
    }
    const isOverdue = dayDiff(today, next) < 0;
    if (isOverdue || isDueInThisMonth(next, monthKey)) {
      dueKinds.push(label);
    }
  });

  const uniqueDue = [...new Set(dueKinds)];
  const ok = uniqueDue.length === 0;
  const summaryText = ok ? "Todo al día" : `Este mes: falta ${uniqueDue.join(", ")}`;
  const severity = ok ? "ok" : (missingKinds.length > 0 ? "warn" : "bad");

  return {
    missingKinds,
    dueKinds: uniqueDue,
    ok,
    summaryText,
    severity
  };
}

function getCaitPriorityFromKind(kind){
  if (kind === "PIAT") return 1;
  if (kind === "ENT") return 2;
  if (kind === "FAM") return 3;
  return 4;
}

function getCaitLastByKind(patient, kind){
  if (kind === "PIAT") return patient.lastPIAT;
  if (kind === "ENT") return patient.lastENT;
  if (kind === "FAM") return patient.lastFAM;
  return null;
}

function getOldestCaitLastDate(patient){
  const dates = [patient.lastPIAT, patient.lastENT, patient.lastFAM].filter(Boolean);
  if (dates.length === 0) return null;
  return dates.sort((a,b) => (a > b ? 1 : -1))[0];
}

function getCaitPriorityInfo(patient, monthKey){
  const monthTodo = getCaitMonthTodo(patient, monthKey);
  if (monthTodo.dueKinds.includes("PIAT")) {
    return { priority: 1, last: patient.lastPIAT };
  }
  if (monthTodo.dueKinds.includes("ENT")) {
    return { priority: 2, last: patient.lastENT };
  }
  if (monthTodo.dueKinds.includes("FAM")) {
    return { priority: 3, last: patient.lastFAM };
  }
  return { priority: 4, last: getOldestCaitLastDate(patient) };
}

function getDateSortValue(ymd){
  if (!ymd) return -Infinity;
  const d = parseYMD(ymd);
  if (!d) return -Infinity;
  return d.getTime();
}

function comparePriorityRecords(a, b){
  if (a.priority !== b.priority) return a.priority - b.priority;
  const aDate = getDateSortValue(a.last);
  const bDate = getDateSortValue(b.last);
  if (aDate !== bDate) return aDate - bDate;
  return String(a.name).localeCompare(String(b.name), "es", { sensitivity: "base" });
}

function getPrivatePending(patient){
  return patient.recoveries.reduce((sum, r) => sum + (Number(r.count)||0), 0);
}

// =====================
// Render
// =====================
function render(){
  renderCait();
  renderPrivate();
  renderSummary();
  renderLastUpdated();
}

function renderCait(){
  caitList.innerHTML = "";
  const monthKey = getMonthKey(new Date());

  const query = caitSearch.value.trim().toLowerCase();
  const list = query
    ? state.cait.filter(p => p.name.toLowerCase().includes(query))
    : state.cait;

  if (list.length === 0){
    caitList.innerHTML = `<div class="hint">No hay pacientes CAIT aún.</div>`;
    return;
  }

  const ordered = list.slice().sort((a,b) => {
    const aInfo = getCaitPriorityInfo(a, monthKey);
    const bInfo = getCaitPriorityInfo(b, monthKey);
    return comparePriorityRecords(
      { priority: aInfo.priority, last: aInfo.last, name: a.name },
      { priority: bInfo.priority, last: bInfo.last, name: b.name }
    );
  });

  ordered.forEach(p => {
    const nextPIAT = p.lastPIAT ? addMonths(p.lastPIAT, 6) : null;
    const nextENT  = p.lastENT ? addMonths(p.lastENT, 1) : null;
    const nextFAM  = p.lastFAM ? addMonths(p.lastFAM, 3) : null;

    const stPIAT = statusFor(nextPIAT);
    const stENT  = statusFor(nextENT);
    const stFAM  = statusFor(nextFAM);
    const monthTodo = getCaitMonthTodo(p, monthKey);
    const missingText = monthTodo.missingKinds.length
      ? `Falta fecha: ${monthTodo.missingKinds.join(", ")}`
      : "";
    const monthBadgeText = missingText
      ? (monthTodo.ok ? missingText : `${missingText} · ${monthTodo.summaryText}`)
      : monthTodo.summaryText;

    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="itemHead">
        <div>
          <div class="name">${escapeHtml(p.name)}</div>
          <div class="sub">CAIT</div>
          <div class="badge"><span class="dot ${monthTodo.severity}"></span>${escapeHtml(monthBadgeText)}</div>
        </div>
        <div class="actions">
          <button class="btn small" data-edit-name data-scope="cait" data-id="${p.id}" type="button">Editar</button>
          <button class="btn small" data-del-cait="${p.id}" type="button">Borrar</button>
        </div>
      </div>

      <div class="grid3">
        ${caitBox("PIAT", p.lastPIAT, nextPIAT, stPIAT, "piat", p.id)}
        ${caitBox("ENT",  p.lastENT,  nextENT,  stENT,  "ent",  p.id)}
        ${caitBox("FAM",  p.lastFAM,  nextFAM,  stFAM,  "fam",  p.id)}
      </div>
      <div class="notes">
        <label class="sub" for="notes-cait-${p.id}">Notas</label>
        <textarea id="notes-cait-${p.id}" rows="2" placeholder="Añade notas rápidas...">${escapeHtml(p.notes || "")}</textarea>
        <div class="actions">
          <button class="btn small primary" data-save-notes data-scope="cait" data-id="${p.id}" type="button">Guardar nota</button>
        </div>
      </div>
    `;
    caitList.appendChild(el);
  });

  // bind actions
  caitList.querySelectorAll("[data-del-cait]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del-cait");
      if (confirm("¿Borrar este paciente CAIT?")) {
        state.cait = state.cait.filter(x => x.id !== id);
        saveAndRender();
      }
    });
  });

  caitList.querySelectorAll("[data-setlast]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const kind = btn.getAttribute("data-kind"); // piat|ent|fam
      const input = document.getElementById(`last-${kind}-${id}`);
      const val = input.value || null;
      const p = state.cait.find(x => x.id === id);
      if (!p) return;
      if (kind === "piat") p.lastPIAT = val;
      if (kind === "ent")  p.lastENT  = val;
      if (kind === "fam")  p.lastFAM  = val;
      saveAndRender();
    });
  });

  bindNameEdits(caitList);
  bindNotesSave(caitList, "cait");
  animateList(caitList);
}

function caitBox(code, last, next, st, kind, id){
  return `
    <div class="box">
      <b>${code}</b>
      <div class="line"><span>Último</span><span>${formatDMY(last)}</span></div>
      <div class="line"><span>Próximo</span><span>${formatDMY(next)}</span></div>
      <div class="actions">
        <span class="badge"><span class="dot ${st.cls}"></span>${st.label}</span>
      </div>
      <input id="last-${kind}-${id}" type="date" value="${last ?? ""}" />
      <div class="actions">
        <button class="btn small primary" data-setlast data-id="${id}" data-kind="${kind}" type="button">
          Guardar
        </button>
      </div>
    </div>
  `;
}

function renderPrivate(){
  privateList.innerHTML = "";

  const query = privateSearch.value.trim().toLowerCase();
  const list = query
    ? state.private.filter(p => p.name.toLowerCase().includes(query))
    : state.private;

  if (list.length === 0){
    privateList.innerHTML = `<div class="hint">No hay pacientes Privado aún.</div>`;
    return;
  }

  list.forEach(p => {
    const totalPending = getPrivatePending(p);
    const oldest = getOldestRecoveryDate(p.recoveries);
    const debtStatus = totalPending > 0 ? { cls: "warn", label: "Con deuda" } : { cls: "ok", label: "Sin deuda" };

    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="itemHead">
        <div>
          <div class="name">${escapeHtml(p.name)}</div>
          <div class="sub">Privado</div>
        </div>
        <div class="actions">
          <button class="btn small" data-edit-name data-scope="private" data-id="${p.id}" type="button">Editar</button>
          <button class="btn small" data-del-priv="${p.id}" type="button">Borrar</button>
        </div>
      </div>

      <div class="grid3">
        <div class="box">
          <b>RECUP</b>
          <div class="line"><span>Pendientes</span><span><strong>${totalPending}</strong></span></div>
          <div class="line"><span>Desde</span><span>${formatDMY(oldest)}</span></div>
          <div class="actions">
            <span class="badge"><span class="dot ${debtStatus.cls}"></span>${debtStatus.label}</span>
          </div>

          <div class="actions">
            <button class="btn small" data-addpending="${p.id}" type="button">+1 pendiente</button>
            <button class="btn small" data-subpending="${p.id}" type="button">-1 pendiente</button>
          </div>

          <div class="sub" style="margin-top:10px;">Añadir recuperaciones</div>
          <input id="rec-date-${p.id}" type="date" />
          <input id="rec-count-${p.id}" type="number" min="1" placeholder="Nº sesiones" />
          <div class="actions">
            <button class="btn small primary" data-addrec="${p.id}" type="button">Añadir</button>
            <button class="btn small" data-subrec="${p.id}" type="button">Recuperé 1</button>
          </div>

          <div class="sub" style="margin-top:10px;">Detalle</div>
          <div class="sub">${renderRecoveryMiniList(p.recoveries)}</div>
        </div>

        <div class="box">
          <b>NOTA</b>
          <label class="sub" for="notes-private-${p.id}">Notas</label>
          <textarea id="notes-private-${p.id}" rows="4" placeholder="Notas por paciente...">${escapeHtml(p.notes || "")}</textarea>
          <div class="actions">
            <button class="btn small primary" data-save-notes data-scope="private" data-id="${p.id}" type="button">Guardar nota</button>
          </div>
        </div>

        <div class="box">
          <b>ACC</b>
          <div class="sub">Recomendación: usa códigos, no nombres reales, si no hay autenticación.</div>
        </div>
      </div>
    `;
    privateList.appendChild(el);
  });

  // bind delete
  privateList.querySelectorAll("[data-del-priv]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del-priv");
      if (confirm("¿Borrar este paciente Privado?")) {
        state.private = state.private.filter(x => x.id !== id);
        saveAndRender();
      }
    });
  });

  privateList.querySelectorAll("[data-addpending]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-addpending");
      const p = state.private.find(x => x.id === id);
      if (!p) return;
      const today = todayYMD();
      const existing = p.recoveries.find(r => r.date === today);
      if (existing) existing.count += 1;
      else p.recoveries.push({ date: today, count: 1 });
      p.recoveries.sort((a,b) => (a.date > b.date ? 1 : -1));
      saveAndRender();
    });
  });

  privateList.querySelectorAll("[data-subpending]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-subpending");
      const p = state.private.find(x => x.id === id);
      if (!p || p.recoveries.length === 0) return;

      p.recoveries.sort((a,b) => (a.date > b.date ? 1 : -1));
      p.recoveries[0].count -= 1;
      if (p.recoveries[0].count <= 0) p.recoveries.shift();
      saveAndRender();
    });
  });

  // bind add recovery
  privateList.querySelectorAll("[data-addrec]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-addrec");
      const p = state.private.find(x => x.id === id);
      if (!p) return;

      const date = document.getElementById(`rec-date-${id}`).value;
      const count = Number(document.getElementById(`rec-count-${id}`).value);

      if (!date || !count || count <= 0) return;

      // merge if same date exists
      const existing = p.recoveries.find(r => r.date === date);
      if (existing) existing.count += count;
      else p.recoveries.push({ date, count });

      // sort by date asc
      p.recoveries.sort((a,b) => (a.date > b.date ? 1 : -1));

      document.getElementById(`rec-date-${id}`).value = "";
      document.getElementById(`rec-count-${id}`).value = "";

      saveAndRender();
    });
  });

  // bind "Recuperé 1" (quita 1 sesión del bloque más antiguo)
  privateList.querySelectorAll("[data-subrec]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-subrec");
      const p = state.private.find(x => x.id === id);
      if (!p || p.recoveries.length === 0) return;
      if (!confirm("¿Marcar una sesión como recuperada?")) return;

      // oldest first
      p.recoveries.sort((a,b) => (a.date > b.date ? 1 : -1));
      p.recoveries[0].count -= 1;
      if (p.recoveries[0].count <= 0) p.recoveries.shift();

      saveAndRender();
    });
  });

  bindNameEdits(privateList);
  bindNotesSave(privateList, "private");
  animateList(privateList);
}

function getOldestRecoveryDate(recs){
  if (!recs || recs.length === 0) return null;
  const sorted = [...recs].sort((a,b) => (a.date > b.date ? 1 : -1));
  return sorted[0].date || null;
}

function renderRecoveryMiniList(recs){
  if (!recs || recs.length === 0) return "—";
  return recs
    .slice()
    .sort((a,b) => (a.date > b.date ? 1 : -1))
    .map(r => `${formatDMY(r.date)}: ${Number(r.count)||0}`)
    .join(" · ");
}

function renderRecoverySessionTags(recs){
  if (!recs || recs.length === 0) return "—";
  return recs
    .slice()
    .sort((a,b) => (a.date > b.date ? 1 : -1))
    .map(r => {
      const count = Number(r.count) || 0;
      const countLabel = count > 1 ? ` ×${count}` : "";
      return `<span class="summarySession">${formatDMY(r.date)}${countLabel}</span>`;
    })
    .join("");
}

function renderSummarySection({ key, title, count, cardsHtml }){
  if (!cardsHtml || !cardsHtml.trim()) return "";
  return `
    <div class="summarySection" data-summary-section="${key}">
      <div class="summarySectionHeader">
        <h3>${title}</h3>
        <span class="countPill">${count}</span>
      </div>
      <div class="summarySectionDivider"></div>
      ${cardsHtml}
    </div>
  `;
}

function renderSummary(){
  const query = summarySearch.value.trim().toLowerCase();
  const matchesQuery = (name) => !query || name.toLowerCase().includes(query);
  const today = todayYMD();
  const monthKey = getMonthKey(new Date());
  const isOverdue = (due) => dayDiff(today, due) < 0;
  const isSoon = (due) => {
    const diff = dayDiff(today, due);
    return diff !== null && diff >= 0 && diff <= 14;
  };
  const matchesFilter = (item) => {
    if (summaryFilter === "all") return true;
    if (summaryFilter === "cait") return item.scope === "CAIT";
    if (summaryFilter === "private") return item.scope === "Privado";
    if (summaryFilter === "overdue") return item.due && isOverdue(item.due);
    if (summaryFilter === "soon") return item.due && isSoon(item.due);
    if (summaryFilter === "missing") return !item.due;
    if (summaryFilter === "thismonth") return true;
    return true;
  };

  const items = [];
  const privateItems = [];
  const missing = [];
  let missingCount = 0;
  const caitMonthAttention = [];
  const caitMonthOk = [];
  const privateDebt = [];

  // CAIT items: next due for PIAT/ENT/FAM
  state.cait.forEach(p => {
    const nextPIAT = p.lastPIAT ? addMonths(p.lastPIAT, 6) : null;
    const nextENT  = p.lastENT ? addMonths(p.lastENT, 1) : null;
    const nextFAM  = p.lastFAM ? addMonths(p.lastFAM, 3) : null;

    const entries = [
      { label: "ENT", due: nextENT },
      { label: "PIAT", due: nextPIAT },
      { label: "FAM", due: nextFAM }
    ];
    const dueDates = entries.map(entry => entry.due).filter(Boolean).sort((a,b) => (a > b ? 1 : -1));
    const hasAnyDue = dueDates.length > 0;

    entries.forEach(entry => {
      if (!entry.due) {
        missingCount += 1;
        missing.push({
          patient: p.name,
          scope: "CAIT",
          kind: entry.label,
          due: null,
          extra: "Sin fecha",
          source: p
        });
      }
    });

    if (hasAnyDue) {
      items.push({
        patient: p.name,
        scope: "CAIT",
        kind: "CAIT",
        due: dueDates[0],
        entries,
        source: p
      });
    }

    const monthTodo = getCaitMonthTodo(p, monthKey);
    const monthEntry = {
      patient: p.name,
      scope: "CAIT",
      monthTodo,
      entries,
      source: p
    };
    if (monthTodo.ok) caitMonthOk.push(monthEntry);
    else caitMonthAttention.push(monthEntry);
  });

  // PRIVADO items: listado de fechas de sesiones (sin atrasos)
  state.private.forEach(p => {
    const oldest = getOldestRecoveryDate(p.recoveries);
    const totalPending = getPrivatePending(p);
    if (totalPending > 0) {
      privateItems.push({
        patient: p.name,
        scope: "Privado",
        kind: "RECUP",
        due: oldest,
        extra: `${totalPending} pend.`,
        recoveries: p.recoveries
      });
    }

    if (totalPending > 0) {
      privateDebt.push({
        patient: p.name,
        scope: "Privado",
        totalPending,
        recoveries: p.recoveries
      });
    }
  });

  // Keep only items with a due date, because "sin fecha" no sirve para resumen global.
  const withDate = items.filter(it => !!it.due);

  // Sort by clinical priority then oldest last intervention
  withDate.sort((a,b) => {
    const aInfo = getCaitPriorityInfo(a.source, monthKey);
    const bInfo = getCaitPriorityInfo(b.source, monthKey);
    return comparePriorityRecords(
      { priority: aInfo.priority, last: aInfo.last, name: a.patient },
      { priority: bInfo.priority, last: bInfo.last, name: b.patient }
    );
  });

  // Stats
  const overdue = withDate.filter(it => dayDiff(today, it.due) < 0).length;
  const soon = withDate.filter(it => {
    const d = dayDiff(today, it.due);
    return d !== null && d >= 0 && d <= 14;
  }).length;

  summaryStats.innerHTML = `
    <div class="pill"><b>${state.cait.length}</b> CAIT</div>
    <div class="pill"><b>${state.private.length}</b> Privado</div>
    <div class="pill"><b>${overdue}</b> atrasadas</div>
    <div class="pill"><b>${soon}</b> próximas (≤14d)</div>
    <div class="pill"><b>${missingCount}</b> sin fecha</div>
  `;

  // List
  summaryList.innerHTML = "";
  const hasMonthData = caitMonthAttention.length > 0 || caitMonthOk.length > 0 || privateDebt.length > 0;
  const hasDateData = withDate.length > 0 || missing.length > 0 || privateItems.length > 0;
  if (!hasMonthData && !hasDateData){
    summaryList.innerHTML = `<div class="hint">Aún no hay fechas suficientes para generar resumen.</div>`;
    return;
  }

  const showThisMonthOnly = summaryFilter === "thismonth";
  const showMonthSections = ["all", "cait", "private", "thismonth"].includes(summaryFilter);
  const showDateSections = !showThisMonthOnly;
  const monthMatchesFilter = (scope) => {
    if (summaryFilter === "cait") return scope === "CAIT";
    if (summaryFilter === "private") return scope === "Privado";
    if (summaryFilter === "thismonth") return scope === "CAIT" || scope === "Privado";
    return true;
  };

  const sections = {};
  const orderedKeys = ["attention", "ok", "privateDebt", "byDate", "missing"];

  if (showMonthSections) {
    const filteredAttention = caitMonthAttention
      .filter(it => matchesQuery(it.patient) && monthMatchesFilter(it.scope))
      .sort((a,b) => {
        const aInfo = getCaitPriorityInfo(a.source, monthKey);
        const bInfo = getCaitPriorityInfo(b.source, monthKey);
        return comparePriorityRecords(
          { priority: aInfo.priority, last: aInfo.last, name: a.patient },
          { priority: bInfo.priority, last: bInfo.last, name: b.patient }
        );
      });
    const filteredOk = caitMonthOk
      .filter(it => matchesQuery(it.patient) && monthMatchesFilter(it.scope))
      .sort((a,b) => {
        const aInfo = getCaitPriorityInfo(a.source, monthKey);
        const bInfo = getCaitPriorityInfo(b.source, monthKey);
        return comparePriorityRecords(
          { priority: aInfo.priority, last: aInfo.last, name: a.patient },
          { priority: bInfo.priority, last: bInfo.last, name: b.patient }
        );
      });
    const filteredDebt = privateDebt.filter(it => matchesQuery(it.patient) && monthMatchesFilter(it.scope));

    const attentionCards = filteredAttention.map(it => {
      const missingText = it.monthTodo.missingKinds.length
        ? `Falta fecha: ${it.monthTodo.missingKinds.join(", ")}`
        : "";
      const monthBadgeText = missingText
        ? `${missingText} · ${it.monthTodo.summaryText}`
        : it.monthTodo.summaryText;

      return `
        <div class="item summaryCard">
          <div class="summaryRow">
            <div>
              <div class="summaryTitle">${escapeHtml(it.patient)}</div>
              <div class="summaryMeta">${escapeHtml(it.scope)}</div>
            </div>
            <div class="summaryCaitGroup">
              <div class="summaryMini">
                <span class="summaryMiniLabel">Este mes</span>
                <span class="summaryMiniDate">${escapeHtml(monthBadgeText)}</span>
                <span class="badge"><span class="dot ${it.monthTodo.severity}"></span>${it.monthTodo.severity === "bad" ? "Pendiente" : "Revisar"}</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");

    sections.attention = renderSummarySection({
      key: "attention",
      title: "Atención este mes (CAIT)",
      count: filteredAttention.length,
      cardsHtml: attentionCards
    });

    if (!showThisMonthOnly) {
      const okCards = filteredOk.slice(0, 10).map(it => `
        <div class="item summaryCard">
          <div class="summaryRow">
            <div>
              <div class="summaryTitle">${escapeHtml(it.patient)}</div>
              <div class="summaryMeta">${escapeHtml(it.scope)}</div>
            </div>
            <div class="summaryCaitGroup">
              <div class="summaryMini">
                <span class="summaryMiniLabel">Este mes</span>
                <span class="summaryMiniDate">Todo al día</span>
                <span class="badge"><span class="dot ok"></span>OK</span>
              </div>
            </div>
          </div>
        </div>
      `).join("");
      const okNotice = filteredOk.length > 10
        ? `<div class="hint">Mostrando 10 de ${filteredOk.length}. Usa búsqueda para ver más.</div>`
        : "";
      sections.ok = renderSummarySection({
        key: "ok",
        title: "Todo al día (CAIT)",
        count: filteredOk.length,
        cardsHtml: `${okCards}${okNotice}`
      });
    }

    const debtCards = filteredDebt.map(it => `
      <div class="item summaryCard">
        <div class="summaryRow">
          <div>
            <div class="summaryTitle">${escapeHtml(it.patient)} · RECUP</div>
            <div class="summaryMeta">${escapeHtml(it.scope)} · ${it.totalPending} pend.</div>
          </div>
          <div class="summaryCaitGroup">
            <div class="summaryMini">
              <span class="summaryMiniLabel">Pendientes</span>
              <span class="summaryMiniDate">${it.totalPending}</span>
              <span class="badge"><span class="dot warn"></span>Deuda</span>
            </div>
          </div>
        </div>
      </div>
    `).join("");

    sections.privateDebt = renderSummarySection({
      key: "privateDebt",
      title: "Privados con deuda",
      count: filteredDebt.length,
      cardsHtml: debtCards
    });
  }

  if (showDateSections) {
    const dateItems = withDate
      .filter(it => matchesFilter(it) && matchesQuery(it.patient))
      .slice();
    const privateDateItems = privateItems.filter(it => matchesFilter(it) && matchesQuery(it.patient));

    const dateCards = dateItems.map(it => {
      if (it.kind === "CAIT") {
        const summaryEntries = it.entries.map(entry => {
          const st = statusFor(entry.due);
          return `
            <div class="summaryMini">
              <span class="summaryMiniLabel">${entry.label}</span>
              <span class="summaryMiniDate">${formatDMY(entry.due)}</span>
              <span class="badge"><span class="dot ${st.cls}"></span>${st.label}</span>
            </div>
          `;
        }).join("");
        return `
          <div class="item summaryCard">
            <div class="summaryRow">
              <div>
                <div class="summaryTitle">${escapeHtml(it.patient)}</div>
                <div class="summaryMeta">${escapeHtml(it.scope)}</div>
              </div>
              <div class="summaryCaitGroup">
                ${summaryEntries}
              </div>
            </div>
          </div>
        `;
      }
      const st = statusFor(it.due);
      return `
        <div class="item summaryCard">
          <div class="summaryRow">
            <div>
              <div class="summaryTitle">${escapeHtml(it.patient)} · ${escapeHtml(it.kind)}</div>
              <div class="summaryMeta">${escapeHtml(it.scope)}${it.extra ? " · " + escapeHtml(it.extra) : ""}</div>
            </div>
            <div class="summaryDue">
              <span class="badge"><span class="dot ${st.cls}"></span>${st.label}</span>
              <div class="summaryTitle">${formatDMY(it.due)}</div>
            </div>
          </div>
        </div>
      `;
    }).join("");

    const privateDateCards = privateDateItems.map(it => `
      <div class="item summaryCard">
        <div class="summaryRow">
          <div>
            <div class="summaryTitle">${escapeHtml(it.patient)} · ${escapeHtml(it.kind)}</div>
            <div class="summaryMeta">${escapeHtml(it.scope)}${it.extra ? " · " + escapeHtml(it.extra) : ""}</div>
          </div>
          <div class="summarySessions">${renderRecoverySessionTags(it.recoveries)}</div>
        </div>
      </div>
    `).join("");

    sections.byDate = renderSummarySection({
      key: "byDate",
      title: "Por fechas",
      count: dateItems.length + privateDateItems.length,
      cardsHtml: `${dateCards}${privateDateCards}`
    });

    const missingFiltered = missing
      .filter(it => matchesFilter(it) && matchesQuery(it.patient))
      .sort((a,b) => {
        const aPriority = getCaitPriorityFromKind(a.kind);
        const bPriority = getCaitPriorityFromKind(b.kind);
        return comparePriorityRecords(
          { priority: aPriority, last: getCaitLastByKind(a.source, a.kind), name: a.patient },
          { priority: bPriority, last: getCaitLastByKind(b.source, b.kind), name: b.patient }
        );
      });
    const missingCards = missingFiltered.map(it => `
      <div class="item summaryCard">
        <div class="summaryRow">
          <div>
            <div class="summaryTitle">${escapeHtml(it.patient)} · ${escapeHtml(it.kind)}</div>
            <div class="summaryMeta">${escapeHtml(it.scope)} · ${escapeHtml(it.extra)}</div>
          </div>
          <div class="summaryTitle">—</div>
        </div>
      </div>
    `).join("");

    sections.missing = renderSummarySection({
      key: "missing",
      title: "Pendientes de fecha",
      count: missingFiltered.length,
      cardsHtml: missingCards
    });
  }

  const keysToRender = summarySubFilter === "all" ? orderedKeys : [summarySubFilter];
  const renderedSections = keysToRender.map(key => sections[key]).filter(Boolean).join("");

  if (!renderedSections.trim()){
    summaryList.innerHTML = `<div class="hint">Sin resultados con los filtros actuales.</div>`;
    return;
  }

  summaryList.innerHTML = renderedSections;
  animateList(summaryList);
}

function makeSummaryItem(patientName, scope, kind, due){
  return { patient: patientName, scope, kind, due, extra: "" };
}

// =====================
// Storage
// =====================
function loadLocalState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { cait: [], private: [], lastUpdatedAt: null };
    const parsed = JSON.parse(raw);
    return hydrateState(parsed);
  }catch{
    return { cait: [], private: [], lastUpdatedAt: null };
  }
}

function saveState(){
  state.lastUpdatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (stateDocRef){
    return setDoc(stateDocRef, state);
  }
  return Promise.resolve();
}

function saveAndRender(){
  saveState();
  render();
  showToast("Guardado");
}

function animateList(container){
  if (!container) return;
  container.classList.remove("is-animating");
  void container.offsetWidth;
  container.classList.add("is-animating");
  setTimeout(() => container.classList.remove("is-animating"), 500);
}

function showToast(message){
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 1800);
}

function initFirebaseSync(){
  try{
    const config = getFirebaseConfig();
    if (!config) {
      console.warn("Firebase no se pudo inicializar: configuración incompleta.");
      return;
    }
    const app = initializeApp(config);
    firestore = getFirestore(app);
    stateDocRef = doc(firestore, FIREBASE_COLLECTION, FIREBASE_DOC_ID);
  }catch (error){
    console.warn("Firebase no se pudo inicializar.", error);
    return;
  }

  onSnapshot(stateDocRef, (snapshot) => {
    if (!snapshot.exists()) return;
    const remote = hydrateState(snapshot.data());
    if (shouldApplyRemote(remote)) {
      state = remote;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render();
    }
  }, (error) => {
    console.warn("Error al sincronizar con Firebase.", error);
  });
}

function shouldApplyRemote(remote){
  if (!remote.lastUpdatedAt) return false;
  if (!state.lastUpdatedAt) return true;
  return new Date(remote.lastUpdatedAt).getTime() > new Date(state.lastUpdatedAt).getTime();
}

function getFirebaseConfig(){
  const config = globalThis.FIREBASE_CONFIG ?? firebaseConfig;
  if (!config) return null;
  const values = Object.values(config);
  const hasPlaceholder = values.some(value => typeof value === "string" && value.startsWith("REEMPLAZAR_"));
  if (hasPlaceholder) return null;
  return config;
}

// =====================
// Small utils
// =====================
function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function normalizeName(value){
  return String(value ?? "").trim();
}

function isValidName(name){
  return name.length >= 2;
}

function hasDuplicate(name, scope){
  const list = scope === "cait" ? state.cait : state.private;
  return list.some(p => p.name.toLowerCase() === name.toLowerCase());
}

function bindNameEdits(container){
  container.querySelectorAll("[data-edit-name]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const scope = btn.getAttribute("data-scope");
      const list = scope === "cait" ? state.cait : state.private;
      const p = list.find(x => x.id === id);
      if (!p) return;
      const next = prompt("Nuevo nombre/código:", p.name);
      if (!next) return;
      const name = normalizeName(next);
      if (!isValidName(name)) return;
      if (list.some(x => x.id !== id && x.name.toLowerCase() === name.toLowerCase())){
        alert("Ya existe un paciente con ese nombre.");
        return;
      }
      p.name = name;
      saveAndRender();
    });
  });
}

function bindNotesSave(container, scope){
  container.querySelectorAll("[data-save-notes]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const list = scope === "cait" ? state.cait : state.private;
      const p = list.find(x => x.id === id);
      if (!p) return;
      const input = document.getElementById(`notes-${scope}-${id}`);
      p.notes = input ? input.value.trim() : "";
      saveAndRender();
    });
  });
}

function renderLastUpdated(){
  if (!lastUpdated) return;
  if (!state.lastUpdatedAt){
    lastUpdated.textContent = "Última actualización: —";
    return;
  }
  const d = new Date(state.lastUpdatedAt);
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth() + 1).padStart(2,"0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2,"0");
  const mi = String(d.getMinutes()).padStart(2,"0");
  lastUpdated.textContent = `Última actualización: ${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function hydrateState(parsed){
  const cait = Array.isArray(parsed.cait) ? parsed.cait : [];
  const priv = Array.isArray(parsed.private) ? parsed.private : [];
  return {
    cait: cait.map(p => ({
      id: p.id ?? makeId(),
      name: String(p.name ?? ""),
      notes: String(p.notes ?? ""),
      lastPIAT: p.lastPIAT ?? null,
      lastENT: p.lastENT ?? null,
      lastFAM: p.lastFAM ?? null
    })),
    private: priv.map(p => ({
      id: p.id ?? makeId(),
      name: String(p.name ?? ""),
      notes: String(p.notes ?? ""),
      recoveries: Array.isArray(p.recoveries) ? p.recoveries : []
    })),
    lastUpdatedAt: parsed.lastUpdatedAt ?? null
  };
}
