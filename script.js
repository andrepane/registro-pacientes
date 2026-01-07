window.tailwind = window.tailwind || {};
window.tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#195de6",
        "background-light": "#f6f6f8",
        "background-dark": "#111621",
        "surface-dark": "#1a1d24",
      },
      fontFamily: {
        display: ["Inter", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        full: "9999px",
      },
    },
  },
};

document.addEventListener("DOMContentLoaded", () => {
  const patientGrid = document.getElementById("patient-grid");
  const patientCards = () => Array.from(patientGrid.querySelectorAll("article"));
  const searchInput = document.getElementById("patient-search");
  const filterButtons = Array.from(document.querySelectorAll("[data-filter]"));
  const emptyState = document.getElementById("empty-state");
  const patientCount = document.getElementById("patient-count");
  const newPatientButton = document.getElementById("new-patient-button");
  const newPatientModal = document.getElementById("new-patient-modal");
  const newPatientForm = document.getElementById("new-patient-form");
  const newPatientClose = document.getElementById("new-patient-close");
  const newPatientCancel = document.getElementById("new-patient-cancel");
  const mobileMenu = document.getElementById("mobile-menu");
  const mobileMenuToggle = document.getElementById("mobile-menu-toggle");
  const mobileMenuClose = document.getElementById("mobile-menu-close");
  const mobileMenuBackdrop = document.getElementById("mobile-menu-backdrop");
  let activeFilter = "all";

  const statusLabels = {
    atraso: "Atraso",
    "este-mes": "Este mes",
    "al-dia": "Al día",
  };

  const statusBadgeClasses = {
    atraso: "bg-red-500/10 text-red-300 border-red-500/30",
    "este-mes": "bg-amber-500/10 text-amber-300 border-amber-500/30",
    "al-dia": "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  };

  const statusDotClasses = {
    atraso: "bg-red-500",
    "este-mes": "bg-amber-500",
    "al-dia": "bg-emerald-500",
  };

  const updateCount = () => {
    const visibleCards = patientCards().filter((card) => !card.classList.contains("hidden"));
    const total = visibleCards.length;
    patientCount.textContent = `${total} paciente${total === 1 ? "" : "s"} con acción`;
  };

  const updateEmptyState = () => {
    const hasVisible = patientCards().some((card) => !card.classList.contains("hidden"));
    emptyState.classList.toggle("hidden", hasVisible);
    emptyState.setAttribute("aria-hidden", hasVisible ? "true" : "false");
  };

  const applyFilters = () => {
    const query = searchInput.value.trim().toLowerCase();
    patientCards().forEach((card) => {
      const name = card.querySelector("p.text-white").textContent.toLowerCase();
      const status = card.dataset.status;
      const matchesQuery = !query || name.includes(query);
      const matchesStatus = activeFilter === "all" || status === activeFilter;
      card.classList.toggle("hidden", !(matchesQuery && matchesStatus));
    });
    updateEmptyState();
    updateCount();
  };

  const setActiveFilter = (filter) => {
    activeFilter = filter;
    filterButtons.forEach((button) => {
      const isActive = button.dataset.filter === filter;
      button.classList.toggle("ring-2", isActive);
      button.classList.toggle("ring-primary", isActive);
      button.classList.toggle("ring-offset-2", isActive);
      button.classList.toggle("ring-offset-[#111318]", isActive);
    });
    applyFilters();
  };

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => setActiveFilter(button.dataset.filter));
  });

  searchInput.addEventListener("input", applyFilters);

  patientGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action='toggle-done']");
    if (!button) return;
    const card = button.closest("article");
    const name = card.querySelector("p.text-white");
    const isCompleted = card.dataset.completed === "true";
    card.dataset.completed = (!isCompleted).toString();
    button.textContent = isCompleted ? "Hecho" : "Reabrir";
    button.classList.toggle("text-emerald-300", !isCompleted);
    button.classList.toggle("border-emerald-500/50", !isCompleted);
    name.classList.toggle("line-through", !isCompleted);
    name.classList.toggle("text-[#9da6b8]", !isCompleted);
  });

  const openModal = () => {
    newPatientModal.classList.remove("hidden");
    newPatientModal.classList.add("flex");
    newPatientModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("overflow-hidden");
    document.getElementById("patient-name").focus();
  };

  const closeModal = () => {
    newPatientModal.classList.add("hidden");
    newPatientModal.classList.remove("flex");
    newPatientModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("overflow-hidden");
    newPatientForm.reset();
  };

  newPatientButton.addEventListener("click", openModal);
  newPatientClose.addEventListener("click", closeModal);
  newPatientCancel.addEventListener("click", closeModal);
  newPatientModal.addEventListener("click", (event) => {
    if (event.target === newPatientModal) closeModal();
  });

  newPatientForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = document.getElementById("patient-name").value.trim();
    const code = document.getElementById("patient-id").value.trim();
    const type = document.getElementById("patient-type").value;
    const status = document.getElementById("patient-status").value;
    if (!name || !code) return;
    const initials = name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("");
    const card = document.createElement("article");
    card.className = "bg-surface-dark border border-[#292e38] rounded-xl p-5 flex flex-col gap-4";
    card.dataset.status = status;
    card.innerHTML = `
      <div class="flex items-start justify-between">
        <div class="flex items-center gap-3">
          <div class="size-10 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">${initials}</div>
          <div>
            <p class="text-white text-base font-semibold">${name}</p>
            <p class="text-[#9da6b8] text-xs">${code} · ${type}</p>
          </div>
        </div>
        <button class="text-[#9da6b8] hover:text-white text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#292e38] hover:border-emerald-500/50 hover:text-emerald-300 transition-colors" data-action="toggle-done" type="button">Hecho</button>
      </div>
      <div class="flex flex-wrap gap-2">
        <span class="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md border ${statusBadgeClasses[status]}">
          <span class="size-2 rounded-full ${statusDotClasses[status]}"></span>${statusLabels[status]}
        </span>
      </div>
      <p class="text-[#9da6b8] text-xs">Nuevo paciente agregado manualmente.</p>
    `;
    patientGrid.prepend(card);
    closeModal();
    applyFilters();
  });

  const toggleMenu = (open) => {
    const isOpen = open ?? mobileMenu.classList.contains("translate-x-0");
    if (isOpen) {
      mobileMenu.classList.remove("translate-x-0");
      mobileMenu.classList.add("translate-x-[-100%]");
      mobileMenuBackdrop.classList.add("hidden");
      mobileMenu.setAttribute("aria-hidden", "true");
      mobileMenuToggle.setAttribute("aria-expanded", "false");
    } else {
      mobileMenu.classList.add("translate-x-0");
      mobileMenu.classList.remove("translate-x-[-100%]");
      mobileMenuBackdrop.classList.remove("hidden");
      mobileMenu.setAttribute("aria-hidden", "false");
      mobileMenuToggle.setAttribute("aria-expanded", "true");
    }
  };

  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener("click", () => toggleMenu(false));
  }

  if (mobileMenuClose) {
    mobileMenuClose.addEventListener("click", () => toggleMenu(true));
  }

  if (mobileMenuBackdrop) {
    mobileMenuBackdrop.addEventListener("click", () => toggleMenu(true));
  }

  setActiveFilter("all");
});
