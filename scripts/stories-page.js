document.addEventListener("DOMContentLoaded", () => {
  const REMOTE_CITIES_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR3SXX_WeHF-GzeHKUdTHOnu69Nclo5YWhfZd7AvbRAe4tp63pcQqPk8768JdxQedf8Xvyj0OW-17vC/pub?gid=0&single=true&output=csv";
  const REMOTE_CONNECTIONS_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR3SXX_WeHF-GzeHKUdTHOnu69Nclo5YWhfZd7AvbRAe4tp63pcQqPk8768JdxQedf8Xvyj0OW-17vC/pub?gid=1903131448&single=true&output=csv";
  const REMOTE_STORIES_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR3SXX_WeHF-GzeHKUdTHOnu69Nclo5YWhfZd7AvbRAe4tp63pcQqPk8768JdxQedf8Xvyj0OW-17vC/pub?gid=1163359358&single=true&output=csv";
  const REMOTE_INSPIRATIONS_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR3SXX_WeHF-GzeHKUdTHOnu69Nclo5YWhfZd7AvbRAe4tp63pcQqPk8768JdxQedf8Xvyj0OW-17vC/pub?gid=1604551648&single=true&output=csv";
  const LOCAL_CITIES_CSV = "data/cities.csv";
  const LOCAL_CONNECTIONS_CSV = "data/connections.csv";
  const LOCAL_STORIES_CSV = "data/stories.csv";
  const LOCAL_INSPIRATIONS_CSV = "data/inspirations.csv";
  const qs = new URLSearchParams(window.location.search);

  const grid = document.getElementById("storiesGrid");
  const storyCountEl = document.getElementById("storyCount");
  const cityFiltersEl = document.getElementById("storyCityFilters");
  const connectionFiltersEl = document.getElementById("storyConnectionFilters");
  const hoverFlipQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
  const touchPreferredQuery = window.matchMedia("(hover: none), (pointer: coarse)");
  const mobileViewportQuery = window.matchMedia("(max-width: 720px)");

  let stories = [];
  let availableCityFilters = [];
  let availableConnectionFilters = [];
  let cityLabelByKey = new Map();
  let connectionLabelById = new Map();
  const selectedCityKeys = new Set();
  const selectedConnectionIds = new Set();
  let layoutGuardRaf = 0;

  applyInteractionMode();

  async function loadStories() {
    const citiesCsvUrl = qs.get("citiesCsv") || REMOTE_CITIES_CSV;
    const connectionsCsvUrl = qs.get("connectionsCsv") || REMOTE_CONNECTIONS_CSV;
    const storiesCsvUrl = qs.get("storiesCsv") || REMOTE_STORIES_CSV;
    const inspirationsCsvUrl = qs.get("inspirationsCsv") || REMOTE_INSPIRATIONS_CSV;

    const [citiesResult, connectionsResult, storiesResult, inspirationsResult] = await Promise.all([
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
      })
    ]);

    const parsedCities = SiteData.parseCitiesCsv(citiesResult.text, Papa);
    const parsedConnections = SiteData.parseConnectionsCsv(connectionsResult.text, Papa);
    const parsedStories = SiteData.parseStoriesCsv(storiesResult.text, Papa);
    const parsedInspirations = SiteData.parseInspirationsCsv(inspirationsResult.text, Papa);

    SiteData.buildCrossReferenceState(parsedCities.visits, parsedCities.cities, parsedConnections);
    SiteData.buildStoryReferenceState(parsedStories, parsedCities.cities, parsedConnections);
    SiteData.buildInspirationReferenceState(parsedInspirations, parsedCities.cities, parsedConnections, parsedStories);

    cityLabelByKey = new Map(parsedCities.cities.map(city => [city.key, city.city]));
    connectionLabelById = new Map(parsedConnections.map(connection => [connection.id, connection.title]));
    stories = parsedStories;
    availableCityFilters = buildAvailableCityFilters(stories);
    availableConnectionFilters = buildAvailableConnectionFilters(stories);

    renderFilters();
    renderGrid();
    scheduleLayoutGuard();
    bindPageInteractions();
    scrollToHashTarget();
  }

  function renderGrid() {
    if (!stories.length) {
      storyCountEl.textContent = "0";
      grid.innerHTML = '<article class="story-tile story-tile-empty"><div class="story-tile-copy"><h2>No stories found</h2><p>Add rows to <code>data/stories.csv</code> to populate this gallery.</p></div></article>';
      return;
    }

    const visibleStories = stories.filter(matchesFilters);
    storyCountEl.textContent = String(visibleStories.length);

    if (!visibleStories.length) {
      grid.innerHTML = '<article class="story-tile story-tile-empty"><div class="story-tile-copy"><h2>No matching stories</h2><p>Clear the filters to see all story tiles again.</p></div></article>';
      return;
    }

    const usePackedLayout = selectedCityKeys.size === 0 && selectedConnectionIds.size === 0;
    const storiesForLayout = usePackedLayout ? buildPackedStoryOrder(visibleStories) : visibleStories;

    grid.innerHTML = storiesForLayout.map(story => `
      <article class="story-tile story-size-${SiteData.escapeAttr(story.size)}" id="${SiteData.escapeAttr(story.anchorId)}" style="--storyAccent:${SiteData.escapeAttr(story.themeColor)};" data-story-tile>
        <div class="story-tile-card" data-story-card>
          <div class="story-tile-face story-tile-front">
            ${buildFrontMedia(story)}
            <button class="story-mobile-toggle story-mobile-toggle-front" type="button" data-story-flip>
              Flip
            </button>
          </div>
          <div class="story-tile-face story-tile-back">
            <div class="story-tile-back-inner">
              <div class="story-back-actions">
                <button class="story-mobile-toggle story-mobile-toggle-back" type="button" data-story-unflip>
                  Back
                </button>
              </div>
              <div class="story-back-copy">
                ${story.dateLabel ? `<div class="story-back-date">${SiteData.escapeHtml(story.dateLabel)}</div>` : ""}
                <h2>${SiteData.escapeHtml(story.title)}</h2>
                <div class="story-back-text">
                  ${SiteData.splitParagraphs(story.body || story.summary).map(paragraph => `<p>${SiteData.escapeHtml(paragraph)}</p>`).join("") || '<p>Add story text in the <code>body</code> or <code>summary</code> column of data/stories.csv.</p>'}
                </div>
              </div>
              <div class="story-chip-row">
                ${story.relatedCities.map(city => `
                  <a class="story-chip story-chip-city" href="cities.html#city-${SiteData.escapeAttr(city.key)}">${SiteData.escapeHtml(city.city)}</a>
                `).join("")}
                ${story.relatedConnections.map(connection => `
                  <a class="story-chip story-chip-connection" href="connections.html#${SiteData.escapeAttr(connection.anchorId)}">${SiteData.escapeHtml(connection.title)}</a>
                `).join("")}
                ${(story.relatedInspirations || []).map(inspiration => `
                  <a class="story-chip story-chip-inspiration" href="inspirations.html#${SiteData.escapeAttr(inspiration.anchorId)}">${SiteData.escapeHtml(inspiration.title)}</a>
                `).join("")}
              </div>
            </div>
          </div>
        </div>
      </article>
    `).join("");
    scheduleLayoutGuard();

  }

  function renderFilters() {
    cityFiltersEl.innerHTML = buildFilterMarkup({
      type: "city",
      items: availableCityFilters,
      selectedSet: selectedCityKeys
    });

    connectionFiltersEl.innerHTML = buildFilterMarkup({
      type: "connection",
      items: availableConnectionFilters,
      selectedSet: selectedConnectionIds
    });
  }

  function buildFilterMarkup({ type, items, selectedSet }) {
    return `
      <button class="story-filter-chip story-filter-chip-clear" type="button" data-clear-filter="${type}">Clear filter</button>
      ${!items.length ? `
        <span class="story-filter-chip story-filter-chip-empty" aria-disabled="true">No ${type} filters available</span>
      ` : ""}
      ${items.map(item => `
        <button
          class="story-filter-chip story-filter-chip-${type}${selectedSet.has(item.id) ? " is-selected" : ""}"
          type="button"
          data-filter-type="${type}"
          data-filter-id="${SiteData.escapeAttr(item.id)}"
        >
          ${SiteData.escapeHtml(item.label)}
        </button>
      `).join("")}
    `;
  }

  function bindPageInteractions() {
    cityFiltersEl.querySelectorAll("[data-filter-type], [data-clear-filter]").forEach(button => {
      button.addEventListener("click", handleFilterClick);
    });

    connectionFiltersEl.querySelectorAll("[data-filter-type], [data-clear-filter]").forEach(button => {
      button.addEventListener("click", handleFilterClick);
    });

    if (grid.dataset.storyInteractionsBound === "true") return;
    grid.dataset.storyInteractionsBound = "true";

    grid.addEventListener("click", event => {
      const tile = event.target.closest("[data-story-tile]");
      if (!tile || !grid.contains(tile)) return;

      if (event.target.closest("[data-story-flip]")) {
        event.preventDefault();
        setStoryCardFlipped(tile, true);
        return;
      }

      if (event.target.closest("[data-story-unflip]")) {
        event.preventDefault();
        setStoryCardFlipped(tile, false);
      }
    });

  }

  function setStoryCardFlipped(tile, nextState) {
    if (!tile) return;
    tile.classList.toggle("is-flipped", nextState);
  }

  function handleFilterClick(event) {
    const clearType = event.currentTarget.dataset.clearFilter;
    if (clearType) {
      clearFilter(clearType);
      return;
    }

    const filterType = event.currentTarget.dataset.filterType;
    const filterId = event.currentTarget.dataset.filterId;
    const selectedSet = filterType === "city" ? selectedCityKeys : selectedConnectionIds;

    if (selectedSet.has(filterId)) {
      selectedSet.delete(filterId);
    } else {
      selectedSet.add(filterId);
    }

    rerenderPage();
  }

  function clearFilter(type) {
    if (type === "city") {
      selectedCityKeys.clear();
    }

    if (type === "connection") {
      selectedConnectionIds.clear();
    }

    rerenderPage();
  }

  function rerenderPage() {
    renderFilters();
    renderGrid();
    scheduleLayoutGuard();
    bindPageInteractions();
    scrollToHashTarget({ behavior: "auto" });
  }

  function matchesFilters(story) {
    const cityMatch = !selectedCityKeys.size || (story.cityKeys || []).some(cityKey => selectedCityKeys.has(cityKey));
    const connectionMatch = !selectedConnectionIds.size || (story.connectionIds || []).some(connectionId => selectedConnectionIds.has(connectionId));
    return cityMatch && connectionMatch;
  }

  function buildAvailableCityFilters(items) {
    const cityMap = new Map();
    items.forEach(story => {
      (story.cityKeys || []).forEach(cityKey => {
        if (!cityKey || cityMap.has(cityKey)) return;
        cityMap.set(cityKey, {
          id: cityKey,
          label: cityLabelByKey.get(cityKey) || cityKey
        });
      });
    });

    return Array.from(cityMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  function buildAvailableConnectionFilters(items) {
    const connectionMap = new Map();
    items.forEach(story => {
      (story.connectionIds || []).forEach(connectionId => {
        if (!connectionId || connectionMap.has(connectionId)) return;
        connectionMap.set(connectionId, {
          id: connectionId,
          label: connectionLabelById.get(connectionId) || connectionId
        });
      });
    });

    return Array.from(connectionMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  function buildFrontMedia(story) {
    const image = (story.images || [])[0];
    if (!image) {
      return `
        <div class="story-tile-media">
          <div class="empty-media">${SiteData.escapeHtml(story.title)}</div>
        </div>
      `;
    }

    const imageStyle = [
      `--story-image-position-x:${SiteData.escapeAttr(story.imagePositionX || "50%")}`,
      `--story-image-position-y:${SiteData.escapeAttr(story.imagePositionY || "50%")}`,
      `--story-image-zoom:${SiteData.escapeAttr(story.imageZoom || 1)}`,
      `--story-image-fit:${SiteData.escapeAttr(story.imageFit || "cover")}`
    ].join(";");

    return `
      <div class="story-tile-media">
        <img
          class="story-front-image"
          loading="lazy"
          decoding="async"
          src="${SiteData.escapeAttr(image)}"
          alt="${SiteData.escapeAttr(story.imageAlt || story.title)}"
          style="${imageStyle}"
        >
      </div>
    `;
  }

  function buildPackedStoryOrder(items) {
    if (!items.length) return items;
    if (window.matchMedia("(max-width: 520px)").matches) {
      return items;
    }

    const remaining = [...items];
    const packed = [];
    const occupancy = [];
    const gridWidth = 4;

    while (remaining.length) {
      const hole = findFirstHole(occupancy, gridWidth);
      const fitting = remaining.filter(story => canPlaceStory(story, hole.x, hole.y, occupancy, gridWidth));

      if (!fitting.length) {
        markOccupied(occupancy, hole.x, hole.y, 1, 1);
        continue;
      }

      fitting.sort((a, b) => compareStoryPackingPriority(a, b, hole.width));
      const chosen = fitting[0];
      const { w, h } = storyTileUnits(chosen);
      markOccupied(occupancy, hole.x, hole.y, w, h);
      packed.push(chosen);
      remaining.splice(remaining.indexOf(chosen), 1);
    }

    if (packed.length !== items.length) {
      return items;
    }

    return packed;
  }

  function storyTileUnits(story) {
    if (story.size === "landscape") return { w: 2, h: 1 };
    if (story.size === "vertical") return { w: 1, h: 2 };
    return { w: 1, h: 1 };
  }

  function compareStoryPackingPriority(a, b, holeWidth) {
    const tileA = storyTileUnits(a);
    const tileB = storyTileUnits(b);
    const aExact = tileA.w === holeWidth ? 1 : 0;
    const bExact = tileB.w === holeWidth ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;

    const aArea = tileA.w * tileA.h;
    const bArea = tileB.w * tileB.h;
    if (aArea !== bArea) return aArea - bArea;

    const sizeRank = size => {
      if (size === "square") return 0;
      if (size === "landscape") return 1;
      return 2;
    };
    const rankDelta = sizeRank(a.size) - sizeRank(b.size);
    if (rankDelta !== 0) return rankDelta;

    if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
    return (a.sourceIndex || 0) - (b.sourceIndex || 0);
  }

  function findFirstHole(occupancy, gridWidth) {
    for (let y = 0; ; y += 1) {
      ensureRow(occupancy, y, gridWidth);
      for (let x = 0; x < gridWidth; x += 1) {
        if (occupancy[y][x]) continue;
        let width = 0;
        while (x + width < gridWidth && !occupancy[y][x + width]) width += 1;
        return { x, y, width };
      }
    }
  }

  function canPlaceStory(story, x, y, occupancy, gridWidth) {
    const { w, h } = storyTileUnits(story);
    if (x + w > gridWidth) return false;
    for (let row = y; row < y + h; row += 1) {
      ensureRow(occupancy, row, gridWidth);
      for (let col = x; col < x + w; col += 1) {
        if (occupancy[row][col]) return false;
      }
    }
    return true;
  }

  function markOccupied(occupancy, x, y, w, h) {
    for (let row = y; row < y + h; row += 1) {
      ensureRow(occupancy, row, 4);
      for (let col = x; col < x + w; col += 1) {
        occupancy[row][col] = true;
      }
    }
  }

  function ensureRow(occupancy, rowIndex, width) {
    if (occupancy[rowIndex]) return;
    occupancy[rowIndex] = Array.from({ length: width }, () => false);
  }

  function scrollToHashTarget(options = {}) {
    const hash = decodeURIComponent(window.location.hash || "").replace(/^#/, "");
    if (!hash) return;

    const target = document.getElementById(hash);
    if (!target) return;

    const { behavior = "smooth" } = options;
    target.scrollIntoView({ behavior, block: "start" });
  }

  loadStories().catch(error => {
    console.error(error);
    availableCityFilters = [];
    availableConnectionFilters = [];
    renderFilters();
    grid.innerHTML = '<article class="story-tile story-tile-empty"><div class="story-tile-copy"><h2>Unable to load stories</h2><p>Check that <code>data/stories.csv</code>, <code>data/cities.csv</code>, <code>data/connections.csv</code>, and <code>data/inspirations.csv</code> are available to the page.</p></div></article>';
  });

  window.addEventListener("hashchange", () => {
    scrollToHashTarget();
  });

  bindMediaQueryChange(hoverFlipQuery, () => {
    applyInteractionMode();
    scheduleLayoutGuard();
    document.querySelectorAll(".story-tile.is-flipped").forEach(tile => {
      tile.classList.remove("is-flipped");
    });
  });

  bindMediaQueryChange(touchPreferredQuery, () => {
    applyInteractionMode();
    scheduleLayoutGuard();
    document.querySelectorAll(".story-tile.is-flipped").forEach(tile => {
      tile.classList.remove("is-flipped");
    });
  });

  bindMediaQueryChange(mobileViewportQuery, () => {
    applyInteractionMode();
    scheduleLayoutGuard();
    document.querySelectorAll(".story-tile.is-flipped").forEach(tile => {
      tile.classList.remove("is-flipped");
    });
  });

  window.addEventListener("resize", scheduleLayoutGuard, { passive: true });

  function applyInteractionMode() {
    const useTouchControls = mobileViewportQuery.matches || touchPreferredQuery.matches || !hoverFlipQuery.matches;
    const useHoverFlip = !useTouchControls;
    document.body.classList.toggle("stories-hover-mode", useHoverFlip);
    document.body.classList.toggle("stories-touch-mode", !useHoverFlip);
  }

  function bindMediaQueryChange(query, handler) {
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", handler);
      return;
    }

    if (typeof query.addListener === "function") {
      query.addListener(handler);
    }
  }

  function scheduleLayoutGuard() {
    if (layoutGuardRaf) window.cancelAnimationFrame(layoutGuardRaf);
    layoutGuardRaf = window.requestAnimationFrame(() => {
      layoutGuardRaf = 0;
      applyLayoutGuard();
    });
  }

  function applyLayoutGuard() {
    const firstTile = grid?.querySelector(".story-tile:not(.story-tile-empty)");
    if (!firstTile) {
      document.body.classList.remove("stories-layout-fallback");
      return;
    }

    const tileHeight = firstTile.getBoundingClientRect().height;
    document.body.classList.toggle("stories-layout-fallback", tileHeight < 10);
  }
});
