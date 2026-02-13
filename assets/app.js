"use strict";

async function loadJson(path, version) {
  const url = version ? `${path}?v=${encodeURIComponent(version)}` : path;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load ${path}: ${res.status} ${res.statusText}`);
  }

  return await res.json();
}

function normalizeString(value) {
  return String(value ?? "").trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function getImageCount(galleryIndex, missionId) {
  const list = galleryIndex?.byMission?.[missionId];
  return Array.isArray(list) ? list.length : 0;
}

function imageUrl(missionId, filename) {
  const v = lb.galleryIndex?.generatedAtUtc;
  const base = `images/${encodeURIComponent(missionId)}/${encodeURIComponent(filename)}`;
  return v ? `${base}?v=${encodeURIComponent(v)}` : base;
}

function deepLink(missionId, filename) {
  const params = new URLSearchParams();
  if (missionId) params.set("m", missionId);
  if (filename) params.set("img", filename);
  return `#${params.toString()}`;
}

function parseHash() {
  const raw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const params = new URLSearchParams(raw);
  const missionId = params.get("m");
  const filename = params.get("img");
  return { missionId, filename };
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }

  return arr;
}

function parseDateForSort(dateValue) {
  if (!dateValue) return 0;

  const s = String(dateValue);
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : 0;
}

function scrollThumbIntoView(thumbsEl, btnEl) {
  if (!thumbsEl || !btnEl) return;

  const cLeft = thumbsEl.scrollLeft;
  const cRight = cLeft + thumbsEl.clientWidth;

  const eLeft = btnEl.offsetLeft;
  const eRight = eLeft + btnEl.offsetWidth;

  const padding = Math.min(48, Math.floor(thumbsEl.clientWidth * 0.15));

  if (eRight > cRight - padding) {
    thumbsEl.scrollTo({
      left: Math.min(eLeft - padding, thumbsEl.scrollWidth),
      behavior: "smooth"
    });
    return;
  }

  if (eLeft < cLeft + padding) {
    thumbsEl.scrollTo({
      left: Math.max(eLeft - padding, 0),
      behavior: "smooth"
    });
  }
}

function enableDragScrollX(containerEl) {
  if (!containerEl) return;

  if (containerEl.dataset.dragScrollBound === "1") return;
  containerEl.dataset.dragScrollBound = "1";

  containerEl.addEventListener("dragstart", (e) => e.preventDefault());

  let mouseDown = false;
  let mouseDragged = false;
  let mouseStartX = 0;
  let mouseStartScrollLeft = 0;

  const mouseThresholdPx = 6;

  containerEl.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    mouseDown = true;
    mouseDragged = false;
    mouseStartX = e.clientX;
    mouseStartScrollLeft = containerEl.scrollLeft;
  });

  window.addEventListener("mousemove", (e) => {
    if (!mouseDown) return;

    const dx = e.clientX - mouseStartX;
    if (!mouseDragged && Math.abs(dx) >= mouseThresholdPx) mouseDragged = true;

    if (!mouseDragged) return;

    containerEl.scrollLeft = mouseStartScrollLeft - dx;
    e.preventDefault();
  }, { passive: false });

  window.addEventListener("mouseup", () => {
    if (!mouseDown) return;
    mouseDown = false;

    if (mouseDragged) {
      const swallowClickOnce = (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        containerEl.removeEventListener("click", swallowClickOnce, true);
      };
      containerEl.addEventListener("click", swallowClickOnce, true);
    }
  });

  let isPointerDown = false;
  let isDragging = false;
  let startX = 0;
  let startScrollLeft = 0;
  let pointerId = null;

  const pointerThresholdPx = 10;

  containerEl.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    if (e.button !== 0) return;

    isPointerDown = true;
    isDragging = false;
    startX = e.clientX;
    startScrollLeft = containerEl.scrollLeft;
    pointerId = e.pointerId;

    containerEl.setPointerCapture(e.pointerId);
  });

  containerEl.addEventListener("pointermove", (e) => {
    if (!isPointerDown) return;
    if (pointerId !== e.pointerId) return;

    const dx = e.clientX - startX;

    if (!isDragging) {
      if (Math.abs(dx) < pointerThresholdPx) return;
      isDragging = true;
    }

    containerEl.scrollLeft = startScrollLeft - dx;
    e.preventDefault();
  }, { passive: false });

  containerEl.addEventListener("pointerup", (e) => {
    if (!isPointerDown) return;
    if (pointerId !== e.pointerId) return;

    isPointerDown = false;

    try {
      containerEl.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (isDragging) {
      const swallowClickOnce = (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        containerEl.removeEventListener("click", swallowClickOnce, true);
      };
      containerEl.addEventListener("click", swallowClickOnce, true);
    }

    isDragging = false;
    pointerId = null;
  });

  containerEl.addEventListener("pointercancel", () => {
    isPointerDown = false;
    isDragging = false;
    pointerId = null;
  });
}

/* Lightbox state */
const lb = {
  missionsById: new Map(),
  galleryIndex: null,
  currentMissionId: null,
  currentIndex: 0,
  currentImageUrl: null
};

function openLightbox() {
  const d = document.getElementById("lightbox");
  if (!d.open) d.showModal();
}

function closeLightbox(updateHash) {
  const d = document.getElementById("lightbox");
  if (d.open) d.close();

  lb.currentMissionId = null;
  lb.currentIndex = 0;
  lb.currentImageUrl = null;

  if (updateHash) {
    history.replaceState(null, "", "#");
  }
}

function openCurrentImageInNewTab() {
  if (!lb.currentImageUrl) return;
  window.open(lb.currentImageUrl, "_blank", "noopener,noreferrer");
}

function setLightboxImage(missionId, index) {
  const files = lb.galleryIndex?.byMission?.[missionId];
  if (!Array.isArray(files) || files.length === 0) return;

  const safeIndex = ((index % files.length) + files.length) % files.length;
  lb.currentMissionId = missionId;
  lb.currentIndex = safeIndex;

  const file = files[safeIndex];
  const mission = lb.missionsById.get(missionId);

  const url = imageUrl(missionId, file);
  lb.currentImageUrl = url;

  document.getElementById("lightboxTitle").textContent = mission ? mission.name : "";
  document.getElementById("lightboxSubtitle").textContent = `${safeIndex + 1}/${files.length}`;

  const imgEl = document.getElementById("lightboxImg");
  imgEl.src = url;
  imgEl.title = "Click to open image in a new tab";

  document.getElementById("lightboxCaption").textContent = "";

  const thumbs = document.getElementById("lightboxThumbs");
  thumbs.innerHTML = files
    .map((fn, i) => {
      const active = i === safeIndex ? " is-active" : "";
      const src = imageUrl(missionId, fn);
      return `<button class="lbthumb${active}" type="button" data-idx="${i}" title=""><img loading="lazy" src="${src}" alt="" /></button>`;
    })
    .join("");

  enableDragScrollX(thumbs);

  thumbs.querySelectorAll("[data-idx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-idx"));
      setLightboxImage(missionId, idx);

      const activeBtn = thumbs.querySelector(".lbthumb.is-active");
      scrollThumbIntoView(thumbs, activeBtn);
    });
  });

  setTimeout(() => {
    const activeBtn = thumbs.querySelector(".lbthumb.is-active");
    scrollThumbIntoView(thumbs, activeBtn);
  }, 0);

  history.replaceState(null, "", deepLink(missionId, file));
}

function openMission(missionId, filename) {
  const files = lb.galleryIndex?.byMission?.[missionId];
  if (!Array.isArray(files) || files.length === 0) return;

  openLightbox();

  let idx = 0;
  if (filename) {
    const found = files.indexOf(filename);
    if (found >= 0) idx = found;
  }

  setLightboxImage(missionId, idx);
}

function setupLightboxUi() {
  document.getElementById("lightboxClose").addEventListener("click", () => closeLightbox(true));
  document.getElementById("lightboxPrev").addEventListener("click", () => setLightboxImage(lb.currentMissionId, lb.currentIndex - 1));
  document.getElementById("lightboxNext").addEventListener("click", () => setLightboxImage(lb.currentMissionId, lb.currentIndex + 1));

  document.getElementById("lightboxImg").addEventListener("click", (e) => {
    e.preventDefault();
    openCurrentImageInNewTab();
  });

  window.addEventListener("keydown", (e) => {
    const d = document.getElementById("lightbox");
    if (!d.open) return;

    if (e.key === "Escape") {
      e.preventDefault();
      closeLightbox(true);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setLightboxImage(lb.currentMissionId, lb.currentIndex - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setLightboxImage(lb.currentMissionId, lb.currentIndex + 1);
    }
  });

  const d = document.getElementById("lightbox");
  d.addEventListener("click", (e) => {
    if (e.target === d) closeLightbox(true);
  });

  d.addEventListener("close", () => {
    lb.currentMissionId = null;
    lb.currentIndex = 0;
    lb.currentImageUrl = null;
  });
}

/**
 * Homepage slideshow (fixed duration):
 * - fixed show time, fixed fade time
 * - Ken Burns duration can be driven from CSS via --slide-ms (optional)
 * - preload+decode before fade to avoid flashes
 */
function startHomepageSlideshow(galleryIndex) {
  const link = document.getElementById("slideshowLink");
  const a = document.getElementById("slideshowA");
  const b = document.getElementById("slideshowB");
  const captionTitleEl = document.getElementById("slideshowMissionName");
  const captionMetaEl = document.getElementById("slideshowMissionMeta");

  const allImages = Array.isArray(galleryIndex?.allImages) ? galleryIndex.allImages.slice() : [];
  if (allImages.length === 0) {
    link.style.display = "none";
    return;
  }

  shuffleInPlace(allImages);

  let current = null;
  let activeEl = a;
  let idx = 0;

  let timerId = null;
  let transitionToken = 0;
  let isTransitioning = false;

  const FADE_MS = 1800; // match CSS
  const SHOW_MS = 9000; // fixed "time between transitions"
  const BETWEEN_TRANSITIONS_MS = SHOW_MS;

  const setCaption = (entry) => {
    if (!captionTitleEl) return;

    const mission = lb.missionsById?.get(entry?.missionId);
    const missionName = mission?.name || entry?.missionId || "";
    captionTitleEl.textContent = missionName;

    // Hide meta line completely (no folder name, no counters)
    if (captionMetaEl) captionMetaEl.textContent = "";
  };

  const setLayerBg = (el, entry) => {
    el.style.backgroundImage = `url("${imageUrl(entry.missionId, entry.filename)}")`;
  };

  const preloadEntry = async (entry) => {
    const url = imageUrl(entry.missionId, entry.filename);

    const img = new Image();
    img.decoding = "async";

    const loaded = new Promise((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
    });

    img.src = url;
    const ok = await loaded;
    if (!ok) return;

    if (typeof img.decode === "function") {
      try {
        await img.decode();
      } catch {
        // ignore
      }
    }
  };

  const clearTimers = () => {
    if (timerId) window.clearTimeout(timerId);
    timerId = null;
  };

  const scheduleNext = (delayMs) => {
    if (timerId) window.clearTimeout(timerId);
    timerId = window.setTimeout(() => {
      void tick();
    }, delayMs);
  };

  const transitionTo = async (entry) => {
    if (isTransitioning) return;
    isTransitioning = true;

    const myToken = (transitionToken += 1);

    link.style.setProperty("--slide-ms", `${SHOW_MS}ms`);

    await preloadEntry(entry);
    if (myToken !== transitionToken) return;

    current = entry;
    setCaption(entry);
    link.href = deepLink(entry.missionId, entry.filename);

    const curEl = activeEl;
    const nextEl = activeEl === a ? b : a;

    nextEl.style.zIndex = "2";
    curEl.style.zIndex = "1";

    nextEl.classList.remove("is-animating");
    void nextEl.offsetWidth;

    setLayerBg(nextEl, entry);

    nextEl.classList.add("is-visible");
    nextEl.classList.add("is-animating");

    curEl.classList.remove("is-visible");

    activeEl = nextEl;

    window.setTimeout(() => {
      if (myToken !== transitionToken) return;

      curEl.classList.remove("is-animating");
      curEl.style.zIndex = "0";
      nextEl.style.zIndex = "1";

      isTransitioning = false;
      scheduleNext(BETWEEN_TRANSITIONS_MS);
    }, FADE_MS);
  };

  const tick = async () => {
    const entry = allImages[idx % allImages.length];
    idx += 1;
    await transitionTo(entry);
  };

  clearTimers();

  const first = allImages[0];
  preloadEntry(first).finally(() => {
    link.style.setProperty("--slide-ms", `${SHOW_MS}ms`);

    setLayerBg(a, first);

    a.style.zIndex = "1";
    b.style.zIndex = "0";

    a.classList.add("is-visible", "is-animating");
    b.classList.remove("is-visible", "is-animating");

    activeEl = a;
    current = first;
    setCaption(first);
    link.href = deepLink(first.missionId, first.filename);

    idx = 1;
    scheduleNext(BETWEEN_TRANSITIONS_MS);
  });

  link.addEventListener("click", (e) => {
    if (!current) return;
    e.preventDefault();
    window.location.hash = deepLink(current.missionId, current.filename);
  });

  window.addEventListener("beforeunload", () => {
    clearTimers();
  });
}

function setMissionsView(view) {
  const v = view === "grid" ? "grid" : "list";
  document.body.dataset.view = v;
  try {
    localStorage.setItem("missionsView", v);
  } catch {
    // ignore
  }
}

function getMissionsView() {
  try {
    const v = localStorage.getItem("missionsView");
    return v === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

function renderMissions(missions, galleryIndex, query) {
  const ul = document.getElementById("missionList");
  const status = document.getElementById("status");
  const isGrid = document.body.dataset.view === "grid";

  const q = normalizeString(query);

  const filtered = missions
    .slice()
    .sort((a, b) => {
      const ad = parseDateForSort(a?.date);
      const bd = parseDateForSort(b?.date);

      if (ad !== bd) return bd - ad;

      const an = String(a?.name ?? "");
      const bn = String(b?.name ?? "");
      const nameCmp = an.localeCompare(bn);
      if (nameCmp !== 0) return nameCmp;

      return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
    })
    .filter((m) => {
      const id = normalizeString(m.id);
      const name = normalizeString(m.name);
      return !q || id.includes(q) || name.includes(q);
    });

  status.textContent = `${filtered.length} mission(s)`;

  ul.innerHTML = filtered
    .map((m) => {
      const count = getImageCount(galleryIndex, m.id);
      const first = (galleryIndex?.byMission?.[m.id] || [])[0] || "";
      const href = deepLink(m.id, first);

      if (!isGrid) {
        const countText = `${count} image(s)`;
        const date = m.date ? `(${escapeHtml(m.date)})` : "";

        return `
          <li>
            <div class="missionRow">
              <div class="missionRow__left">
                <a href="${href}" data-open-mission="${escapeHtml(m.id)}">
                  <span class="missionRow__title">${escapeHtml(m.name)}</span>
                </a>
              </div>
              <div class="missionRow__right">
                <span class="missionRow__count">${escapeHtml(countText)}</span>
                ${date ? `<span class="missionRow__date">${date}</span>` : ""}
              </div>
            </div>
          </li>
        `;
      }

      const thumbUrl = first ? imageUrl(m.id, first) : "";
      const title = escapeHtml(m.name);
      const dateText = m.date ? escapeHtml(m.date) : "";

      return `
        <li>
          <div class="missionCard">
            <a class="missionCard__link" href="${href}" data-open-mission="${escapeHtml(m.id)}">
              <div class="missionCard__top">
                ${thumbUrl ? `<img class="missionCard__thumb" loading="lazy" src="${thumbUrl}" alt="" />` : ""}
                <div class="missionCard__count">${escapeHtml(String(count))}</div>
              </div>
              <div class="missionCard__meta">
                <div class="missionCard__title">${title}</div>
                ${dateText ? `<div class="missionCard__date">${dateText}</div>` : ""}
              </div>
            </a>
          </div>
        </li>
      `;
    })
    .join("");

  ul.querySelectorAll("[data-open-mission]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const missionId = a.getAttribute("data-open-mission");
      const first = lb.galleryIndex?.byMission?.[missionId]?.[0] ?? null;
      if (first) window.location.hash = deepLink(missionId, first);
    });
  });
}

async function main() {
  setupLightboxUi();

  const status = document.getElementById("status");
  status.textContent = "Loading...";

  const galleryIndex = await loadJson("data/gallery_index.json");
  const version = galleryIndex?.generatedAtUtc || String(Date.now());

  const missions = await loadJson("data/missions.json", version);

  lb.galleryIndex = galleryIndex;
  lb.missionsById = new Map((missions || []).filter((m) => m && m.id).map((m) => [m.id, m]));

  startHomepageSlideshow(galleryIndex);

  setMissionsView(getMissionsView());

  const search = document.getElementById("missionSearch");
  const rerender = () => renderMissions(missions, galleryIndex, search.value);

  const toggle = document.getElementById("viewToggle");
  toggle.addEventListener("click", () => {
    setMissionsView(document.body.dataset.view === "grid" ? "list" : "grid");
    rerender();
  });

  search.addEventListener("input", rerender);
  rerender();

  const { missionId, filename } = parseHash();
  if (missionId) openMission(missionId, filename);

  window.addEventListener("hashchange", () => {
    const { missionId: m, filename: f } = parseHash();
    if (!m) {
      closeLightbox(false);
      return;
    }

    openMission(m, f);
  });
}

main().catch((err) => {
  console.error(err);
  const status = document.getElementById("status");
  status.textContent = "Failed to load missions or gallery index. See console.";
});
