document.addEventListener("DOMContentLoaded", () => {
  const REMOTE_CITIES_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR3SXX_WeHF-GzeHKUdTHOnu69Nclo5YWhfZd7AvbRAe4tp63pcQqPk8768JdxQedf8Xvyj0OW-17vC/pub?gid=0&single=true&output=csv";
  const LOCAL_CITIES_CSV = "data/cities.csv";
  const AUTOPLAY_MS = 5000;
  const OVERVIEW_PADDING = [72, 72];
  const OVERVIEW_MAX_ZOOM = 4.1;
  const qs = new URLSearchParams(window.location.search);
  const statusEl = document.getElementById("mapStatus");
  const countsEl = document.getElementById("mapCounts");
  const cityCountEl = document.getElementById("cityCount");
  const countryCountEl = document.getElementById("countryCount");
  const interactive = qs.get("interactive") === "1";

  const map = L.map("map", {
    worldCopyJump: true,
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: interactive,
    dragging: interactive,
    doubleClickZoom: interactive,
    boxZoom: interactive,
    keyboard: interactive,
    touchZoom: interactive,
    tap: interactive,
    minZoom: 2,
    maxZoom: 10
  }).setView([20, 10], 2.2);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    maxZoom: 19
  }).addTo(map);

  let visits = [];
  let cities = [];
  let cityMarkers = new Map();
  let planeMarker = null;
  let fullRouteLine = null;
  let incomingLine = null;
  let outgoingLine = null;
  let activeVisitIndex = 0;
  let autoplayTimer = 0;
  let planeAnimationToken = 0;
  let cameraAnimationToken = 0;
  let preferredZoom = 4.1;
  let suppressPreferredZoomUpdate = false;

  map.on("zoomend", () => {
    if (!suppressPreferredZoomUpdate) preferredZoom = map.getZoom();
  });

  async function loadTrips() {
    const citiesCsvUrl = qs.get("citiesCsv") || REMOTE_CITIES_CSV;
    const result = await SiteData.fetchTextWithFallback({
      primaryUrl: citiesCsvUrl,
      fallbackUrl: LOCAL_CITIES_CSV,
      primaryLabel: citiesCsvUrl === REMOTE_CITIES_CSV ? "Cities: Google Sheet CMS" : "Cities: Override source",
      fallbackLabel: "Cities: Local fallback"
    });

    const parsedCities = SiteData.parseCitiesCsv(result.text, Papa);
    visits = parsedCities.visits;
    cities = parsedCities.cities;

    if (!visits.length) {
      statusEl.textContent = "No trips found.";
      return;
    }

    cityCountEl.textContent = String(new Set(cities.map(city => city.key)).size);
    countryCountEl.textContent = String(new Set(cities.map(city => city.country).filter(Boolean)).size);

    renderMap();
    setActiveVisit(0, { animatePlane: false, flyMap: false });
    statusEl.hidden = true;
    countsEl.hidden = false;
    scheduleNextFlight();
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
            <div class="pin" aria-hidden="true"></div>
            <div class="city-label">${SiteData.escapeHtml(city.city)}</div>
          </div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });

      const marker = L.marker([city.lat, city.lng], { icon, keyboard: false, interactive }).addTo(map);
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
      map.setView(bounds[0], OVERVIEW_MAX_ZOOM);
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, {
        padding: OVERVIEW_PADDING,
        maxZoom: OVERVIEW_MAX_ZOOM,
        animate: false
      });
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

  function setActiveVisit(nextIndex, options = {}) {
    const nextVisit = visits[nextIndex];
    if (!nextVisit) return;

    const {
      animatePlane = true,
      flyMap = true
    } = options;

    const previousIndex = activeVisitIndex;
    const sameIndex = nextIndex === activeVisitIndex;
    activeVisitIndex = nextIndex;

    updateMapUI();

    if (flyMap) animateMapTransition(previousIndex, activeVisitIndex);

    if (planeMarker) {
      if (!animatePlane || sameIndex) {
        updateRouteHighlights(activeVisitIndex);
        setPlane(nextVisit.lat, nextVisit.lng, getVisitOrientation(activeVisitIndex));
      } else {
        animatePlaneBetween(previousIndex, activeVisitIndex);
      }
    }

    scheduleNextFlight();
  }

  function updateMapUI() {
    const activeVisit = visits[activeVisitIndex];
    if (!activeVisit) return;

    cityMarkers.forEach((marker, cityKey) => {
      const wrap = marker.getElement()?.querySelector(".pin-wrap");
      if (wrap) wrap.classList.toggle("active", cityKey === activeVisit.cityKey);
    });
  }

  function scheduleNextFlight() {
    window.clearTimeout(autoplayTimer);
    if (visits.length < 2) return;

    autoplayTimer = window.setTimeout(() => {
      setActiveVisit((activeVisitIndex + 1) % visits.length, {
        animatePlane: true,
        flyMap: true
      });
    }, AUTOPLAY_MS);
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
          duration: 1.05,
          easeLinearity: 0.22
        });
      });
      return;
    }

    const legBounds = L.latLngBounds(
      [fromVisit.lat, fromVisit.lng],
      [targetVisit.lat, targetVisit.lng]
    );
    const legZoom = map.getBoundsZoom(legBounds.pad(0.22), false, [88, 88]);
    const midZoom = Math.min(Math.max(destinationZoom - 0.75, 4.1), legZoom);

    runProgrammaticZoom(() => {
      map.flyToBounds(legBounds.pad(0.22), {
        padding: [88, 88],
        maxZoom: midZoom,
        duration: 0.8,
        easeLinearity: 0.2
      });
    });

    window.setTimeout(() => {
      if (token !== cameraAnimationToken) return;
      runProgrammaticZoom(() => {
        map.flyTo([targetVisit.lat, targetVisit.lng], destinationZoom, {
          duration: 0.95,
          easeLinearity: 0.22
        });
      });
    }, 780);
  }

  function runProgrammaticZoom(callback) {
    suppressPreferredZoomUpdate = true;
    callback();
    window.setTimeout(() => {
      suppressPreferredZoomUpdate = false;
    }, 1800);
  }

  function getDestinationZoom(fromIndex, toIndex) {
    const targetVisit = visits[toIndex];
    const fromVisit = visits[fromIndex] || targetVisit;
    const currentZoom = preferredZoom || map.getZoom() || 4.1;

    if (!targetVisit || !fromVisit) return currentZoom;

    const distanceKm = getDistanceKm(fromVisit.lat, fromVisit.lng, targetVisit.lat, targetVisit.lng);

    if (distanceKm < 15) return 9.4;
    if (distanceKm < 40) return 8.7;
    if (distanceKm < 120) return 7.9;
    if (distanceKm < 300) return 7.1;
    if (distanceKm < 800) return 6.4;
    if (distanceKm < 1800) return 5.7;
    return Math.max(4.9, currentZoom);
  }

  function updateRouteHighlights(index) {
    if (incomingLine) incomingLine.remove();
    if (outgoingLine) outgoingLine.remove();

    const currentVisit = visits[index];
    const previousVisit = visits[index - 1];
    const nextVisit = visits[index + 1] || visits[0];

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
    } else if (visits.length > 1) {
      const lastVisit = visits[visits.length - 1];
      incomingLine = L.polyline([[lastVisit.lat, lastVisit.lng], [currentVisit.lat, currentVisit.lng]], {
        color: "#FFFFFF",
        weight: 2.6,
        opacity: 0.3,
        dashArray: "8 10",
        smoothFactor: 1.2,
        className: "route-line-incoming",
        interactive: false
      }).addTo(map);
    }

    if (nextVisit && visits.length > 1) {
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

    const token = ++planeAnimationToken;
    const fromVisit = visits[fromIndex] || visits[toIndex];
    const toVisit = visits[toIndex];
    updateRouteHighlights(toIndex);

    const fromBearing = getVisitOrientation(fromIndex);
    const toBearing = getVisitOrientation(toIndex);

    if (fromVisit.lat === toVisit.lat && fromVisit.lng === toVisit.lng) {
      setPlane(toVisit.lat, toVisit.lng, toBearing);
      return;
    }

    const duration = 1900;
    const start = performance.now();

    function frame(now) {
      if (token !== planeAnimationToken) return;
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

    const nextVisit = visits[index + 1] || visits[0];
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

  loadTrips().catch(error => {
    console.error(error);
    statusEl.textContent = "Unable to load map.";
  });
});
