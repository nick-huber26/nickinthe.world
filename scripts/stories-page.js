document.addEventListener("DOMContentLoaded", () => {
  const LOCAL_CITIES_CSV = "data/cities.csv";
  const LOCAL_CONNECTIONS_CSV = "data/connections.csv";
  const LOCAL_STORIES_CSV = "data/stories.csv";
  const qs = new URLSearchParams(window.location.search);

  const grid = document.getElementById("storiesGrid");
  const storyCountEl = document.getElementById("storyCount");

  let stories = [];

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
    storyCountEl.textContent = String(stories.length);

    renderGrid();
    bindPageInteractions();
  }

  function renderGrid() {
    if (!stories.length) {
      grid.innerHTML = '<article class="story-tile story-tile-empty"><div class="story-tile-copy"><h2>No stories found</h2><p>Add rows to <code>data/stories.csv</code> to populate this gallery.</p></div></article>';
      return;
    }

    grid.innerHTML = stories.map(story => `
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
                  <a class="story-chip" href="cities.html#city-${SiteData.escapeAttr(city.key)}">${SiteData.escapeHtml(city.city)}</a>
                `).join("")}
                ${story.relatedConnections.map(connection => `
                  <a class="story-chip" href="connections.html#${SiteData.escapeAttr(connection.anchorId)}">${SiteData.escapeHtml(connection.title)}</a>
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

  function bindPageInteractions() {
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

  function buildFrontMedia(story) {
    const primaryImage = story.images[0];
    if (!primaryImage) {
      return `<div class="empty-media">${SiteData.escapeHtml(story.title)}</div>`;
    }

    return `<img loading="lazy" src="${SiteData.escapeAttr(primaryImage)}" alt="${SiteData.escapeAttr(story.imageAlt || story.title)}">`;
  }

  loadStories().catch(error => {
    console.error(error);
    grid.innerHTML = '<article class="story-tile story-tile-empty"><div class="story-tile-copy"><h2>Unable to load stories</h2><p>Check that <code>data/stories.csv</code>, <code>data/cities.csv</code>, and <code>data/connections.csv</code> are available to the page.</p></div></article>';
  });
});
