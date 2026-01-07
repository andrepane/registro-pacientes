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
  renderLastUpdated();
}

function renderCait(){
  caitList.innerHTML = "";

  const query = caitSearch.value.trim().toLowerCase();
  const list = query
    ? state.cait.filter(p => p.name.toLowerCase().includes(query))
    : state.cait;

  if (list.length === 0){
    caitList.innerHTML = `<div class="hint">No hay pacientes CAIT aún.</div>`;
    return;
  }

  list.forEach(p => {
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
  const missing = [];
  let missingCount = 0;

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
        if (!hasAnyDue) {
          missing.push({
            patient: p.name,
            scope: "CAIT",
            kind: entry.label,
            due: null,
            extra: "Sin fecha"
          });
        }
      }
    });

    if (hasAnyDue) {
      items.push({
        patient: p.name,
        scope: "CAIT",
        kind: "CAIT",
        due: dueDates[0],
        entries
      });
    }
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
    <div class="pill"><b>${missingCount}</b> sin fecha</div>
  `;

  // List
  summaryList.innerHTML = "";
  if (withDate.length === 0 && missing.length === 0){
    summaryList.innerHTML = `<div class="hint">Aún no hay fechas suficientes para generar resumen.</div>`;
    return;
  }

  withDate.forEach(it => {
    const row = document.createElement("div");
    row.className = "item";
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
      row.innerHTML = `
        <div class="summaryRow">
          <div>
            <div class="summaryTitle">${escapeHtml(it.patient)}</div>
            <div class="summaryMeta">${escapeHtml(it.scope)}</div>
          </div>
          <div class="summaryCaitGroup">
            ${summaryEntries}
          </div>
        </div>
      `;
    } else {
      const st = statusFor(it.due);
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
    }
    summaryList.appendChild(row);
  });

  if (missing.length > 0){
    const divider = document.createElement("div");
    divider.className = "hint";
    divider.textContent = "Pendientes de fecha";
    summaryList.appendChild(divider);
    missing.forEach(it => {
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <div class="summaryRow">
          <div>
            <div class="summaryTitle">${escapeHtml(it.patient)} · ${escapeHtml(it.kind)}</div>
            <div class="summaryMeta">${escapeHtml(it.scope)} · ${escapeHtml(it.extra)}</div>
          </div>
          <div class="summaryTitle">—</div>
        </div>
      `;
      summaryList.appendChild(row);
    });
  }
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
