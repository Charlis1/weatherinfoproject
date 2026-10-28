/* Skyline Weather: live data from Open-Meteo (free, no API key).
   Replaces the whole inline <script> in your page. Your HTML and CSS stay as they are. */

const SETTINGS = {
  siteName: "Skyline Weather",
  footerText: "Weather data by Open-Meteo.com",
  defaultPlace: { name: "Quezon City, Philippines", lat: 14.676, lon: 121.0437 }
};

let useF = false;
let data = null;   // last forecast, kept so the °C/°F button can re-render
let place = SETTINGS.defaultPlace;
let theme = "light";
let mapInstance = null;
let mapMarker = null;
let selectedMapLocation = { lat: place.lat, lon: place.lon };
let cycloneCheckId = 0;

const $ = id => document.getElementById(id);
const deg = c => Math.round(useF ? c * 9 / 5 + 32 : c) + "°";

function applyTheme(nextTheme) {
  theme = nextTheme;
  document.documentElement.dataset.theme = theme;
  const btn = $("theme");
  if (!btn) return;
  const isDark = theme === "dark";
  btn.textContent = isDark ? "☀️ Light" : "🌙 Dark";
  btn.setAttribute("aria-pressed", String(isDark));
  localStorage.setItem("weather-theme", theme);
}

function initTheme() {
  const saved = localStorage.getItem("weather-theme");
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (prefersDark ? "dark" : "light"));
}

function openMapPicker() {
  const modal = $("mapModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");

  if (!window.L) return;
  if (!mapInstance) {
    mapInstance = L.map("map").setView([place.lat, place.lon], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(mapInstance);

    mapMarker = L.marker([place.lat, place.lon], { draggable: true }).addTo(mapInstance);
    mapMarker.on("dragend", () => {
      const pos = mapMarker.getLatLng();
      selectedMapLocation = { lat: pos.lat, lon: pos.lng };
    });
    mapInstance.on("click", e => {
      selectedMapLocation = { lat: e.latlng.lat, lon: e.latlng.lng };
      mapMarker.setLatLng(e.latlng);
    });
  }

  selectedMapLocation = { lat: place.lat, lon: place.lon };
  mapMarker.setLatLng([place.lat, place.lon]);
  mapInstance.setView([place.lat, place.lon], 5);
}

function closeMapPicker() {
  const modal = $("mapModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

function toggleMenu() {
  const panel = $("menuPanel");
  const backdrop = $("menuBackdrop");
  if (!panel || !backdrop) return;
  const open = panel.classList.toggle("open");
  backdrop.classList.toggle("open", open);
  panel.setAttribute("aria-expanded", String(open));
  backdrop.setAttribute("aria-hidden", String(!open));
}

function closeMenu() {
  const panel = $("menuPanel");
  const backdrop = $("menuBackdrop");
  if (!panel || !backdrop) return;
  panel.classList.remove("open");
  backdrop.classList.remove("open");
}

function openLiveWeatherMap() {
  const modal = $("weatherMapModal");
  const frame = $("weatherMapFrame");
  if (!modal || !frame) return;

  closeMenu();
  const params = new URLSearchParams({
    lat: String(place.lat),
    lon: String(place.lon),
    detailLat: String(place.lat),
    detailLon: String(place.lon),
    width: "1000",
    height: "700",
    zoom: "5",
    level: "surface",
    overlay: "clouds",
    product: "ecmwf",
    menu: "1",
    message: "true",
    marker: "",
    calendar: "now",
    pressure: "",
    type: "map",
    location: "coordinates",
    detail: "",
    metricWind: "default",
    metricTemp: "default"
  });
  frame.src = "https://embed.windy.com/embed2.html?" + params.toString();
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  $("closeWeatherMap").focus();
}

function closeLiveWeatherMap() {
  const modal = $("weatherMapModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  $("weatherMapFrame").src = "about:blank";
  $("liveWeatherMapBtn").focus();
}

async function applyMapSelection() {
  const lat = selectedMapLocation.lat;
  const lon = selectedMapLocation.lon;
  try {
    const res = await fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" + lat + "&lon=" + lon);
    const data = await res.json();
    const address = data.address || {};
    const name = [address.city || address.town || address.village || address.state || address.county, address.country].filter(Boolean).join(", ");
    place = {
      name: name || data.display_name || "Selected location",
      lat,
      lon
    };
  } catch (err) {
    place = { name: "Selected location", lat, lon };
  }

  closeMapPicker();
  loadWeather();
}

/* WMO weather codes -> label, icon, hero sky */
function describe(code, isDay) {
  if (code === 0 || code === 1) return isDay ? ["Clear sky", "☀️", "sunny"] : ["Clear night", "🌙", "night"];
  if (code === 2) return ["Partly cloudy", isDay ? "⛅" : "☁️", isDay ? "sunny" : "night"];
  if (code === 3) return ["Overcast", "☁️", "cloudy"];
  if (code === 45 || code === 48) return ["Fog", "🌫️", "cloudy"];
  if (code >= 51 && code <= 57) return ["Drizzle", "🌦️", "rain"];
  if (code >= 61 && code <= 67) return ["Rain", "🌧️", "rain"];
  if (code >= 71 && code <= 77) return ["Snow", "🌨️", "cloudy"];
  if (code >= 80 && code <= 82) return ["Rain showers", "🌦️", "rain"];
  if (code === 85 || code === 86) return ["Snow showers", "🌨️", "cloudy"];
  if (code >= 95) return ["Thunderstorm", "⛈️", "rain"];
  return ["Unknown", "❓", "cloudy"];
}

/* "2026-10-28T05:48" -> "5:48 AM" (the API already returns the place's local time) */
function clock(iso) {
  const [h, m] = iso.slice(11, 16).split(":").map(Number);
  return ((h + 11) % 12 + 1) + ":" + String(m).padStart(2, "0") + (h < 12 ? " AM" : " PM");
}
const localDate = iso => new Date(iso.slice(0, 10) + "T12:00:00");

function showMessage(text) {
  const a = $("alert");
  a.textContent = text;
  a.hidden = !text;
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const radians = degrees => degrees * Math.PI / 180;
  const deltaLat = radians(lat2 - lat1);
  const deltaLon = radians(lon2 - lon1);
  const arc = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

async function checkCycloneAlert() {
  const requestId = ++cycloneCheckId;
  const checkedPlace = { ...place };
  const warning = $("cycloneAlert");
  const warningText = $("cycloneAlertText");
  const warningLink = $("cycloneAlertLink");
  if (!warning || !warningText || !warningLink) return;

  try {
    const response = await fetch("https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventtype=TC&alertlevel=Green", {
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error("GDACS request failed: " + response.status);
    const feed = await response.json();
    const nearbyCyclones = (feed.features || []).flatMap(feature => {
      const properties = feature.properties || {};
      const coordinates = feature.geometry?.coordinates;
      if (properties.eventtype !== "TC" || properties.iscurrent !== "true" || !Array.isArray(coordinates)) return [];
      const [lon, lat] = coordinates;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
      const distance = distanceKm(checkedPlace.lat, checkedPlace.lon, lat, lon);
      return distance <= 300 ? [{ properties, distance }] : [];
    }).sort((first, second) => first.distance - second.distance);

    if (requestId !== cycloneCheckId || checkedPlace.lat !== place.lat || checkedPlace.lon !== place.lon) return;
    if (!nearbyCyclones.length) {
      warning.hidden = true;
      return;
    }

    const nearest = nearbyCyclones[0];
    const event = nearest.properties;
    const cycloneName = event.name || event.eventname || "Tropical cyclone";
    const alertLevel = event.episodealertlevel || event.alertlevel || "active";
    warningText.textContent = `${cycloneName} (${alertLevel} alert) is reported about ${Math.round(nearest.distance)} km from ${checkedPlace.name}. Follow local emergency guidance.`;
    if (event.url?.report) warningLink.href = event.url.report;
    else warningLink.href = "https://www.gdacs.org/";
    warning.hidden = false;
  } catch (error) {
    if (requestId === cycloneCheckId) warning.hidden = true;
  }
}

async function loadWeather() {
  showMessage("");
  checkCycloneAlert();
  const url = "https://api.open-meteo.com/v1/forecast" +
    "?latitude=" + place.lat + "&longitude=" + place.lon +
    "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day" +
    "&hourly=temperature_2m,weather_code,is_day,precipitation_probability" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max" +
    "&timezone=auto&forecast_days=7";
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    data = await res.json();
    render();
  } catch (err) {
    showMessage("Could not load the forecast. Check your connection and try again.");
  }
}

async function searchCity(name) {
  showMessage("");
  try {
    const res = await fetch("https://geocoding-api.open-meteo.com/v1/search?count=1&name=" + encodeURIComponent(name));
    const json = await res.json();
    if (!json.results || !json.results.length) {
      showMessage('No city found for "' + name + '". Try another spelling.');
      return;
    }
    const r = json.results[0];
    place = {
      name: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
      lat: r.latitude,
      lon: r.longitude
    };
    loadWeather();
  } catch (err) {
    showMessage("City search failed. Check your connection and try again.");
  }
}

function render() {
  document.title = SETTINGS.siteName;
  $("brand").textContent = "⛅ " + SETTINGS.siteName;
  $("footer").textContent = SETTINGS.footerText;
  if (!data) return;

  const cur = data.current, d = data.daily, h = data.hourly;
  const [label, icon, sky] = describe(cur.weather_code, cur.is_day);

  $("loc").textContent = place.name;
  $("date").textContent = localDate(cur.time).toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });
  $("hero").dataset.sky = sky;
  $("temp").textContent = deg(cur.temperature_2m);
  $("mini-temp").textContent = deg(cur.temperature_2m);
  $("cond").textContent = icon + " " + label;
  $("hilo").textContent = "High " + deg(d.temperature_2m_max[0]) + " · Low " + deg(d.temperature_2m_min[0]);
  $("mini-feels").textContent = deg(cur.apparent_temperature);
  $("mini-wind").textContent = Math.round(cur.wind_speed_10m) + " km/h";
  $("mini-rain").textContent = (d.precipitation_probability_max[0] ?? 0) + "%";
  $("mini-humidity").textContent = cur.relative_humidity_2m + "%";

  const stats = [
    ["Feels like", deg(cur.apparent_temperature)],
    ["Humidity", cur.relative_humidity_2m + "%"],
    ["Wind", Math.round(cur.wind_speed_10m) + " km/h"],
    ["UV index", String(Math.round(d.uv_index_max[0]))],
    ["Sunrise", clock(d.sunrise[0])],
    ["Sunset", clock(d.sunset[0])]
  ];
  $("stats").innerHTML = stats.map(s =>
    `<div class="stat"><div class="k">${s[0]}</div><div class="v">${s[1]}</div></div>`).join("");

  /* Current hourly forecast point plus the next 9 hours */
  const start = Math.max(h.time.findIndex(t => t >= cur.time.slice(0, 13)), 0);
  const hourlySlice = [];
  const HOURS_TO_SHOW = 10;
  for (let i = start; i < Math.min(start + HOURS_TO_SHOW, h.time.length); i++) {
    const [label, icon] = describe(h.weather_code[i], h.is_day[i]);
    hourlySlice.push({
      time: i === start ? "Now" : clock(h.time[i]),
      temp: h.temperature_2m[i],
      rainChance: h.precipitation_probability?.[i] ?? null,
      icon,
      label
    });
  }

  if (hourlySlice.length) {
    $("hourly").innerHTML = `<div class="hourly-list" aria-label="Hourly forecast">${hourlySlice.map(item => `
      <div class="hour-row">
        <span class="hour-time">${item.time}</span>
        <span class="hour-icon" aria-hidden="true">${item.icon}</span>
        <span class="hour-condition">${item.label}</span>
        <span class="hour-temp">${deg(item.temp)}</span>
      </div>
    `).join("")}</div>`;
  } else {
    $("hourly").innerHTML = "";
  }

  const RAIN_THRESHOLD = 40;
  const DRY_THRESHOLD = 20;
  const RAIN_HORIZON_HOURS = 24;
  const rainForecast = h.time.slice(start, start + RAIN_HORIZON_HOURS).map((time, offset) => ({
    time,
    chance: h.precipitation_probability?.[start + offset] ?? null,
    weatherCode: h.weather_code?.[start + offset],
    label: offset === 0 ? "Now" : clock(time)
  })).filter(item => item.chance !== null);
  const groupHours = (hours, condition) => {
    const groups = [];
    for (const hour of hours) {
      if (condition(hour)) {
        const previous = groups[groups.length - 1];
        if (previous && previous.endIndex === hour.index - 1) {
          previous.end = hour.label;
          previous.endIndex = hour.index;
          previous.maxChance = Math.max(previous.maxChance, hour.chance);
        } else {
          groups.push({ start: hour.label, end: hour.label, endIndex: hour.index, maxChance: hour.chance });
        }
      }
    }
    return groups;
  };
  const indexedRainHours = rainForecast.map((hour, index) => ({ ...hour, index }));
  const rainWindows = groupHours(indexedRainHours, hour => hour.chance >= RAIN_THRESHOLD);
  const dryWindows = groupHours(indexedRainHours, hour => hour.chance <= DRY_THRESHOLD);
  const highestRainChance = Math.max(0, ...rainForecast.map(hour => hour.chance));
  const renderWindows = windows => windows.length
    ? windows.slice(0, 3).map(window => {
      const time = window.start === window.end ? window.start : `${window.start}–${window.end}`;
      return `${time} (up to ${window.maxChance}%)`;
    }).join(", ") + (windows.length > 3 ? ", …" : "")
    : "None in the next 24 hours";
  const peakHour = rainForecast.find(hour => hour.chance === highestRainChance);
  const rainStatus = peakHour
    ? `Peak rain chance: ${highestRainChance}% at ${peakHour.label}`
    : "Rain probability unavailable";
  const thunderstormExpected = rainForecast.some(hour => hour.weatherCode >= 95);
  let activityAdvice;
  if (!rainForecast.length) {
    activityAdvice = {
      good: "Rain-based activity advice is unavailable right now.",
      avoid: "Check the latest local forecast before planning outdoor activities."
    };
  } else if (thunderstormExpected) {
    activityAdvice = {
      good: "Choose indoor plans while thunderstorms are forecast.",
      avoid: "Postpone outdoor sports, cycling, picnics, and walks during thunderstorm periods."
    };
  } else if (rainWindows.length) {
    activityAdvice = {
      good: dryWindows.length ? `Plan walks or errands during likely dry periods (${renderWindows(dryWindows)}); bring rain protection.` : "Choose indoor activities and bring rain protection if going out.",
      avoid: "Reschedule picnics, outdoor sports, and cycling during likely rain periods."
    };
  } else {
    activityAdvice = {
      good: "A walk, picnic, or cycling may suit the rain outlook.",
      avoid: "No rain-related restrictions are indicated; check local conditions before heading out."
    };
  }
  $("rainOutlook").innerHTML = `
    <h3>Rain outlook</h3>
    <p class="rain-status">${rainStatus}</p>
    <div class="rain-detail"><strong>Rain chance ${RAIN_THRESHOLD}% or higher</strong><p>${renderWindows(rainWindows)}</p></div>
    <div class="rain-detail"><strong>Low rain chance (${DRY_THRESHOLD}% or lower)</strong><p>${renderWindows(dryWindows)}</p></div>
    <div class="rain-detail"><strong>Good choices</strong><p>${activityAdvice.good}</p></div>
    <div class="rain-detail"><strong>Avoid or reschedule</strong><p>${activityAdvice.avoid}</p></div>
  `;

  /* 7-day forecast */
  const min = Math.min(...d.temperature_2m_min);
  const max = Math.max(...d.temperature_2m_max);
  const span = Math.max(max - min, 1);
  $("daily").innerHTML = d.time.map((t, i) => {
    const left = (d.temperature_2m_min[i] - min) / span * 100;
    const width = (d.temperature_2m_max[i] - d.temperature_2m_min[i]) / span * 100;
    const name = i === 0 ? "Today" : localDate(t).toLocaleDateString("en-US", { weekday: "short" });
    return `<div class="day">
      <span class="n">${name}</span><span class="i">${describe(d.weather_code[i], 1)[1]}</span>
      <div class="track"><div class="fill" style="left:${left}%;width:${Math.max(width, 6)}%"></div></div>
      <span class="lo">${deg(d.temperature_2m_min[i])}</span><span class="hi">${deg(d.temperature_2m_max[i])}</span>
      <span class="rain">${d.precipitation_probability_max[i] ?? 0}% chance of rain</span>
    </div>`;
  }).join("");
}

$("unit").addEventListener("click", e => {
  useF = !useF;
  e.currentTarget.textContent = useF ? "°F" : "°C";
  e.currentTarget.setAttribute("aria-pressed", String(useF));
  render();
});

$("theme").addEventListener("click", () => {
  applyTheme(theme === "dark" ? "light" : "dark");
});

$("menuToggle").addEventListener("click", toggleMenu);
$("menuBackdrop").addEventListener("click", closeMenu);
$("liveWeatherMapBtn").addEventListener("click", openLiveWeatherMap);
$("closeWeatherMap").addEventListener("click", closeLiveWeatherMap);
$("weatherMapModal").addEventListener("click", e => {
  if (e.target === e.currentTarget) closeLiveWeatherMap();
});
$("mapPickerBtn").addEventListener("click", openMapPicker);
$("closeMap").addEventListener("click", closeMapPicker);
$("confirmLocation").addEventListener("click", applyMapSelection);

$("search").addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.value.trim()) {
    closeMapPicker();
    searchCity(e.target.value.trim());
  }
});

/* Ask the browser for the visitor's location (needs HTTPS or localhost) */
function locate() {
  if (!navigator.geolocation) {
    loadWeather();
    showMessage("Your browser can't share location, so this is the default city. Search for yours.");
    return;
  }
  showMessage("Allow location access to see the weather where you are.");
  navigator.geolocation.getCurrentPosition(async pos => {
    place = { name: "Your location", lat: pos.coords.latitude, lon: pos.coords.longitude };
    try {
      /* Open-Meteo has no reverse geocoding, so use BigDataCloud's free client-side endpoint */
      const res = await fetch("https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en" +
        "&latitude=" + place.lat + "&longitude=" + place.lon);
      const g = await res.json();
      const label = [g.city || g.locality, g.principalSubdivision, g.countryName].filter(Boolean).join(", ");
      if (label) place.name = label;
    } catch (err) { /* keep "Your location" */ }
    loadWeather();
  }, () => {
    place = SETTINGS.defaultPlace;
    loadWeather();
    showMessage("Location is off, so this is the default city. Search for yours or tap 📍 to try again.");
  }, { timeout: 10000, maximumAge: 600000 });
}

/* Location button next to the unit toggle, to ask again */
const pin = document.createElement("button");
pin.type = "button";
pin.title = "Use my location";
pin.setAttribute("aria-label", "Use my location");
pin.innerHTML = `
  <span style="display:inline-flex;align-items:center;gap:8px;">
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" style="display:block;vertical-align:middle;">
      <path d="M12 2.5a7.5 7.5 0 0 1 7.5 7.5c0 5.2-7.5 11.5-7.5 11.5S4.5 15.2 4.5 10A7.5 7.5 0 0 1 12 2.5zm0 4.1a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z" fill="currentColor"/>
    </svg>
    <span>my location</span>
  </span>
`;
pin.addEventListener("click", locate);
$("unit").before(pin);

initTheme();
render();
locate();
setInterval(checkCycloneAlert, 15 * 60 * 1000);