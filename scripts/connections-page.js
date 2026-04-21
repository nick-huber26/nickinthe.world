document.addEventListener("DOMContentLoaded", () => {
  const DEFAULT_CITIES_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRByIxtJ23p1SJ8ehZDmbx1jd3DOMTk38xoSqAQcKpIImgxu2zEw69N6_xooFbBf7VNo0yFC62bqR3p/pub?gid=1798659217&single=true&output=csv";
  const DEFAULT_CONNECTIONS_SHEET_URL = "";
  const LOCAL_CITIES_CSV = "data/cities.csv";
  const LOCAL_CONNECTIONS_CSV = "data/connections.csv";
  const qs = new URLSearchParams(window.location.search);

  const grid = document.getElementById("connectionsGrid");
  const sourceIndicatorEl = document.getElementById("connectionsSource");
  const connectionCountEl = document.getElementById("connectionCount");
  const gridGalleryIntervals = new Map();
  let activeExpandedId = "";

  let connections = [];
  let connectionByAnchor = new Map();

  async function loadConnections() {
    const citiesCsvUrl = qs.get("citiesCsv") || SiteData.resolveCsvSource(DEFAULT_CITIES_SHEET_URL, LOCAL_CITIES_CSV);
    const connectionsCsvUrl = qs.get("connectionsCsv") || SiteData.resolveCsvSource(DEFAULT_CONNECTIONS_SHEET_URL, LOCAL_CONNECTIONS_CSV);

    const [citiesResult, connectionsResult] = await Promise.all([
      SiteData.fetchTextWithFallback({
        primaryUrl: citiesCsvUrl,
        fallbackUrl: LOCAL_CITIES_CSV,
        primaryLabel: "Cities: Google Sheet",
        fallbackLabel: "Cities: Local fallback"
      }),
      SiteData.fetchTextWithFallback({
        primaryUrl: connectionsCsvUrl,
        fallbackUrl: LOCAL_CONNECTIONS_CSV,
        primaryLabel: "Connections: Google Sheet",
        fallbackLabel: "Connections: Local fallback"
      })
    ]);

    const parsedCities = SiteData.parseCitiesCsv(citiesResult.text, Papa);
    const parsedConnections = SiteData.parseConnectionsCsv(connectionsResult.text, Papa);
    SiteData.buildCrossReferenceState(parsedCities.visits, parsedCities.cities, parsedConnections);

    connections = parsedConnections;
    connectionByAnchor = new Map(connections.map(connection => [connection.anchorId, connection]));
    sourceIndicatorEl.textContent = `${citiesResult.sourceLabel} | ${connectionsResult.sourceLabel}`;
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
                <span class="topic-chip">${SiteData.escapeHtml(tag)}</span>
              `).join("")}
            </div>
            <div class="relation-chip-row">
              ${connection.relatedCities.map(city => `
                <a class="relation-chip" href="cities.html#city-${SiteData.escapeAttr(city.key)}">${SiteData.escapeHtml(city.city)}</a>
              `).join("")}
            </div>
            <h2>${SiteData.escapeHtml(connection.title)}</h2>
            <p>${SiteData.escapeHtml(connection.summary || "Add a summary in data/connections.csv to preview this connection.")}</p>
            <button class="connection-button" type="button" data-toggle-connection="${SiteData.escapeAttr(connection.anchorId)}">Read more</button>
          </div>
          <div class="connection-card-body">
            <div class="gallery-shell overlay-gallery" data-gallery-key="${SiteData.escapeAttr(connection.anchorId)}-expanded">
              ${SiteData.buildGalleryMarkup(`${connection.anchorId}-expanded`, connection.images, connection.imageAlt, connection.title)}
            </div>
            <div class="overlay-copy">
              <div class="topic-chip-row">
                ${connection.topicTags.map(tag => `
                  <span class="topic-chip">${SiteData.escapeHtml(tag)}</span>
                `).join("")}
              </div>
              <div class="relation-chip-row">
                ${connection.relatedCities.map(city => `
                  <a class="relation-chip" href="cities.html#city-${SiteData.escapeAttr(city.key)}">${SiteData.escapeHtml(city.city)}</a>
                `).join("")}
              </div>
              <h2>${SiteData.escapeHtml(connection.title)}</h2>
              ${connection.summary ? `<p class="overlay-summary">${SiteData.escapeHtml(connection.summary)}</p>` : ""}
              <div class="overlay-body">
                ${SiteData.splitParagraphs(connection.body).map(paragraph => `<p>${SiteData.escapeHtml(paragraph)}</p>`).join("") || '<p>Add longer body copy in the <code>body</code> column of data/connections.csv.</p>'}
              </div>
            </div>
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
    grid.innerHTML = '<article class="connection-card"><div class="connection-card-copy"><h2>Unable to load connections</h2><p>Check that <code>data/cities.csv</code> and <code>data/connections.csv</code> are available to the page.</p></div></article>';
  });
});
