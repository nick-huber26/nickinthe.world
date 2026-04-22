document.addEventListener("DOMContentLoaded", () => {
  const LOCAL_CITIES_CSV = "data/cities.csv";
  const LOCAL_CONNECTIONS_CSV = "data/connections.csv";
  const LOCAL_STORIES_CSV = "data/stories.csv";
  const qs = new URLSearchParams(window.location.search);

  const grid = document.getElementById("storiesGrid");
  const storyCountEl = document.getElementById("storyCount");
  const cityFiltersEl = document.getElementById("storyCityFilters");
  const connectionFiltersEl = document.getElementById("storyConnectionFilters");

  let stories = [];
  let availableCityFilters = [];
  let availableConnectionFilters = [];
  const selectedCityKeys = new Set();
  const selectedConnectionIds = new Set();

  async function loadStories() {
    const citiesCsvUrl = qs.get("citiesCsv") || LOCAL_CITIES_CSV;
    const connectionsCsvUrl = qs.get("connectionsCsv") || LOCAL_CONNECTIONS_CSV;
    const storiesCsvUrl = qs.get("storiesCsv") || LOCAL_STORIES_CSV;

    const [citiesResult, connectionsResult, storiesResult] = await Promise.all([
      SiteData.fetchTextWithFallback({
        primaryUrl: citiesCsvUrl,
        fallbackUrl: LOCAL_CITIES_CSV,
        primaryLabel: "Cities CMS",
        fallbackLabel: "Cities local fallback"
      }),
      SiteData.fetchTextWithFallback({
        primaryUrl: connectionsCsvUrl,
        fallbackUrl: LOCAL_CONNECTIONS_CSV,
        primaryLabel: "Connections CMS",
        fallbackLabel: "Connections local fallback"
      }),
      SiteData.fetchTextWithFallback({
        primaryUrl: storiesCsvUrl,
        fallbackUrl: LOCAL_STORIES_CSV,
        primaryLabel: "Stories CMS",
        fallbackLabel: "Stories local fallback"
      })
    ]);

    const parsedCities = SiteData.parseCitiesCsv(citiesResult.text, Papa);
    const parsedConnections = SiteData.parseConnectionsCsv(connectionsResult.text, Papa);
    const parsedStories = SiteData.parseStoriesCsv(storiesResult.text, Papa);

    SiteData.buildCrossReferenceState(parsedCities.visits, parsedCities.cities, parsedConnections);
    SiteData.buildStoryReferenceState(parsedStories, parsedCities.cities, parsedConnections);

    stories = parsedStories;
    availableCityFilters = buildAvailableCityFilters(stories);
    availableConnectionFilters = buildAvailableConnectionFilters(stories);

    renderFilters();
    renderGrid();
    bindPageInteractions();
  }

  function renderGrid() {
    if (!stories.length) {
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
      <article class="story-tile story-size-${SiteData.escapeAttr(story.size)}" id="${SiteData.escapeAttr(story.anchorId)}" style="--storyAccent:${SiteData.escapeAttr(story.themeColor)};">
        <div class="story-tile-card" tabindex="0" role="button" aria-label="Reveal details for ${SiteData.escapeAttr(story.title)}" data-story-card>
          <div class="story-tile-face story-tile-front">
            <div class="story-tile-media">
              ${buildFrontMedia(story)}
            </div>
          </div>
          <div class="story-tile-face story-tile-back">
            <div class="story-tile-back-inner">
              <div class="story-chip-row">
                ${story.relatedCities.map(city => `
                  <a class="story-chip story-chip-city" href="cities.html#city-${SiteData.escapeAttr(city.key)}">${SiteData.escapeHtml(city.city)}</a>
                `).join("")}
                ${story.relatedConnections.map(connection => `
                  <a class="story-chip story-chip-connection" href="connections.html#${SiteData.escapeAttr(connection.anchorId)}">${SiteData.escapeHtml(connection.title)}</a>
                `).join("")}
              </div>
              <div class="story-back-copy">
                <h2>${SiteData.escapeHtml(story.title)}</h2>
                <div class="story-back-text">
                  ${SiteData.splitParagraphs(story.body || story.summary).map(paragraph => `<p>${SiteData.escapeHtml(paragraph)}</p>`).join("") || '<p>Add story text in the <code>body</code> or <code>summary</code> column of data/stories.csv.</p>'}
                </div>
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
    const clearLabel = selectedSet.size ? "Clear filters" : "Clear filter";
    return `
      <button class="story-filter-chip story-filter-chip-clear" type="button" data-clear-filter="${type}">${clearLabel}</button>
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

    grid.querySelectorAll("[data-story-card]").forEach(card => {
      card.addEventListener("click", event => {
        if (event.target.closest("a")) return;
        card.classList.toggle("is-flipped");
      });

      card.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        card.classList.toggle("is-flipped");
      });
    });
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
    const primaryImage = story.images[0];
    if (!primaryImage) {
      return `<div class="empty-media">${SiteData.escapeHtml(story.title)}</div>`;
    }

    return `<img loading="lazy" src="${SiteData.escapeAttr(primaryImage)}" alt="${SiteData.escapeAttr(story.imageAlt || story.title)}">`;
  }

  loadStories().catch(error => {
    console.error(error);
    availableCityFilters = [];
    availableConnectionFilters = [];
    renderFilters();
    grid.innerHTML = '<article class="story-tile story-tile-empty"><div class="story-tile-copy"><h2>Unable to load stories</h2><p>Check that <code>data/stories.csv</code>, <code>data/cities.csv</code>, and <code>data/connections.csv</code> are available to the page.</p></div></article>';
  });
});
