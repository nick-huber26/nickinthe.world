document.addEventListener("DOMContentLoaded", () => {
  const DEFAULT_CITIES_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRByIxtJ23p1SJ8ehZDmbx1jd3DOMTk38xoSqAQcKpIImgxu2zEw69N6_xooFbBf7VNo0yFC62bqR3p/pub?gid=1798659217&single=true&output=csv";
  const DEFAULT_CONNECTIONS_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQMEcBeB7RhPjNz68ETerPlME6noppDYGwXjKTCFoZfRNoBWM8Mzwydq47ZkkdWHffPj5zp0uE_s-JM/pub?gid=1798659217&single=true&output=csv";
  const LOCAL_CITIES_CSV = "data/cities.csv";
  const LOCAL_CONNECTIONS_CSV = "data/connections.csv";
  const LOCAL_STORIES_CSV = "data/stories.csv";
  const qs = new URLSearchParams(window.location.search);

  const feed = document.getElementById("feed");
  const feedInner = document.getElementById("feedInner");
  const prevVisitButton = document.getElementById("prevVisit");
  const nextVisitButton = document.getElementById("nextVisit");
  const currentDateEl = document.getElementById("currentDate");
  const currentPlaceEl = document.getElementById("currentPlace");
  const cityCountEl = document.getElementById("cityCount");
  const countryCountEl = document.getElementById("countryCount");

  function buildRatingScale(label, value) {
    if (!Number.isFinite(value)) return "";
    const filledCount = Math.max(0, Math.min(5, Math.round(value)));
    return `
      <div class="rating-block">
        <div class="rating-label">${SiteData.escapeHtml(label)}</div>
        <div class="rating-bubbles" aria-label="${SiteData.escapeAttr(`${label}: ${value.toFixed(1)} out of 5`)}">
          ${Array.from({ length: 5 }, (_, index) => `
            <span class="rating-bubble${index < filledCount ? " filled" : ""}"></span>
          `).join("")}
        </div>
      </div>
    `;
  }

  const map = L.map("map", {
    worldCopyJump: true,
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: true,
    minZoom: 2,
    maxZoom: 10
  }).setView([20, 10], 2.2);

  L.control.zoom({ position: "bottomleft" }).addTo(map);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    maxZoom: 19
  }).addTo(map);

  let visits = [];
  let cities = [];
  let cityLookup = new Map();
  let cityMarkers = new Map();
  let selectedVisitIdByCity = new Map();
  let planeMarker = null;
  let fullRouteLine = null;
  let incomingLine = null;
  let outgoingLine = null;
  let activeVisitIndex = 0;
  let animationToken = 0;
  let cameraAnimationToken = 0;
  let preferredZoom = 3.8;
  let suppressPreferredZoomUpdate = false;
  const galleryIntervals = new Map();

  map.on("zoomend", () => {
    if (!suppressPreferredZoomUpdate) {
      preferredZoom = map.getZoom();
    }
  });

  async function loadTrips() {
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

    visits = parsedCities.visits;
    cities = parsedCities.cities;
    cityLookup = new Map(cities.map(city => [city.key, city]));

    selectedVisitIdByCity = new Map();
    cities.forEach(city => {
      if (city.visits[0]) selectedVisitIdByCity.set(city.key, city.visits[0].id);
    });

    if (!visits.length) {
      feedInner.innerHTML = '<div class="post-card"><div class="post-content"><h2>No valid trips found</h2><p class="summary">Add visits with a city, date, latitude, longitude, and optional connection tags to data/cities.csv.</p></div></div>';
      return;
    }

    renderFeed();
    renderMap();
    bindTopNav();
    cityCountEl.textContent = String(new Set(cities.map(city => city.key)).size);
    countryCountEl.textContent = String(new Set(cities.map(city => city.country).filter(Boolean)).size);

    const initialIndex = getInitialVisitIndex();
    setActiveVisit(initialIndex, { scrollCard: false, animatePlane: false, flyMap: false });

    if (window.location.hash) {
      const initialVisit = visits[initialIndex];
      if (initialVisit) {
        window.setTimeout(() => scrollToCityCard(initialVisit.cityKey), 80);
      }
    }
  }

  function renderFeed() {
    feedInner.innerHTML = cities.map(city => {
      const cityStyle = `style="--accentStripe: linear-gradient(180deg, ${SiteData.escapeAttr(city.themeColor)}, rgba(255,255,255,0.14));"`;
      const cityDescription = SiteData.escapeHtml(city.cityDescription || "");
      const relatedConnections = city.relatedConnections || [];
      const relatedStories = city.relatedStories || [];
      const cityHeroStyle = city.cityHeroImage
        ? ` style="background:
            linear-gradient(180deg, rgba(7,15,20,.18) 0%, rgba(7,15,20,.34) 20%, rgba(7,15,20,.64) 58%, rgba(7,15,20,.9) 100%),
            linear-gradient(110deg, rgba(6,12,18,.62) 0%, rgba(6,12,18,.18) 32%, rgba(6,12,18,.52) 100%),
            radial-gradient(circle at 18% 18%, rgba(255,255,255,.1), transparent 28%),
            url('${SiteData.escapeAttr(city.cityHeroImage)}') center center / cover no-repeat;"`
        : "";
      const ratingMarkup = [
        buildRatingScale("Legal protections", city.legalProtectionsAverage),
        buildRatingScale("Foreigner friendliness", city.foreignerFriendlinessAverage)
      ].filter(Boolean).join("");
      const neighborhoodsMarkup = (city.neighborhoods || [])
        .map(item => `<li>${SiteData.escapeHtml(item)}</li>`)
        .join("");
      const spacesMarkup = (city.spaces || [])
        .map(item => `<li>${SiteData.escapeHtml(item)}</li>`)
        .join("");
      return `
        <article class="city-card" id="city-${SiteData.escapeAttr(city.key)}" data-city-key="${SiteData.escapeAttr(city.key)}">
          <div class="post-card" ${cityStyle}>
            <div class="post-content">
              <div class="city-hero${city.cityHeroImage ? " has-hero" : ""}"${cityHeroStyle}>
                <div class="meta-row meta-row-scroll">
                  <span class="chip city meta-chip-fixed">${SiteData.escapeHtml(city.city)}${city.country ? `, ${SiteData.escapeHtml(city.country)}` : ""}</span>
                  <span class="chip count meta-chip-fixed">${city.visits.length} ${city.visits.length === 1 ? "visit" : "visits"}</span>
                  ${relatedConnections.length ? `
                    <div class="city-connection-row" aria-label="Related connections">
                      ${relatedConnections.map(connection => `
                        <a class="relation-chip tag-chip-connection" href="connections.html#${SiteData.escapeAttr(connection.anchorId)}">${SiteData.escapeHtml(connection.title)}</a>
                      `).join("")}
                    </div>
                  ` : ""}
                  ${relatedStories.length ? `
                    <div class="city-story-row" aria-label="Related stories">
                      ${relatedStories.map(story => `
                        <a class="topic-chip tag-chip-story" href="stories.html#${SiteData.escapeAttr(story.anchorId)}">${SiteData.escapeHtml(story.title)}</a>
                      `).join("")}
                    </div>
                  ` : ""}
                </div>
                <div class="city-title-row">
                  <h2>${SiteData.escapeHtml(city.city)}</h2>
                  <div class="city-subtitle">First visit ${SiteData.escapeHtml(city.visits[0].dateLabel)}</div>
                </div>
                <div class="city-top-copy">
                  ${ratingMarkup ? `<div class="city-ratings">${ratingMarkup}</div>` : ""}
                  <div class="city-list-stack">
                    <div class="city-list-block">
                      <div class="city-list-title">Neighborhoods</div>
                      ${neighborhoodsMarkup ? `<ul class="city-list">${neighborhoodsMarkup}</ul>` : `<p class="city-list-empty">No neighborhoods added yet.</p>`}
                    </div>
                    <div class="city-list-block">
                      <div class="city-list-title">Spaces</div>
                      ${spacesMarkup ? `<ul class="city-list">${spacesMarkup}</ul>` : `<p class="city-list-empty">No spaces added yet.</p>`}
                    </div>
                  </div>
                  ${cityDescription ? `<p class="city-description city-description-wide">${cityDescription}</p>` : ""}
                </div>
              </div>
              <div class="visit-section-heading">Visits</div>
              <div class="visit-chip-row">
                ${city.visits.map(visit => `
                  <button class="visit-chip" type="button" data-visit-id="${SiteData.escapeAttr(visit.id)}">
                    ${SiteData.escapeHtml(visit.dateLabel)}
                  </button>
                `).join("")}
              </div>
              <div class="visit-detail" data-city-detail="${SiteData.escapeAttr(city.key)}"></div>
            </div>
          </div>
        </article>
      `;
    }).join("");

    document.querySelectorAll("[data-visit-id]").forEach(button => {
      button.addEventListener("click", event => {
        event.stopPropagation();
        const visitIndex = visits.findIndex(visit => visit.id === button.dataset.visitId);
        if (visitIndex >= 0) {
          setActiveVisit(visitIndex, { scrollCard: true, animatePlane: true, flyMap: true });
        }
      });
    });

    document.querySelectorAll(".city-card").forEach(card => {
      card.addEventListener("click", event => {
        if (event.target.closest("[data-visit-id]") || event.target.closest("a")) return;
        const cityKey = card.dataset.cityKey;
        const visitId = selectedVisitIdByCity.get(cityKey) || cityLookup.get(cityKey)?.visits[0]?.id;
        const visitIndex = visits.findIndex(visit => visit.id === visitId);
        if (visitIndex >= 0) {
          setActiveVisit(visitIndex, { scrollCard: true, animatePlane: true, flyMap: true });
        }
      });
    });
  }

  function renderCityDetails() {
    cities.forEach(city => {
      const selectedVisitId = selectedVisitIdByCity.get(city.key) || city.visits[0]?.id;
      const visit = city.visits.find(item => item.id === selectedVisitId) || city.visits[0];
      const detail = document.querySelector(`[data-city-detail="${city.key}"]`);
      if (!detail || !visit) return;

      const paragraphs = SiteData.splitParagraphs(visit.story);
      const descriptionMarkup = paragraphs.length
        ? paragraphs.map(paragraph => `<p>${SiteData.escapeHtml(paragraph)}</p>`).join("")
        : `<p class="visit-field-empty">Add a description for this visit in the <code>story</code> column.</p>`;
      const summaryMarkup = visit.summary
        ? `<p>${SiteData.escapeHtml(visit.summary)}</p>`
        : `<p class="visit-field-empty">Add a summary for this visit in the <code>summary</code> column.</p>`;

      detail.innerHTML = `
        <div class="visit-copy">
          ${visit.title ? `<h3 class="visit-title">${SiteData.escapeHtml(visit.title)}</h3>` : `<h3 class="visit-title">${SiteData.escapeHtml(visit.dateLabel)}</h3>`}
          <div class="visit-fields">
            <div class="visit-field">
              <div class="visit-field-label">Description</div>
              <div class="visit-field-body story-panel">${descriptionMarkup}</div>
            </div>
            <div class="visit-field">
              <div class="visit-field-label">Summary</div>
              <div class="visit-field-body summary-panel">${summaryMarkup}</div>
            </div>
          </div>
        </div>
        <div class="gallery-shell" data-gallery-key="${SiteData.escapeAttr(city.key)}">
          ${SiteData.buildGalleryMarkup(city.key, visit.images, visit.imageAlt || city.city, `${city.city}<br>${visit.dateLabel}`)}
        </div>
      `;
    });

    SiteData.startGalleries(document, galleryIntervals);
  }

  function renderMap() {
    cityMarkers.forEach(marker => marker.remove());
    cityMarkers.clear();
    if (fullRouteLine) fullRouteLine.remove();
    if (incomingLine) incomingLine.remove();
    if (outgoingLine) outgoingLine.remove();
    if (planeMarker) planeMarker.remove();

    const bounds = [];
    cities.forEach(city => {
      const icon = L.divIcon({
        className: "custom-pin-icon",
        html: `
          <div class="pin-wrap" style="--pinColor:${SiteData.escapeAttr(city.themeColor)}">
            <button class="pin" type="button" aria-label="Jump to ${SiteData.escapeAttr(city.city)}"></button>
            <div class="city-label">${SiteData.escapeHtml(city.city)}</div>
          </div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });

      const marker = L.marker([city.lat, city.lng], { icon, keyboard: false }).addTo(map);
      marker.on("click", () => {
        const visitId = selectedVisitIdByCity.get(city.key) || city.visits[0]?.id;
        const visitIndex = visits.findIndex(visit => visit.id === visitId);
        if (visitIndex >= 0) {
          setActiveVisit(visitIndex, { scrollCard: true, animatePlane: true, flyMap: true });
        }
      });
      cityMarkers.set(city.key, marker);
      bounds.push([city.lat, city.lng]);
    });

    if (visits.length > 1) {
      fullRouteLine = L.polyline(visits.map(visit => [visit.lat, visit.lng]), {
        color: "#FFFFFF",
        weight: 2,
        opacity: 0.08,
        smoothFactor: 1.2,
        className: "route-line-all",
        interactive: false
      }).addTo(map);
    }

    if (bounds.length === 1) {
      map.setView(bounds[0], 4);
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [70, 70], maxZoom: 4 });
    }

    preferredZoom = map.getZoom();

    planeMarker = L.marker([visits[0].lat, visits[0].lng], {
      interactive: false,
      icon: L.divIcon({
        className: "plane-marker",
        html: `
          <div class="plane-icon" aria-hidden="true">
            <svg viewBox="0 0 810 810" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M404.949219 8.183594C384.1875 8.183594 374.21875 76.792969 370.691406 108.960938C369.957031 118.71875 369.128906 127.585938 369.128906 136.691406L369.128906 233.65625C368.914062 239.183594 367.957031 240.714844 364.765625 243.496094L289.894531 308.71875C284.785156 312.253906 278.140625 312.121094 278.648438 299.980469L278.648438 291.3125C278.648438 286.535156 274.828125 282.640625 270.050781 282.640625L259.304688 282.640625C254.527344 282.640625 250.636719 286.535156 250.636719 291.3125L250.636719 342.148438C250.660156 343.703125 250.382812 343.832031 249.277344 344.816406L178.277344 407.941406C171.007812 413.003906 168.34375 408.039062 167.960938 399.128906L167.960938 383.296875C167.960938 378.519531 164.140625 374.628906 159.363281 374.628906L148.617188 374.628906C143.84375 374.628906 139.949219 378.519531 139.949219 383.296875L139.949219 435.953125C139.945312 436.613281 139.675781 436.675781 139.375 437.015625L63.222656 502.71875C58.375 508.921875 55.5 511.753906 55.699219 522.277344L55.429688 551.804688C54.816406 555.824219 58.566406 557.425781 61.203125 556.160156C61.203125 556.160156 191.234375 475.878906 241.101562 453.863281C290.976562 431.851562 357.449219 416.753906 357.449219 416.753906C362.574219 415.511719 367.15625 415.367188 369.125 420.835938L369.125 642.992188C369.257812 669.507812 379.277344 685.550781 369.125 695.074219L286.230469 775.640625C281.195312 781.007812 278.292969 785.59375 277.703125 794.265625L277.828125 803.445312C278.105469 807.738281 279.71875 809.945312 283.652344 809.4375L389.679688 783.367188C392.460938 782.492188 394.671875 782.789062 396.621094 785.488281L407.453125 809.339844L420.757812 784.871094C422.597656 782.25 426.050781 781 428.652344 781.933594C461.359375 789.679688 494.0625 797.425781 526.769531 805.171875C530.976562 805.675781 534.390625 805.589844 534.929688 799.941406L534.929688 785.929688C532.726562 776.265625 527.171875 771.761719 521.34375 765.945312L438.117188 695.074219C430.332031 687.183594 438.050781 670.515625 440.695312 643.777344L440.695312 424.195312L440.769531 424.125L440.839844 424.125L440.839844 424.054688L440.910156 424.054688L440.910156 423.984375L440.984375 423.984375L440.984375 423.910156L441.054688 423.910156C441.117188 423.601562 441.191406 423.273438 441.269531 422.980469C441.34375 422.683594 441.464844 422.402344 441.554688 422.121094C441.644531 421.839844 441.738281 421.597656 441.84375 421.332031C441.945312 421.066406 442.011719 420.792969 442.128906 420.542969C442.246094 420.296875 442.351562 420.058594 442.488281 419.828125C442.621094 419.597656 442.765625 419.390625 442.917969 419.183594C443.070312 418.972656 443.246094 418.796875 443.417969 418.609375C443.589844 418.421875 443.800781 418.199219 443.992188 418.035156C444.183594 417.871094 444.351562 417.746094 444.566406 417.605469C444.777344 417.464844 445.042969 417.292969 445.28125 417.175781C445.519531 417.0625 445.734375 416.976562 445.996094 416.890625C446.257812 416.804688 446.570312 416.734375 446.855469 416.675781C447.144531 416.617188 447.402344 416.558594 447.71875 416.53125C448.03125 416.503906 448.378906 416.527344 448.71875 416.53125C449.0625 416.535156 449.421875 416.566406 449.792969 416.605469C450.164062 416.640625 450.539062 416.675781 450.941406 416.746094C450.941406 416.746094 511.292969 429.835938 562.199219 451.347656C613.105469 472.863281 748.863281 554.117188 748.863281 554.117188C751.972656 554.753906 754.597656 554.28125 754.992188 551.230469L754.992188 523.777344C755.171875 516.414062 750.8125 509.871094 747.613281 506.941406L673.09375 441.007812C670.527344 437.886719 669.953125 437.285156 669.882812 435.441406L669.882812 383.289062C669.882812 378.511719 665.992188 374.621094 661.214844 374.621094L650.46875 374.621094C645.691406 374.621094 641.871094 378.511719 641.871094 383.289062L641.871094 399.121094C642.707031 408.542969 640.199219 412.03125 634.347656 407.574219L561.265625 344.8125C559.632812 343.414062 559.25 343.351562 559.269531 341.988281L559.269531 291.300781C559.269531 286.523438 555.378906 282.632812 550.601562 282.632812L539.855469 282.632812C535.078125 282.632812 531.257812 286.523438 531.257812 291.300781L531.257812 299.972656C532.472656 312.042969 524.542969 314.464844 519.222656 308.640625L444.855469 243.332031C441.390625 240.203125 441.0625 238.285156 440.703125 233.914062L440.703125 136.683594C440.46875 127.070312 439.953515 116.292969 438.894531 107.511719C434.5625 73.457031 421.367188 -0.03125 404.957031 8.175781Z" fill="#FFFFFF"/>
            </svg>
          </div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      })
    }).addTo(map);
  }

  function bindTopNav() {
    prevVisitButton.addEventListener("click", () => {
      if (activeVisitIndex > 0) {
        setActiveVisit(activeVisitIndex - 1, { scrollCard: true, animatePlane: true, flyMap: true });
      }
    });

    nextVisitButton.addEventListener("click", () => {
      if (activeVisitIndex < visits.length - 1) {
        setActiveVisit(activeVisitIndex + 1, { scrollCard: true, animatePlane: true, flyMap: true });
      }
    });
  }

  function setActiveVisit(nextIndex, options = {}) {
    const nextVisit = visits[nextIndex];
    if (!nextVisit) return;

    const {
      scrollCard = true,
      animatePlane = true,
      flyMap = true
    } = options;

    const previousIndex = activeVisitIndex;
    const sameIndex = nextIndex === activeVisitIndex;
    activeVisitIndex = nextIndex;
    selectedVisitIdByCity.set(nextVisit.cityKey, nextVisit.id);

    updateTimelineUI();
    renderCityDetails();
    updateCardUI();
    updateMapUI();

    if (scrollCard) scrollToCityCard(nextVisit.cityKey);
    if (flyMap) animateMapTransition(previousIndex, activeVisitIndex);

    if (planeMarker) {
      if (!animatePlane || sameIndex) {
        updateRouteHighlights(activeVisitIndex);
        setPlane(nextVisit.lat, nextVisit.lng, getVisitOrientation(activeVisitIndex));
      } else {
        animatePlaneBetween(previousIndex, activeVisitIndex);
      }
    }
  }

  function updateTimelineUI() {
    const currentVisit = visits[activeVisitIndex];
    if (!currentVisit) return;

    currentDateEl.textContent = currentVisit.dateLabel;
    currentPlaceEl.textContent = `${currentVisit.city}${currentVisit.country ? `, ${currentVisit.country}` : ""}`;
    prevVisitButton.disabled = activeVisitIndex <= 0;
    nextVisitButton.disabled = activeVisitIndex >= visits.length - 1;
  }

  function updateCardUI() {
    const activeVisit = visits[activeVisitIndex];
    if (!activeVisit) return;

    document.querySelectorAll(".city-card").forEach(card => {
      card.classList.toggle("active", card.dataset.cityKey === activeVisit.cityKey);
    });

    document.querySelectorAll("[data-visit-id]").forEach(button => {
      const visitId = button.dataset.visitId;
      const visit = visits.find(item => item.id === visitId);
      if (!visit) return;
      button.classList.toggle("active", selectedVisitIdByCity.get(visit.cityKey) === visit.id);
    });
  }

  function scrollToCityCard(cityKey) {
    const target = document.getElementById(`city-${cityKey}`);
    if (!target) return;
    const topbar = document.querySelector(".feed-topbar");
    const topbarHeight = topbar ? topbar.offsetHeight : 0;
    const targetTop = target.offsetTop - topbarHeight - 12;
    feed.scrollTo({
      top: Math.max(0, targetTop),
      behavior: "smooth"
    });
  }

  function updateMapUI() {
    const activeVisit = visits[activeVisitIndex];
    if (!activeVisit) return;

    cityMarkers.forEach((marker, cityKey) => {
      const wrap = marker.getElement()?.querySelector(".pin-wrap");
      if (wrap) wrap.classList.toggle("active", cityKey === activeVisit.cityKey);
    });
  }

  function animateMapTransition(fromIndex, toIndex) {
    const targetVisit = visits[toIndex];
    if (!targetVisit) return;

    const destinationZoom = getDestinationZoom(fromIndex, toIndex);
    const fromVisit = visits[fromIndex] || targetVisit;
    const token = ++cameraAnimationToken;

    if (fromVisit.lat === targetVisit.lat && fromVisit.lng === targetVisit.lng) {
      runProgrammaticZoom(() => {
        map.flyTo([targetVisit.lat, targetVisit.lng], destinationZoom, {
          duration: 0.9,
          easeLinearity: 0.22
        });
      });
      return;
    }

    const legBounds = L.latLngBounds(
      [fromVisit.lat, fromVisit.lng],
      [targetVisit.lat, targetVisit.lng]
    );
    const legZoom = map.getBoundsZoom(legBounds.pad(0.24), false, [96, 96]);
    const midZoom = Math.min(Math.max(destinationZoom - 0.8, 3.6), legZoom);

    runProgrammaticZoom(() => {
      map.flyToBounds(legBounds.pad(0.24), {
        padding: [96, 96],
        maxZoom: midZoom,
        duration: 0.6,
        easeLinearity: 0.2
      });
    });

      window.setTimeout(() => {
        if (token !== cameraAnimationToken) return;
        runProgrammaticZoom(() => {
        map.flyTo([targetVisit.lat, targetVisit.lng], destinationZoom, {
            duration: 0.75,
            easeLinearity: 0.22
          });
        });
      }, 620);
  }

  function runProgrammaticZoom(callback) {
    suppressPreferredZoomUpdate = true;
    callback();
    window.setTimeout(() => {
      suppressPreferredZoomUpdate = false;
      }, 1500);
  }

  function getDestinationZoom(fromIndex, toIndex) {
    const targetVisit = visits[toIndex];
    const fromVisit = visits[fromIndex] || targetVisit;
    const currentZoom = preferredZoom || map.getZoom() || 3.8;

    if (!targetVisit || !fromVisit) return currentZoom;

    const distanceKm = getDistanceKm(fromVisit.lat, fromVisit.lng, targetVisit.lat, targetVisit.lng);

    if (distanceKm < 15) return 9.2;
    if (distanceKm < 40) return 8.4;
    if (distanceKm < 120) return 7.6;
    if (distanceKm < 300) return 6.8;
    if (distanceKm < 800) return 6.1;
    if (distanceKm < 1800) return 5.4;
    return Math.max(4.6, currentZoom);
  }

  function updateRouteHighlights(index) {
    if (incomingLine) incomingLine.remove();
    if (outgoingLine) outgoingLine.remove();

    const currentVisit = visits[index];
    const previousVisit = visits[index - 1];
    const nextVisit = visits[index + 1];

    if (previousVisit) {
      incomingLine = L.polyline([[previousVisit.lat, previousVisit.lng], [currentVisit.lat, currentVisit.lng]], {
        color: "#FFFFFF",
        weight: 2.6,
        opacity: 0.5,
        dashArray: "8 10",
        smoothFactor: 1.2,
        className: "route-line-incoming",
        interactive: false
      }).addTo(map);
    }

    if (nextVisit) {
      outgoingLine = L.polyline([[currentVisit.lat, currentVisit.lng], [nextVisit.lat, nextVisit.lng]], {
        color: "#FFFFFF",
        weight: 3.2,
        opacity: 0.82,
        smoothFactor: 1.2,
        className: "route-line-outgoing",
        interactive: false
      }).addTo(map);
    }
  }

  function animatePlaneBetween(fromIndex, toIndex) {
    if (!planeMarker || !visits[toIndex]) return;

    const token = ++animationToken;
    const fromVisit = visits[fromIndex] || visits[toIndex];
    const toVisit = visits[toIndex];
    updateRouteHighlights(toIndex);

    const fromBearing = getVisitOrientation(fromIndex);
    const toBearing = getVisitOrientation(toIndex);

    if (fromVisit.lat === toVisit.lat && fromVisit.lng === toVisit.lng) {
      setPlane(toVisit.lat, toVisit.lng, toBearing);
      return;
    }

    const duration = 1200;
    const start = performance.now();

    function frame(now) {
      if (token !== animationToken) return;
      const t = Math.min(1, (now - start) / duration);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const lat = fromVisit.lat + (toVisit.lat - fromVisit.lat) * eased;
      const lng = interpolateLng(fromVisit.lng, toVisit.lng, eased);
      const bearing = fromBearing + normalizeAngleDelta(toBearing - fromBearing) * eased;
      setPlane(lat, lng, bearing);
      if (t < 1) requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  function setPlane(lat, lng, bearingDeg) {
    planeMarker.setLatLng([lat, lng]);
    const plane = planeMarker.getElement()?.querySelector(".plane-icon");
    if (plane) plane.style.transform = `rotate(${bearingDeg}deg)`;
  }

  function getVisitOrientation(index) {
    const currentVisit = visits[index];
    if (!currentVisit) return 0;

    const nextVisit = visits[index + 1];
    if (nextVisit && (nextVisit.lat !== currentVisit.lat || nextVisit.lng !== currentVisit.lng)) {
      return getBearing(currentVisit.lat, currentVisit.lng, nextVisit.lat, nextVisit.lng);
    }

    const previousVisit = visits[index - 1];
    if (previousVisit && (previousVisit.lat !== currentVisit.lat || previousVisit.lng !== currentVisit.lng)) {
      return getBearing(previousVisit.lat, previousVisit.lng, currentVisit.lat, currentVisit.lng);
    }

    return 0;
  }

  function getBearing(lat1, lon1, lat2, lon2) {
    const toRad = deg => deg * Math.PI / 180;
    const toDeg = rad => rad * 180 / Math.PI;
    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const lambda1 = toRad(lon1);
    const lambda2 = toRad(lon2);
    const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);
    return toDeg(Math.atan2(y, x));
  }

  function getDistanceKm(lat1, lon1, lat2, lon2) {
    const toRad = deg => deg * Math.PI / 180;
    const earthRadiusKm = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
  }

  function interpolateLng(fromLng, toLng, t) {
    let delta = toLng - fromLng;
    if (Math.abs(delta) > 180) delta -= Math.sign(delta) * 360;
    let value = fromLng + delta * t;
    if (value > 180) value -= 360;
    if (value < -180) value += 360;
    return value;
  }

  function normalizeAngleDelta(delta) {
    let value = delta;
    while (value > 180) value -= 360;
    while (value < -180) value += 360;
    return value;
  }

  function getInitialVisitIndex() {
    const hash = decodeURIComponent(window.location.hash || "").replace(/^#/, "");
    if (!hash) return 0;

    if (hash.startsWith("visit-")) {
      const visitId = hash.slice("visit-".length);
      const visitIndex = visits.findIndex(visit => visit.id === visitId);
      return visitIndex >= 0 ? visitIndex : 0;
    }

    if (hash.startsWith("city-")) {
      const cityKey = hash.slice("city-".length);
      const city = cityLookup.get(cityKey);
      if (!city?.visits[0]) return 0;
      const visitId = selectedVisitIdByCity.get(cityKey) || city.visits[0].id;
      const visitIndex = visits.findIndex(visit => visit.id === visitId);
      return visitIndex >= 0 ? visitIndex : 0;
    }

    return 0;
  }

  loadTrips().catch(error => {
    console.error(error);
    feedInner.innerHTML = '<div class="post-card"><div class="post-content"><h2>Unable to load trips</h2><p class="summary">Check that data/cities.csv, data/connections.csv, and data/stories.csv are available to the page.</p></div></div>';
  });
});
