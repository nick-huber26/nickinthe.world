document.addEventListener("DOMContentLoaded", () => {
  const REMOTE_CITIES_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR3SXX_WeHF-GzeHKUdTHOnu69Nclo5YWhfZd7AvbRAe4tp63pcQqPk8768JdxQedf8Xvyj0OW-17vC/pub?gid=0&single=true&output=csv";
  const REMOTE_CONNECTIONS_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR3SXX_WeHF-GzeHKUdTHOnu69Nclo5YWhfZd7AvbRAe4tp63pcQqPk8768JdxQedf8Xvyj0OW-17vC/pub?gid=1903131448&single=true&output=csv";
  const REMOTE_STORIES_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR3SXX_WeHF-GzeHKUdTHOnu69Nclo5YWhfZd7AvbRAe4tp63pcQqPk8768JdxQedf8Xvyj0OW-17vC/pub?gid=1163359358&single=true&output=csv";
  const REMOTE_INSPIRATIONS_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR3SXX_WeHF-GzeHKUdTHOnu69Nclo5YWhfZd7AvbRAe4tp63pcQqPk8768JdxQedf8Xvyj0OW-17vC/pub?gid=1604551648&single=true&output=csv";
  const LOCAL_CITIES_CSV = "data/cities.csv";
  const LOCAL_CONNECTIONS_CSV = "data/connections.csv";
  const LOCAL_STORIES_CSV = "data/stories.csv";
  const LOCAL_INSPIRATIONS_CSV = "data/inspirations.csv";
  const WALL_IMAGE_URL = "images/inspirations/brick-wall-nitw.jpg";
  const qs = new URLSearchParams(window.location.search);

  const shell = document.querySelector("[data-inspirations-shell]");
  const wallViewport = document.getElementById("wallViewport");
  const posterWall = document.getElementById("posterWall");
  const inspirationCountEl = document.getElementById("inspirationCount");
  const panel = document.getElementById("inspirationPanel");
  const panelContent = document.getElementById("panelContent");
  const closePanelButton = document.getElementById("closePanelButton");
  const zoomInButton = document.getElementById("zoomInButton");
  const zoomOutButton = document.getElementById("zoomOutButton");
  const resetWallButton = document.getElementById("resetWallButton");

  const wallState = {
    scale: 1,
    minScale: 0.2,
    maxScale: 2.4,
    translateX: 0,
    translateY: 0,
    width: 1800,
    height: 1200
  };

  let inspirations = [];
  let inspirationByAnchor = new Map();
  let activeInspirationId = "";
  let dragMoved = false;
  let dragPointerId = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOriginX = 0;
  let dragOriginY = 0;
  let pointerDownPosterId = "";
  let pointerIsActive = false;
  let pointerHasCapture = false;
  let wallImageMetrics = {
    width: 1800,
    height: 1200
  };

  async function loadInspirations() {
    const citiesCsvUrl = qs.get("citiesCsv") || REMOTE_CITIES_CSV;
    const connectionsCsvUrl = qs.get("connectionsCsv") || REMOTE_CONNECTIONS_CSV;
    const storiesCsvUrl = qs.get("storiesCsv") || REMOTE_STORIES_CSV;
    const inspirationsCsvUrl = qs.get("inspirationsCsv") || REMOTE_INSPIRATIONS_CSV;

    const [citiesResult, connectionsResult, storiesResult, inspirationsResult, wallMetrics] = await Promise.all([
      SiteData.fetchTextWithFallback({
        primaryUrl: citiesCsvUrl,
        fallbackUrl: LOCAL_CITIES_CSV,
        primaryLabel: citiesCsvUrl === REMOTE_CITIES_CSV ? "Cities: Google Sheet CMS" : "Cities: Override source",
        fallbackLabel: "Cities local fallback"
      }),
      SiteData.fetchTextWithFallback({
        primaryUrl: connectionsCsvUrl,
        fallbackUrl: LOCAL_CONNECTIONS_CSV,
        primaryLabel: connectionsCsvUrl === REMOTE_CONNECTIONS_CSV ? "Connections: Google Sheet CMS" : "Connections: Override source",
        fallbackLabel: "Connections local fallback"
      }),
      SiteData.fetchTextWithFallback({
        primaryUrl: storiesCsvUrl,
        fallbackUrl: LOCAL_STORIES_CSV,
        primaryLabel: storiesCsvUrl === REMOTE_STORIES_CSV ? "Stories: Google Sheet CMS" : "Stories: Override source",
        fallbackLabel: "Stories local fallback"
      }),
      SiteData.fetchTextWithFallback({
        primaryUrl: inspirationsCsvUrl,
        fallbackUrl: LOCAL_INSPIRATIONS_CSV,
        primaryLabel: inspirationsCsvUrl === REMOTE_INSPIRATIONS_CSV ? "Inspirations: Google Sheet CMS" : "Inspirations: Override source",
        fallbackLabel: "Inspirations local fallback"
      }),
      loadWallImageMetrics()
    ]);

    const parsedCities = SiteData.parseCitiesCsv(citiesResult.text, Papa);
    const parsedConnections = SiteData.parseConnectionsCsv(connectionsResult.text, Papa);
    const parsedStories = SiteData.parseStoriesCsv(storiesResult.text, Papa);
    const parsedInspirations = SiteData.parseInspirationsCsv(inspirationsResult.text, Papa);

    SiteData.buildCrossReferenceState(parsedCities.visits, parsedCities.cities, parsedConnections);
    SiteData.buildStoryReferenceState(parsedStories, parsedCities.cities, parsedConnections);
    SiteData.buildInspirationReferenceState(parsedInspirations, parsedCities.cities, parsedConnections, parsedStories);

    inspirations = parsedInspirations;
    wallImageMetrics = wallMetrics;
    inspirationByAnchor = new Map(inspirations.map(inspiration => [inspiration.anchorId, inspiration]));
    inspirationCountEl.textContent = String(inspirations.length);

    renderWall();
    bindWallInteractions();
    openHashTarget();
  }

  function renderWall() {
    posterWall.style.backgroundImage = `url("${WALL_IMAGE_URL}")`;
    posterWall.style.backgroundRepeat = "no-repeat";
    posterWall.style.backgroundPosition = "center center";
    posterWall.style.backgroundSize = "100% 100%";

    if (!inspirations.length) {
      posterWall.style.width = `${wallImageMetrics.width}px`;
      posterWall.style.height = `${wallImageMetrics.height}px`;
      posterWall.innerHTML = `
        <article class="poster-card" style="left:240px; top:180px; width:280px; height:380px;">
          <div class="poster-frame">
            <div class="poster-media">
              <div class="poster-placeholder">Add rows to data/inspirations.csv to populate the wall.</div>
            </div>
          </div>
        </article>
      `;
      resetWall();
      return;
    }

    const layout = buildWallLayout(inspirations);
    wallState.width = layout.width;
    wallState.height = layout.height;
    posterWall.style.width = `${layout.width}px`;
    posterWall.style.height = `${layout.height}px`;

    posterWall.innerHTML = layout.items.map(item => {
      const image = item.images[0];
      return `
        <button
          class="poster-card${item.anchorId === activeInspirationId ? " is-active" : ""}"
          id="${SiteData.escapeAttr(item.anchorId)}"
          type="button"
          data-inspiration-id="${SiteData.escapeAttr(item.anchorId)}"
          style="left:${item.left}px; top:${item.top}px; width:${item.posterWidth}px; height:${item.posterHeight}px; --poster-accent:${SiteData.escapeAttr(item.themeColor)}; --poster-tilt:${SiteData.escapeAttr(item.tilt)}deg;"
          aria-label="Open inspiration ${SiteData.escapeAttr(item.title)}"
        >
          <div class="poster-media">
            ${image
              ? `<img loading="lazy" src="${SiteData.escapeAttr(image)}" alt="${SiteData.escapeAttr(item.imageAlt || item.title)}">`
              : `<div class="poster-placeholder">${SiteData.escapeHtml(item.title)}</div>`}
          </div>
        </button>
      `;
    }).join("");

    resetWall();
  }

  function buildWallLayout(items) {
    const padding = 220;
    const posterPositions = [];
    let maxRight = wallImageMetrics.width;
    let maxBottom = wallImageMetrics.height;

    items.forEach((item, index) => {
      const centerLeft = wallImageMetrics.width / 2 - item.posterWidth / 2;
      const centerTop = wallImageMetrics.height / 2 - item.posterHeight / 2;
      const left = centerLeft + item.posterCenterX;
      const top = centerTop + item.posterCenterY;
      const tilt = buildPosterTilt(index);

      posterPositions.push({
        ...item,
        left,
        top,
        tilt
      });

      maxRight = Math.max(maxRight, left + item.posterWidth + padding);
      maxBottom = Math.max(maxBottom, top + item.posterHeight + padding);
    });

    return {
      width: maxRight,
      height: maxBottom,
      items: posterPositions
    };
  }

  function buildPosterTilt(index) {
    const magnitude = 1 + (index % 5);
    const direction = index % 2 === 0 ? -1 : 1;
    return (direction * magnitude).toFixed(2);
  }

  function bindWallInteractions() {
    wallViewport.addEventListener("pointerdown", event => {
      pointerIsActive = true;
      dragMoved = false;
      pointerHasCapture = false;
      dragPointerId = event.pointerId;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      dragOriginX = wallState.translateX;
      dragOriginY = wallState.translateY;
      pointerDownPosterId = event.target.closest("[data-inspiration-id]")?.dataset.inspirationId || "";
    });

    wallViewport.addEventListener("pointermove", event => {
      if (!pointerIsActive || event.pointerId !== dragPointerId) return;
      const deltaX = event.clientX - dragStartX;
      const deltaY = event.clientY - dragStartY;
      if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) {
        dragMoved = true;
      }
      if (!dragMoved) return;
      if (!pointerHasCapture) {
        wallViewport.classList.add("is-dragging");
        wallViewport.setPointerCapture(event.pointerId);
        pointerHasCapture = true;
      }
      wallState.translateX = dragOriginX + deltaX;
      wallState.translateY = dragOriginY + deltaY;
      clampPan();
      applyWallTransform();
    });

    const stopDragging = event => {
      if (dragPointerId !== null && event.pointerId === dragPointerId && pointerHasCapture) {
        wallViewport.releasePointerCapture(event.pointerId);
      }
      const shouldOpenPoster = !dragMoved && pointerDownPosterId;
      pointerIsActive = false;
      pointerHasCapture = false;
      dragPointerId = null;
      pointerDownPosterId = "";
      wallViewport.classList.remove("is-dragging");
      if (shouldOpenPoster) {
        openPanel(shouldOpenPoster);
      }
    };

    wallViewport.addEventListener("pointerup", stopDragging);
    wallViewport.addEventListener("pointercancel", stopDragging);
    wallViewport.addEventListener("wheel", handleWheelZoom, { passive: false });
    wallViewport.addEventListener("keydown", handleViewportKeydown);
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && activeInspirationId) {
        closePanel();
      }
    });

    closePanelButton.addEventListener("click", closePanel);
    zoomInButton.addEventListener("click", () => zoomBy(1.14));
    zoomOutButton.addEventListener("click", () => zoomBy(1 / 1.14));
    resetWallButton.addEventListener("click", resetWall);

    window.addEventListener("resize", () => {
      clampPan();
      applyWallTransform();
    });

    window.addEventListener("hashchange", openHashTarget);
  }

  function handleWheelZoom(event) {
    event.preventDefault();
    const viewportRect = wallViewport.getBoundingClientRect();
    const anchorX = event.clientX - viewportRect.left;
    const anchorY = event.clientY - viewportRect.top;
    const zoomFactor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomBy(zoomFactor, anchorX, anchorY);
  }

  function handleViewportKeydown(event) {
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomBy(1.14);
      return;
    }

    if (event.key === "-") {
      event.preventDefault();
      zoomBy(1 / 1.14);
      return;
    }

    const step = 48;
    if (event.key === "ArrowLeft") wallState.translateX += step;
    if (event.key === "ArrowRight") wallState.translateX -= step;
    if (event.key === "ArrowUp") wallState.translateY += step;
    if (event.key === "ArrowDown") wallState.translateY -= step;
    clampPan();
    applyWallTransform();
  }

  function zoomBy(factor, anchorX, anchorY) {
    const viewportRect = wallViewport.getBoundingClientRect();
    const localAnchorX = Number.isFinite(anchorX) ? anchorX : viewportRect.width / 2;
    const localAnchorY = Number.isFinite(anchorY) ? anchorY : viewportRect.height / 2;
    const previousScale = wallState.scale;
    const minScale = getHeightLimitedMinScale();
    const nextScale = clampValue(previousScale * factor, minScale, wallState.maxScale);
    if (nextScale === previousScale) return;

    wallState.translateX = localAnchorX - ((localAnchorX - wallState.translateX) / previousScale) * nextScale;
    wallState.translateY = localAnchorY - ((localAnchorY - wallState.translateY) / previousScale) * nextScale;
    wallState.scale = nextScale;
    clampPan();
    applyWallTransform();
  }

  function resetWall() {
    const viewportRect = wallViewport.getBoundingClientRect();
    if (!viewportRect.width || !viewportRect.height) {
      window.requestAnimationFrame(resetWall);
      return;
    }

    const fitScale = Math.min(
      viewportRect.width / wallState.width,
      viewportRect.height / wallState.height
    );
    wallState.scale = clampValue(fitScale * 1.22, wallState.minScale, 1.24);
    wallState.translateX = (viewportRect.width - wallState.width * wallState.scale) / 2;
    wallState.translateY = (viewportRect.height - wallState.height * wallState.scale) / 2;
    clampPan();
    applyWallTransform();
  }

  function clampPan() {
    const viewportRect = wallViewport.getBoundingClientRect();
    const scaledWidth = wallState.width * wallState.scale;
    const scaledHeight = wallState.height * wallState.scale;

    const minX = scaledWidth > viewportRect.width ? viewportRect.width - scaledWidth - 120 : (viewportRect.width - scaledWidth) / 2;
    const maxX = scaledWidth > viewportRect.width ? 120 : (viewportRect.width - scaledWidth) / 2;
    const minY = scaledHeight > viewportRect.height ? viewportRect.height - scaledHeight - 120 : (viewportRect.height - scaledHeight) / 2;
    const maxY = scaledHeight > viewportRect.height ? 120 : (viewportRect.height - scaledHeight) / 2;

    wallState.translateX = clampValue(wallState.translateX, minX, maxX);
    wallState.translateY = clampValue(wallState.translateY, minY, maxY);
  }

  function applyWallTransform() {
    posterWall.style.transform = `translate(${wallState.translateX}px, ${wallState.translateY}px) scale(${wallState.scale})`;
  }

  function openPanel(anchorId) {
    const inspiration = inspirationByAnchor.get(anchorId);
    if (!inspiration) return;

    activeInspirationId = anchorId;
    shell.classList.add("panel-open");
    panel.setAttribute("aria-hidden", "false");
    window.history.replaceState(null, "", `#${anchorId}`);

    posterWall.querySelectorAll("[data-inspiration-id]").forEach(button => {
      button.classList.toggle("is-active", button.dataset.inspirationId === anchorId);
    });

    const image = inspiration.images[0];
    const allTagMarkup = [
      ...buildTagLinks(inspiration.relatedCities, city => `cities.html#city-${city.key}`, city => city.city, "tag-chip-city", true),
      ...buildTagLinks(inspiration.relatedStories, story => `stories.html#${story.anchorId}`, story => story.title, "tag-chip-story", true),
      ...buildTagLinks(inspiration.relatedConnections, connection => `connections.html#${connection.anchorId}`, connection => connection.title, "tag-chip-connection", true)
    ].join("");
    panelContent.innerHTML = `
      <div class="panel-stack">
        <div class="panel-tag-strip chip-row">
          ${allTagMarkup || `<span class="chip">No tags linked yet</span>`}
        </div>

        <div class="panel-hero">
          <div class="panel-poster panel-poster-compact">
            ${image
              ? `<img loading="lazy" src="${SiteData.escapeAttr(image)}" alt="${SiteData.escapeAttr(inspiration.imageAlt || inspiration.title)}">`
              : `<div class="poster-placeholder" style="--poster-accent:${SiteData.escapeAttr(inspiration.themeColor)};">${SiteData.escapeHtml(inspiration.title)}</div>`}
          </div>

          <div class="panel-header">
            <div class="panel-label">${SiteData.escapeHtml(inspiration.type || "Inspiration")}</div>
            <h2>${SiteData.escapeHtml(inspiration.title)}</h2>
            <div class="panel-meta-inline">
              <div class="panel-meta-inline-item">
                <div class="panel-label">Author</div>
                <strong>${SiteData.escapeHtml(inspiration.creator || "Creator not added yet")}</strong>
              </div>
              <div class="panel-meta-inline-item">
                <div class="panel-label">Published date</div>
                <strong>${SiteData.escapeHtml(inspiration.dateLabel || "Date not added yet")}</strong>
              </div>
            </div>
            ${inspiration.summary ? `<p class="panel-summary">${SiteData.escapeHtml(inspiration.summary)}</p>` : ""}
          </div>
        </div>

        <div class="panel-description">
          <div class="panel-tag-title">Description</div>
          ${SiteData.splitParagraphs(inspiration.description || inspiration.summary)
            .map(paragraph => `<p>${SiteData.escapeHtml(paragraph)}</p>`)
            .join("") || "<p>Add longer copy in the description column of data/inspirations.csv. The parser also accepts body.</p>"}
        </div>

        <div class="panel-footnote">
          <div class="panel-label">Date added</div>
          <strong>${SiteData.escapeHtml(inspiration.addedDateLabel || inspiration.addedDate || "Date not added yet")}</strong>
        </div>
      </div>
    `;
  }

  function buildTagLinks(items, hrefFn, labelFn, chipClass, asArray = false) {
    if (!items.length) {
      return asArray ? [] : `<span class="chip ${chipClass}">No tags linked yet</span>`;
    }

    const markup = items.map(item => `
      <a class="relation-chip ${chipClass}" href="${SiteData.escapeAttr(hrefFn(item))}">
        ${SiteData.escapeHtml(labelFn(item))}
      </a>
    `);

    return asArray ? markup : markup.join("");
  }

  function closePanel(options = {}) {
    const { preserveHistory = false } = options;
    activeInspirationId = "";
    shell.classList.remove("panel-open");
    panel.setAttribute("aria-hidden", "true");
    if (!preserveHistory) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    posterWall.querySelectorAll("[data-inspiration-id]").forEach(button => {
      button.classList.remove("is-active");
    });
  }

  function openHashTarget() {
    const hash = decodeURIComponent(window.location.hash || "").replace(/^#/, "");
    if (!hash) {
      closePanel({ preserveHistory: true });
      return;
    }
    if (!inspirationByAnchor.has(hash)) return;
    openPanel(hash);
  }

  function clampValue(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getHeightLimitedMinScale() {
    const viewportRect = wallViewport.getBoundingClientRect();
    if (!viewportRect.height || !wallState.height) {
      return wallState.minScale;
    }

    return Math.max(wallState.minScale, viewportRect.height / wallState.height);
  }

  function loadWallImageMetrics() {
    return new Promise(resolve => {
      const image = new window.Image();
      image.onload = () => {
        resolve({
          width: image.naturalWidth || 1800,
          height: image.naturalHeight || 1200
        });
      };
      image.onerror = () => resolve({ width: 1800, height: 1200 });
      image.src = WALL_IMAGE_URL;
    });
  }

  loadInspirations().catch(error => {
    console.error(error);
    posterWall.style.width = "1200px";
    posterWall.style.height = "900px";
    posterWall.innerHTML = `
      <article class="poster-card" style="left:200px; top:160px; width:320px; height:420px;">
        <div class="poster-frame">
          <div class="poster-media">
            <div class="poster-placeholder">Unable to load inspirations. Check data/inspirations.csv and the related CMS files.</div>
          </div>
        </div>
      </article>
    `;
    resetWall();
  });
});
