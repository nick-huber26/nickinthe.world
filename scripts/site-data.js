(function attachSiteData(global) {
  const GAY_MEN_FLAG_COLORS = ["#078D70", "#26CEAA", "#98E8C1", "#5EC8E5", "#7BADE2", "#5049CC", "#3D1A78"];
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function parsePipeList(value) {
    return String(value || "")
      .split("|")
      .map(item => item.trim())
      .filter(Boolean);
  }

  function parseExplicitImages(value) {
    return parsePipeList(value);
  }

  function buildNumberedImages(folder, count, ext) {
    const cleanFolder = String(folder || "").trim().replace(/\/+$/, "");
    const total = parseInt(String(count || "").trim(), 10);
    const cleanExt = String(ext || "jpg").trim().replace(/^\./, "");
    if (!cleanFolder || !Number.isFinite(total) || total < 1) return [];
    return Array.from({ length: total }, (_, imageIndex) => `${cleanFolder}/${imageIndex + 1}.${cleanExt}`);
  }

  function splitParagraphs(body) {
    return String(body || "")
      .split(/\n\s*\n/)
      .map(paragraph => paragraph.trim())
      .filter(Boolean);
  }

  function parseDateValue(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const timestamp = Date.UTC(year, month, day, 12, 0, 0);
    return {
      raw,
      timestamp,
      label: dateFormatter.format(new Date(timestamp))
    };
  }

  function parseRatingValue(value) {
    const numeric = parseFloat(String(value || "").trim());
    if (!Number.isFinite(numeric)) return null;
    return Math.min(5, Math.max(0, numeric));
  }

  function normalizeColor(value, index) {
    const trimmed = String(value || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
    return GAY_MEN_FLAG_COLORS[index % GAY_MEN_FLAG_COLORS.length];
  }

  function buildCityKey(city, country, explicitKey) {
    const explicit = slugify(explicitKey);
    if (explicit) return explicit;
    const cityPart = slugify(city);
    const countryPart = slugify(country);
    return countryPart ? `${cityPart}-${countryPart}` : cityPart;
  }

  function buildGoogleSheetCsvUrl(sheetUrl, fallbackPath) {
    try {
      const url = new URL(sheetUrl);
      const match = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
      if (!match) return fallbackPath;
      const spreadsheetId = match[1];
      const gid = url.searchParams.get("gid") || "0";
      return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
    } catch (error) {
      return fallbackPath;
    }
  }

  function resolveCsvSource(sheetUrl, fallbackPath) {
    const raw = String(sheetUrl || "").trim();
    if (!raw) return fallbackPath;
    if (raw.includes("output=csv")) return raw;
    return buildGoogleSheetCsvUrl(raw, fallbackPath);
  }

  async function fetchTextWithFallback(options) {
    const {
      primaryUrl,
      fallbackUrl,
      primaryLabel = "Remote CSV",
      fallbackLabel = "Local fallback"
    } = options;

    let lastError = null;

    if (primaryUrl) {
      try {
        const response = await fetch(primaryUrl, { cache: "no-store" });
        if (!response.ok) throw new Error(`Failed to load ${primaryUrl}: ${response.status}`);
        return {
          text: await response.text(),
          sourceLabel: primaryLabel
        };
      } catch (error) {
        lastError = error;
      }
    }

    if (fallbackUrl && fallbackUrl !== primaryUrl) {
      try {
        const fallbackResponse = await fetch(fallbackUrl, { cache: "no-store" });
        if (!fallbackResponse.ok) throw new Error(`Failed to load ${fallbackUrl}: ${fallbackResponse.status}`);
        return {
          text: await fallbackResponse.text(),
          sourceLabel: fallbackLabel
        };
      } catch (fallbackError) {
        lastError = fallbackError;
      }
    }

    throw lastError || new Error("Unable to load any CSV source.");
  }

  function parseCitiesCsv(csvText, Papa) {
    const cleaned = String(csvText || "").replace(/^\uFEFF/, "");
    const parsed = Papa.parse(cleaned, {
      header: true,
      skipEmptyLines: "greedy",
      dynamicTyping: false
    });

    const rawRows = (parsed.data || [])
      .map((row, rowIndex) => {
        const city = String(row.city || "").trim();
        const country = String(row.country || "").trim();
        const cityKey = buildCityKey(city, country, row.city_key);
        return { row, rowIndex, cityKey };
      })
      .filter(item => item.cityKey);

    const metadataByCity = new Map();
    rawRows.forEach(({ row, cityKey, rowIndex }) => {
      const existing = metadataByCity.get(cityKey) || {};
      const cityDescription = String(row.city_description || "").trim();
      const cityHeroImage = String(row.city_hero_image || "").trim();
      metadataByCity.set(cityKey, {
        cityKey,
        city: String(row.city || existing.city || "").trim(),
        country: String(row.country || existing.country || "").trim(),
        lat: String(row.lat || existing.lat || "").trim(),
        lng: String(row.lng || existing.lng || "").trim(),
        imageFolder: String(row.image_folder || existing.imageFolder || `images/${cityKey}`).trim(),
        imageCount: String(row.image_count || existing.imageCount || "").trim(),
        imageExt: String(row.image_ext || existing.imageExt || "jpg").trim(),
        imageAlt: String(row.image_alt || existing.imageAlt || "").trim(),
        accent: String(row.accent || existing.accent || "").trim(),
        cityDescription: cityDescription || existing.cityDescription || "",
        cityHeroImage: cityHeroImage || existing.cityHeroImage || "",
        firstSeen: existing.firstSeen ?? rowIndex
      });
    });

    const visits = rawRows
      .map(({ row, rowIndex, cityKey }) => {
        const meta = metadataByCity.get(cityKey) || {};
        const parsedDate = parseDateValue(row.date);
        const lat = parseFloat(String(row.lat || meta.lat || "").trim());
        const lng = parseFloat(String(row.lng || meta.lng || "").trim());
        const explicitImages = parseExplicitImages(row.images);
        const folderImages = buildNumberedImages(
          row.image_folder || meta.imageFolder,
          row.image_count || meta.imageCount,
          row.image_ext || meta.imageExt
        );
        const summary = String(row.summary || "").trim();
        const story = String(row.story || "").trim();
        const legalProtections = parseRatingValue(row.legal_protections);
        const foreignerFriendliness = parseRatingValue(row.foreigner_friendliness);
        const neighborhoods = parsePipeList(row.neighborhoods);
        const spaces = parsePipeList(row.spaces);

        if (!parsedDate || !Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null;
        }

        return {
          id: String(row.id || `${cityKey}-${parsedDate.raw}-${rowIndex + 1}`).trim(),
          cityKey,
          city: String(row.city || meta.city || cityKey).trim(),
          country: String(row.country || meta.country || "").trim(),
          date: parsedDate.raw,
          dateLabel: parsedDate.label,
          timestamp: parsedDate.timestamp,
          lat,
          lng,
          title: String(row.title || "").trim(),
          summary,
          story,
          legalProtections,
          foreignerFriendliness,
          neighborhoods,
          spaces,
          connectionIds: parsePipeList(row.connection_tags).map(item => slugify(item)).filter(Boolean),
          images: explicitImages.length ? explicitImages : folderImages,
          imageAlt: String(row.image_alt || meta.imageAlt || row.title || row.city || "").trim(),
          themeColor: normalizeColor(row.accent || meta.accent, rowIndex),
          sourceIndex: rowIndex
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
        return a.sourceIndex - b.sourceIndex;
      });

    const groupedCities = new Map();
    visits.forEach((visit, visitIndex) => {
      const existing = groupedCities.get(visit.cityKey);
      if (existing) {
        existing.visits.push(visit);
        existing.firstVisitIndex = Math.min(existing.firstVisitIndex, visitIndex);
        if (Number.isFinite(visit.legalProtections)) {
          existing.legalProtectionsTotal += visit.legalProtections;
          existing.legalProtectionsCount += 1;
        }
        if (Number.isFinite(visit.foreignerFriendliness)) {
          existing.foreignerFriendlinessTotal += visit.foreignerFriendliness;
          existing.foreignerFriendlinessCount += 1;
        }
        visit.neighborhoods.forEach(item => {
          if (!existing.neighborhoodLookup.has(item.toLowerCase())) {
            existing.neighborhoodLookup.add(item.toLowerCase());
            existing.neighborhoods.push(item);
          }
        });
        visit.spaces.forEach(item => {
          if (!existing.spaceLookup.has(item.toLowerCase())) {
            existing.spaceLookup.add(item.toLowerCase());
            existing.spaces.push(item);
          }
        });
        return;
      }

      groupedCities.set(visit.cityKey, {
        key: visit.cityKey,
        city: visit.city,
        country: visit.country,
        lat: visit.lat,
        lng: visit.lng,
        themeColor: visit.themeColor,
        cityDescription: String(metadataByCity.get(visit.cityKey)?.cityDescription || "").trim(),
        cityHeroImage: String(metadataByCity.get(visit.cityKey)?.cityHeroImage || "").trim(),
        visits: [visit],
        firstVisitIndex: visitIndex,
        legalProtectionsTotal: Number.isFinite(visit.legalProtections) ? visit.legalProtections : 0,
        legalProtectionsCount: Number.isFinite(visit.legalProtections) ? 1 : 0,
        foreignerFriendlinessTotal: Number.isFinite(visit.foreignerFriendliness) ? visit.foreignerFriendliness : 0,
        foreignerFriendlinessCount: Number.isFinite(visit.foreignerFriendliness) ? 1 : 0,
        neighborhoods: [...visit.neighborhoods],
        neighborhoodLookup: new Set(visit.neighborhoods.map(item => item.toLowerCase())),
        spaces: [...visit.spaces],
        spaceLookup: new Set(visit.spaces.map(item => item.toLowerCase())),
        relatedConnectionIds: [],
        relatedConnections: []
      });
    });

    groupedCities.forEach(city => {
      city.legalProtectionsAverage = city.legalProtectionsCount
        ? city.legalProtectionsTotal / city.legalProtectionsCount
        : null;
      city.foreignerFriendlinessAverage = city.foreignerFriendlinessCount
        ? city.foreignerFriendlinessTotal / city.foreignerFriendlinessCount
        : null;
    });

    return {
      visits,
      cities: Array.from(groupedCities.values()).sort((a, b) => a.firstVisitIndex - b.firstVisitIndex)
    };
  }

  function parseConnectionsCsv(csvText, Papa) {
    const cleaned = String(csvText || "").replace(/^\uFEFF/, "");
    const parsed = Papa.parse(cleaned, {
      header: true,
      skipEmptyLines: "greedy",
      dynamicTyping: false
    });

    return (parsed.data || [])
      .map((row, rowIndex) => {
        const title = String(row.title || "").trim();
        const id = slugify(row.id || row.slug || title || `connection-${rowIndex + 1}`);
        if (!id) return null;

        const explicitImages = parseExplicitImages(row.images);
        const folderImages = buildNumberedImages(row.image_folder, row.image_count, row.image_ext);

        return {
          id,
          slug: slugify(row.slug || id) || id,
          anchorId: `connection-${slugify(row.slug || id) || id}`,
          title: title || id,
          summary: String(row.summary || "").trim(),
          body: String(row.body || "").trim(),
          topicTags: parsePipeList(row.topic_tags),
          cityKeys: parsePipeList(row.city_tags).map(item => slugify(item)).filter(Boolean),
          images: explicitImages.length ? explicitImages : folderImages,
          imageAlt: String(row.image_alt || title || id).trim(),
          themeColor: normalizeColor(row.accent, rowIndex),
          sourceIndex: rowIndex,
          relatedCities: []
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.sourceIndex - b.sourceIndex);
  }

  function buildCrossReferenceState(visits, cities, connections) {
    const cityByKey = new Map(cities.map(city => [city.key, city]));
    const cityBySlug = new Map(cities.map(city => [slugify(city.city), city]));
    const connectionById = new Map(connections.map(connection => [connection.id, connection]));
    const cityConnectionMap = new Map(cities.map(city => [city.key, new Set()]));
    const connectionCityMap = new Map(
      connections.map(connection => [connection.id, new Set(resolveConnectionCityKeys(connection.cityKeys, cityByKey, cityBySlug))])
    );

    visits.forEach(visit => {
      visit.connectionIds
        .filter(connectionId => connectionById.has(connectionId))
        .forEach(connectionId => {
          cityConnectionMap.get(visit.cityKey)?.add(connectionId);
          connectionCityMap.get(connectionId)?.add(visit.cityKey);
        });
    });

    connections.forEach(connection => {
      connection.cityKeys
        .filter(cityKey => cityByKey.has(cityKey))
        .forEach(cityKey => cityConnectionMap.get(cityKey)?.add(connection.id));
    });

    cities.forEach(city => {
      const relatedConnectionIds = Array.from(cityConnectionMap.get(city.key) || []);
      city.relatedConnectionIds = relatedConnectionIds;
      city.relatedConnections = relatedConnectionIds
        .map(connectionId => connectionById.get(connectionId))
        .filter(Boolean);
    });

    visits.forEach(visit => {
      const visitIds = new Set(
        visit.connectionIds.filter(connectionId => connectionById.has(connectionId))
      );
      (cityConnectionMap.get(visit.cityKey) || new Set()).forEach(connectionId => visitIds.add(connectionId));
      visit.relatedConnectionIds = Array.from(visitIds);
      visit.relatedConnections = visit.relatedConnectionIds
        .map(connectionId => connectionById.get(connectionId))
        .filter(Boolean);
    });

    connections.forEach(connection => {
      const relatedCityKeys = Array.from(connectionCityMap.get(connection.id) || [])
        .filter(cityKey => cityByKey.has(cityKey));
      connection.cityKeys = relatedCityKeys;
      connection.relatedCities = relatedCityKeys
        .map(cityKey => cityByKey.get(cityKey))
        .filter(Boolean);
    });

    return {
      cityByKey,
      connectionById
    };
  }

  function resolveConnectionCityKeys(rawCityKeys, cityByKey, cityBySlug) {
    return rawCityKeys
      .map(rawKey => {
        if (cityByKey.has(rawKey)) return rawKey;
        const city = cityBySlug.get(rawKey);
        return city ? city.key : "";
      })
      .filter(Boolean);
  }

  function buildGalleryMarkup(key, images, imageAlt, emptyLabel) {
    if (!images.length) {
      return `<div class="empty-media">${escapeHtml(emptyLabel)}</div>`;
    }

    return `
      <div class="gallery-track">
        ${images.map((image, imageIndex) => `
          <div class="gallery-slide${imageIndex === 0 ? " active" : ""}" data-gallery-slide="${imageIndex}">
            <img loading="lazy" src="${escapeAttr(image)}" alt="${escapeAttr(imageAlt)}">
          </div>
        `).join("")}
      </div>
      ${images.length > 1 ? `
        <div class="gallery-dots">
          ${images.map((_, imageIndex) => `
            <span class="gallery-dot${imageIndex === 0 ? " active" : ""}" data-gallery-dot="${imageIndex}"></span>
          `).join("")}
        </div>
      ` : ""}
    `;
  }

  function startGalleries(root, intervalsMap) {
    intervalsMap.forEach(intervalId => clearInterval(intervalId));
    intervalsMap.clear();

    root.querySelectorAll("[data-gallery-key]").forEach((gallery, galleryIndex) => {
      const slides = Array.from(gallery.querySelectorAll("[data-gallery-slide]"));
      const dots = Array.from(gallery.querySelectorAll("[data-gallery-dot]"));
      if (slides.length < 2) return;

      let current = 0;
      const apply = next => {
        current = next;
        slides.forEach((slide, slideIndex) => slide.classList.toggle("active", slideIndex === current));
        dots.forEach((dot, dotIndex) => dot.classList.toggle("active", dotIndex === current));
      };

      const intervalId = global.setInterval(() => apply((current + 1) % slides.length), 3200 + (galleryIndex % 3) * 260);
      intervalsMap.set(keyFromGallery(gallery, galleryIndex), intervalId);
    });
  }

  function keyFromGallery(gallery, fallback) {
    return gallery.dataset.galleryKey || `gallery-${fallback}`;
  }

  global.SiteData = {
    GAY_MEN_FLAG_COLORS,
    slugify,
    escapeHtml,
    escapeAttr,
    parsePipeList,
    parseExplicitImages,
    buildNumberedImages,
    splitParagraphs,
    parseDateValue,
    parseRatingValue,
    normalizeColor,
    buildCityKey,
    resolveCsvSource,
    fetchTextWithFallback,
    parseCitiesCsv,
    parseConnectionsCsv,
    buildCrossReferenceState,
    buildGalleryMarkup,
    startGalleries
  };
})(window);
