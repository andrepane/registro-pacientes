// =====================
// Simple CAIT/Privado tracker (localStorage)
// =====================

const STORAGE_KEY = "cait_private_tracker_v1";

const state = loadState();

// Tabs
const tabs = document.querySelectorAll(".tab");
const sections = document.querySelectorAll("[data-section]");

tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    tabs.forEach(b => b.classList.toggle("active", b === btn));
    const view = btn.dataset.view;
    sections.forEach(sec => sec.classList.toggle("hidden", sec.dataset.section !== view));
    render();
  });
});

// Forms
const caitForm = document.getElementById("caitForm");
const caitName = document.getElementById("caitName");
const privateForm = document.getElementById("privateForm");
const privateName = document.getElementById("privateName");

caitForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = caitName.value.trim();
  if (!name) return;
  state.cait.push(makeCaitPatient(name));
  caitName.value = "";
  saveAndRender();
});

privateForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = privateName.value.trim();
  if (!name) return;
  state.private.push(makePrivatePatient(name));
  privateName.value = "";
  saveAndRender();
});

// Render targets
const caitList = document.getElementById("caitList");
const privateList = document.getElementById("privateList");
const summaryStats = document.getElementById("summaryStats");
const summaryList = document.getElementById("summaryList");

// Initial render
render();

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

// =====================
// Render
// =====================
function render(){
  renderCait();
  renderPrivate();
  renderSummary();
}

function renderCait(){
  caitList.innerHTML = "";

  if (state.cait.length === 0){
    caitList.innerHTML = `<div class="hint">No hay pacientes CAIT aún.</div>`;
    return;
  }

  state.cait.forEach(p => {
    const nextPIAT = p.lastPIAT ? addMonths(p.lastPIAT, 6) : null;
    const nextENT  = p.lastENT ? addMonths(p.lastENT, 1) : null;
    const nextFAM  = p.lastFAM ? addMonths(p.lastFAM, 3) : null;

    const stPIAT = statusFor(nextPIAT);
    const stENT  = statusFor(nextENT);
    const stFAM  = statusFor(nextFAM);

    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="itemHead">
        <div>
          <div class="name">${escapeHtml(p.name)}</div>
          <div class="sub">CAIT</div>
        </div>
        <button class="btn small" data-del-cait="${p.id}" type="button">Borrar</button>
      </div>

      <div class="grid3">
        ${caitBox("PIAT", p.lastPIAT, nextPIAT, stPIAT, "piat", p.id)}
        ${caitBox("ENT",  p.lastENT,  nextENT,  stENT,  "ent",  p.id)}
        ${caitBox("FAM",  p.lastFAM,  nextFAM,  stFAM,  "fam",  p.id)}
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

  if (state.private.length === 0){
    privateList.innerHTML = `<div class="hint">No hay pacientes Privado aún.</div>`;
    return;
  }

  state.private.forEach(p => {
    const totalPending = p.recoveries.reduce((sum, r) => sum + (Number(r.count)||0), 0);
    const oldest = getOldestRecoveryDate(p.recoveries);
    const st = statusFor(oldest); // si la fecha más antigua ya pasó, rojo

    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="itemHead">
        <div>
          <div class="name">${escapeHtml(p.name)}</div>
          <div class="sub">Privado</div>
        </div>
        <button class="btn small" data-del-priv="${p.id}" type="button">Borrar</button>
      </div>

      <div class="grid3">
        <div class="box">
          <b>RECUP</b>
          <div class="line"><span>Pendientes</span><span><strong>${totalPending}</strong></span></div>
          <div class="line"><span>Desde</span><span>${formatDMY(oldest)}</span></div>
          <div class="actions">
            <span class="badge"><span class="dot ${st.cls}"></span>${st.label}</span>
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
          <div class="sub">Este bloque es simple a propósito. Si quieres notas por paciente, lo añado.</div>
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

      saveAndRender();
    });
  });

  // bind "Recuperé 1" (quita 1 sesión del bloque más antiguo)
  privateList.querySelectorAll("[data-subrec]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-subrec");
      const p = state.private.find(x => x.id === id);
      if (!p || p.recoveries.length === 0) return;

      // oldest first
      p.recoveries.sort((a,b) => (a.date > b.date ? 1 : -1));
      p.recoveries[0].count -= 1;
      if (p.recoveries[0].count <= 0) p.recoveries.shift();

      saveAndRender();
    });
  });
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

function renderSummary(){
  const items = [];

  // CAIT items: next due for PIAT/ENT/FAM
  state.cait.forEach(p => {
    const nextPIAT = p.lastPIAT ? addMonths(p.lastPIAT, 6) : null;
    const nextENT  = p.lastENT ? addMonths(p.lastENT, 1) : null;
    const nextFAM  = p.lastFAM ? addMonths(p.lastFAM, 3) : null;

    items.push(makeSummaryItem(p.name, "CAIT", "PIAT", nextPIAT));
    items.push(makeSummaryItem(p.name, "CAIT", "ENT",  nextENT));
    items.push(makeSummaryItem(p.name, "CAIT", "FAM",  nextFAM));
  });

  // PRIVADO items: oldest recovery date (if any) + total pending
  state.private.forEach(p => {
    const oldest = getOldestRecoveryDate(p.recoveries);
    const totalPending = p.recoveries.reduce((sum, r) => sum + (Number(r.count)||0), 0);
    if (totalPending > 0) {
      items.push({
        patient: p.name,
        scope: "Privado",
        kind: "RECUP",
        due: oldest,
        extra: `${totalPending} pend.`
      });
    }
  });

  // Keep only items with a due date, because "sin fecha" no sirve para resumen global.
  const withDate = items.filter(it => !!it.due);

  // Sort by due date asc
  withDate.sort((a,b) => (a.due > b.due ? 1 : -1));

  // Stats
  const today = todayYMD();
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
  `;

  // List
  summaryList.innerHTML = "";
  if (withDate.length === 0){
    summaryList.innerHTML = `<div class="hint">Aún no hay fechas suficientes para generar resumen.</div>`;
    return;
  }

  withDate.forEach(it => {
    const st = statusFor(it.due);
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="summaryRow">
        <div>
          <div class="summaryTitle">${escapeHtml(it.patient)} · ${escapeHtml(it.kind)}</div>
          <div class="summaryMeta">${escapeHtml(it.scope)}${it.extra ? " · " + escapeHtml(it.extra) : ""}</div>
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <span class="badge"><span class="dot ${st.cls}"></span>${st.label}</span>
          <div class="summaryTitle">${formatDMY(it.due)}</div>
        </div>
      </div>
    `;
    summaryList.appendChild(row);
  });
}

function makeSummaryItem(patientName, scope, kind, due){
  return { patient: patientName, scope, kind, due, extra: "" };
}

// =====================
// Storage
// =====================
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { cait: [], private: [] };
    const parsed = JSON.parse(raw);
    return {
      cait: Array.isArray(parsed.cait) ? parsed.cait : [],
      private: Array.isArray(parsed.private) ? parsed.private : []
    };
  }catch{
    return { cait: [], private: [] };
  }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveAndRender(){
  saveState();
  render();
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
