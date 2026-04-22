document.addEventListener("DOMContentLoaded", () => {
  const DEFAULT_CITIES_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRByIxtJ23p1SJ8ehZDmbx1jd3DOMTk38xoSqAQcKpIImgxu2zEw69N6_xooFbBf7VNo0yFC62bqR3p/pub?gid=1798659217&single=true&output=csv";
  const DEFAULT_CONNECTIONS_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQMEcBeB7RhPjNz68ETerPlME6noppDYGwXjKTCFoZfRNoBWM8Mzwydq47ZkkdWHffPj5zp0uE_s-JM/pub?gid=1798659217&single=true&output=csv";
  const LOCAL_CITIES_CSV = "data/cities.csv";
  const LOCAL_CONNECTIONS_CSV = "data/connections.csv";
  const LOCAL_STORIES_CSV = "data/stories.csv";
  const qs = new URLSearchParams(window.location.search);

  const grid = document.getElementById("connectionsGrid");
  const connectionCountEl = document.getElementById("connectionCount");
  const gridGalleryIntervals = new Map();
  let activeExpandedId = "";

  let connections = [];
  let connectionByAnchor = new Map();

  async function loadConnections() {
    const citiesCsvUrl = qs.get("citiesCsv") || LOCAL_CITIES_CSV;
    const connectionsCsvUrl = qs.get("connectionsCsv") || LOCAL_CONNECTIONS_CSV;
    const storiesCsvUrl = qs.get("storiesCsv") || LOCAL_STORIES_CSV;
    const remoteCitiesCsvUrl = SiteData.resolveCsvSource(DEFAULT_CITIES_SHEET_URL, LOCAL_CITIES_CSV);
    const remoteConnectionsCsvUrl = SiteData.resolveCsvSource(DEFAULT_CONNECTIONS_SHEET_URL, LOCAL_CONNECTIONS_CSV);

    const [citiesResult, connectionsResult, storiesResult] = await Promise.all([
      SiteData.fetchTextWithFallback({
        primaryUrl: citiesCsvUrl,
        fallbackUrl: citiesCsvUrl === LOCAL_CITIES_CSV ? remoteCitiesCsvUrl : LOCAL_CITIES_CSV,
        primaryLabel: citiesCsvUrl === LOCAL_CITIES_CSV ? "Cities: Local CMS" : "Cities: Override source",
        fallbackLabel: citiesCsvUrl === LOCAL_CITIES_CSV ? "Cities: Google Sheet fallback" : "Cities: Local fallback"
      }),
      SiteData.fetchTextWithFallback({
        primaryUrl: connectionsCsvUrl,
        fallbackUrl: connectionsCsvUrl === LOCAL_CONNECTIONS_CSV ? remoteConnectionsCsvUrl : LOCAL_CONNECTIONS_CSV,
        primaryLabel: connectionsCsvUrl === LOCAL_CONNECTIONS_CSV ? "Connections: Local CMS" : "Connections: Override source",
        fallbackLabel: connectionsCsvUrl === LOCAL_CONNECTIONS_CSV ? "Connections: Google Sheet fallback" : "Connections: Local fallback"
      }),
      SiteData.fetchTextWithFallback({
        primaryUrl: storiesCsvUrl,
        fallbackUrl: LOCAL_STORIES_CSV,
        primaryLabel: storiesCsvUrl === LOCAL_STORIES_CSV ? "Stories: Local CMS" : "Stories: Override source",
        fallbackLabel: "Stories: Local fallback"
      })
    ]);

    const parsedCities = SiteData.parseCitiesCsv(citiesResult.text, Papa);
    const parsedConnections = SiteData.parseConnectionsCsv(connectionsResult.text, Papa);
    const parsedStories = SiteData.parseStoriesCsv(storiesResult.text, Papa);
    SiteData.buildCrossReferenceState(parsedCities.visits, parsedCities.cities, parsedConnections);
    SiteData.buildStoryReferenceState(parsedStories, parsedCities.cities, parsedConnections);

    connections = parsedConnections;
    connectionByAnchor = new Map(connections.map(connection => [connection.anchorId, connection]));
    connectionCountEl.textContent = String(connections.length);

    renderGrid();
    bindGridInteractions();
    expandHashTarget();
  }

  function renderGrid() {
    if (!connections.length) {
      grid.innerHTML = '<article class="connection-card"><div class="connection-card-copy"><h2>No connections found</h2><p>Add rows to <code>data/connections.csv</code> to populate this gallery.</p></div></article>';
      return;
    }

    grid.innerHTML = connections.map(connection => {
      const accentStyle = `style="--accentStripe: linear-gradient(180deg, ${SiteData.escapeAttr(connection.themeColor)}, rgba(255,255,255,0.14));"`;
      return `
        <article class="connection-card" id="${SiteData.escapeAttr(connection.anchorId)}" ${accentStyle}>
          <div class="connection-card-media">
            <div class="gallery-shell" data-gallery-key="${SiteData.escapeAttr(connection.anchorId)}">
              ${SiteData.buildGalleryMarkup(connection.anchorId, connection.images, connection.imageAlt, connection.title)}
            </div>
          </div>
          <div class="connection-card-copy">
            <div class="topic-chip-row">
              ${connection.topicTags.map(tag => `
                <span class="topic-chip tag-chip-story">${SiteData.escapeHtml(tag)}</span>
              `).join("")}
            </div>
            <div class="relation-chip-row">
              ${connection.relatedCities.map(city => `
                <a class="relation-chip tag-chip-city" href="cities.html#city-${SiteData.escapeAttr(city.key)}">${SiteData.escapeHtml(city.city)}</a>
              `).join("")}
              ${connection.relatedStories.map(story => `
                <a class="topic-chip tag-chip-story" href="stories.html#${SiteData.escapeAttr(story.anchorId)}">${SiteData.escapeHtml(story.title)}</a>
              `).join("")}
            </div>
            <h2>${SiteData.escapeHtml(connection.title)}</h2>
            <p>${SiteData.escapeHtml(connection.summary || "Add a summary in data/connections.csv to preview this connection.")}</p>
            <div class="connection-card-body">
              ${SiteData.splitParagraphs(connection.body).map(paragraph => `<p>${SiteData.escapeHtml(paragraph)}</p>`).join("") || '<p>Add longer body copy in the <code>body</code> column of data/connections.csv.</p>'}
            </div>
            <button class="connection-button" type="button" data-toggle-connection="${SiteData.escapeAttr(connection.anchorId)}">Read more</button>
          </div>
        </article>
      `;
    }).join("");

    SiteData.startGalleries(grid, gridGalleryIntervals);
  }

  function bindGridInteractions() {
    document.querySelectorAll("[data-toggle-connection]").forEach(button => {
      button.addEventListener("click", () => toggleConnection(button.dataset.toggleConnection));
    });
  }

  function toggleConnection(anchorId) {
    const nextId = activeExpandedId === anchorId ? "" : anchorId;
    activeExpandedId = nextId;

    document.querySelectorAll(".connection-card").forEach(card => {
      const expanded = card.id === nextId;
      card.classList.toggle("expanded", expanded);
      const button = card.querySelector("[data-toggle-connection]");
      if (button) button.textContent = expanded ? "Show less" : "Read more";
      if (expanded) {
        card.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });

    if (nextId) {
      window.history.replaceState(null, "", `#${nextId}`);
    } else {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }

  function expandHashTarget() {
    const hash = decodeURIComponent(window.location.hash || "").replace(/^#/, "");
    if (!hash) return;
    if (!connectionByAnchor.has(hash)) return;
    toggleConnection(hash);
  }

  loadConnections().catch(error => {
    console.error(error);
    grid.innerHTML = '<article class="connection-card"><div class="connection-card-copy"><h2>Unable to load connections</h2><p>Check that <code>data/cities.csv</code>, <code>data/connections.csv</code>, and <code>data/stories.csv</code> are available to the page.</p></div></article>';
  });
});
