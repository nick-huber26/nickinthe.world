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

  const grid = document.getElementById("connectionsGrid");
  const connectionCountEl = document.getElementById("connectionCount");
  const gridGalleryIntervals = new Map();
  let activeExpandedId = "";

  let connections = [];
  let connectionByAnchor = new Map();

  async function loadConnections() {
    const citiesCsvUrl = qs.get("citiesCsv") || REMOTE_CITIES_CSV;
    const connectionsCsvUrl = qs.get("connectionsCsv") || REMOTE_CONNECTIONS_CSV;
    const storiesCsvUrl = qs.get("storiesCsv") || REMOTE_STORIES_CSV;
    const inspirationsCsvUrl = qs.get("inspirationsCsv") || REMOTE_INSPIRATIONS_CSV;

    const [citiesResult, connectionsResult, storiesResult, inspirationsResult] = await Promise.all([
      SiteData.fetchTextWithFallback({
        primaryUrl: citiesCsvUrl,
        fallbackUrl: LOCAL_CITIES_CSV,
        primaryLabel: citiesCsvUrl === REMOTE_CITIES_CSV ? "Cities: Google Sheet CMS" : "Cities: Override source",
        fallbackLabel: "Cities: Local fallback"
      }),
      SiteData.fetchTextWithFallback({
        primaryUrl: connectionsCsvUrl,
        fallbackUrl: LOCAL_CONNECTIONS_CSV,
        primaryLabel: connectionsCsvUrl === REMOTE_CONNECTIONS_CSV ? "Connections: Google Sheet CMS" : "Connections: Override source",
        fallbackLabel: "Connections: Local fallback"
      }),
      SiteData.fetchTextWithFallback({
        primaryUrl: storiesCsvUrl,
        fallbackUrl: LOCAL_STORIES_CSV,
        primaryLabel: storiesCsvUrl === REMOTE_STORIES_CSV ? "Stories: Google Sheet CMS" : "Stories: Override source",
        fallbackLabel: "Stories: Local fallback"
      }),
      SiteData.fetchTextWithFallback({
        primaryUrl: inspirationsCsvUrl,
        fallbackUrl: LOCAL_INSPIRATIONS_CSV,
        primaryLabel: inspirationsCsvUrl === REMOTE_INSPIRATIONS_CSV ? "Inspirations: Google Sheet CMS" : "Inspirations: Override source",
        fallbackLabel: "Inspirations: Local fallback"
      })
    ]);

    const parsedCities = SiteData.parseCitiesCsv(citiesResult.text, Papa);
    const parsedConnections = SiteData.parseConnectionsCsv(connectionsResult.text, Papa);
    const parsedStories = SiteData.parseStoriesCsv(storiesResult.text, Papa);
    const parsedInspirations = SiteData.parseInspirationsCsv(inspirationsResult.text, Papa);
    SiteData.buildCrossReferenceState(parsedCities.visits, parsedCities.cities, parsedConnections);
    SiteData.buildStoryReferenceState(parsedStories, parsedCities.cities, parsedConnections);
    SiteData.buildInspirationReferenceState(parsedInspirations, parsedCities.cities, parsedConnections, parsedStories);

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
      const tagMarkup = [
        ...connection.relatedCities.map(city => `
          <a class="relation-chip tag-chip-city" href="cities.html#city-${SiteData.escapeAttr(city.key)}">${SiteData.escapeHtml(city.city)}</a>
        `),
        ...connection.relatedStories.map(story => `
          <a class="topic-chip tag-chip-story" href="stories.html#${SiteData.escapeAttr(story.anchorId)}">${SiteData.escapeHtml(story.title)}</a>
        `),
        ...(connection.relatedInspirations || []).map(inspiration => `
          <a class="topic-chip tag-chip-inspiration" href="inspirations.html#${SiteData.escapeAttr(inspiration.anchorId)}">${SiteData.escapeHtml(inspiration.title)}</a>
        `)
      ].join("");

      return `
        <article class="connection-card" id="${SiteData.escapeAttr(connection.anchorId)}" ${accentStyle}>
          <div class="connection-card-media">
            <div class="gallery-shell" data-gallery-key="${SiteData.escapeAttr(connection.anchorId)}">
              ${SiteData.buildGalleryMarkup(connection.anchorId, connection.images, connection.imageAlt, connection.title)}
            </div>
          </div>
          <div class="connection-card-copy">
            ${tagMarkup ? `<div class="relation-chip-row">${tagMarkup}</div>` : ""}
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
    grid.innerHTML = '<article class="connection-card"><div class="connection-card-copy"><h2>Unable to load connections</h2><p>Check that <code>data/cities.csv</code>, <code>data/connections.csv</code>, <code>data/stories.csv</code>, and <code>data/inspirations.csv</code> are available to the page.</p></div></article>';
  });
});
