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

  let stories = [];
  let availableCityFilters = [];
  let availableConnectionFilters = [];
  const selectedCityKeys = new Set();
  const selectedConnectionIds = new Set();

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

    stories = parsedStories;
    availableCityFilters = buildAvailableCityFilters(stories);
    availableConnectionFilters = buildAvailableConnectionFilters(stories);

    renderFilters();
    renderGrid();
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

    grid.innerHTML = visibleStories.map(story => `
      <article class="story-tile story-size-${SiteData.escapeAttr(story.size)}" id="${SiteData.escapeAttr(story.anchorId)}" style="--storyAccent:${SiteData.escapeAttr(story.themeColor)};" data-story-tile>
        <div class="story-tile-card" tabindex="0" role="button" aria-label="Reveal details for ${SiteData.escapeAttr(story.title)}" data-story-card>
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

    grid.addEventListener("keydown", event => {
      const card = event.target.closest("[data-story-card]");
      if (!card || !grid.contains(card)) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      const tile = card.closest("[data-story-tile]");
      if (!tile) return;
      setStoryCardFlipped(tile, !tile.classList.contains("is-flipped"));
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
    bindPageInteractions();
    scrollToHashTarget({ behavior: "auto" });
  }

  function matchesFilters(story) {
    const cityMatch = !selectedCityKeys.size || story.relatedCities.some(city => selectedCityKeys.has(city.key));
    const connectionMatch = !selectedConnectionIds.size || story.relatedConnections.some(connection => selectedConnectionIds.has(connection.id));
    return cityMatch && connectionMatch;
  }

  function buildAvailableCityFilters(items) {
    const cityMap = new Map();
    items.forEach(story => {
      story.relatedCities.forEach(city => {
        if (!cityMap.has(city.key)) {
          cityMap.set(city.key, {
            id: city.key,
            label: city.city
          });
        }
      });
    });

    return Array.from(cityMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  function buildAvailableConnectionFilters(items) {
    const connectionMap = new Map();
    items.forEach(story => {
      story.relatedConnections.forEach(connection => {
        if (!connectionMap.has(connection.id)) {
          connectionMap.set(connection.id, {
            id: connection.id,
            label: connection.title
          });
        }
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
    document.querySelectorAll(".story-tile.is-flipped").forEach(tile => {
      tile.classList.remove("is-flipped");
    });
  });

  function applyInteractionMode() {
    const useHoverFlip = hoverFlipQuery.matches;
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
});
