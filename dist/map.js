// ============================================================
// ROKTOKONIKA — Map Logic  (map.js)
// Uses: Leaflet.js + OpenStreetMap + Leaflet Routing Machine
// ============================================================

let mapInstance = null;    // Leaflet map object
let routeControl = null;   // Leaflet Routing Machine control
let donorCoords = null;    // [lat, lng] of donor area
let hospitalCoords = null; // [lat, lng] of hospital

const DHAKA_CENTER = [23.8103, 90.4125];

// ── Geocode a query string using Nominatim (free, no key) ──
async function geocodeLocation(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ', Dhaka, Bangladesh')}&format=json&limit=1`;
  try {
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    if (data.length) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    return null;
  } catch { return null; }
}

// ── Initialize map ──
async function initMap(containerId, donorArea, hospitalAddress, reqLocation) {
  const status = document.getElementById('map-status');

  // Destroy previous map instance to avoid errors on re-open
  if (mapInstance) { mapInstance.remove(); mapInstance = null; routeControl = null; }

  mapInstance = L.map(containerId, { zoomControl: true, attributionControl: false })
    .setView(DHAKA_CENTER, 12);

  // OpenStreetMap tiles (free)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(mapInstance);

  // Custom red marker icon
  const redIcon = L.divIcon({
    html: '<div style="background:#B91C1C;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>',
    className: '', iconSize: [14, 14], iconAnchor: [7, 7]
  });
  const greenIcon = L.divIcon({
    html: '<div style="background:#059669;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>',
    className: '', iconSize: [14, 14], iconAnchor: [7, 7]
  });

  // Geocode donor location
  if (status) status.textContent = 'Finding donor location…';
  donorCoords = await geocodeLocation(donorArea || 'Dhaka');
  if (donorCoords) {
    L.marker(donorCoords, { icon: redIcon })
      .addTo(mapInstance)
      .bindPopup(`<b>Donor Area</b><br>${donorArea}`)
      .openPopup();
    mapInstance.setView(donorCoords, 13);
    if (status) status.textContent = `Donor area: ${donorArea}. Enter hospital address and click "Show Route".`;
  } else {
    if (status) status.textContent = 'Could not locate donor area. Enter hospital address to show route.';
  }

  // If hospital address already provided, geocode it too
  if (hospitalAddress) {
    document.getElementById('hospital-address-input').value = hospitalAddress;
    hospitalCoords = await geocodeLocation(hospitalAddress);
    if (hospitalCoords && donorCoords) {
      L.marker(hospitalCoords, { icon: greenIcon })
        .addTo(mapInstance)
        .bindPopup('<b>Hospital</b>');
      drawRoute(donorCoords, hospitalCoords);
    }
  }

  // Fix map size (sometimes needed after modal open)
  setTimeout(() => mapInstance && mapInstance.invalidateSize(), 200);
}

// ── Called when user clicks "Show Route" ──
async function geocodeAndRoute() {
  const btn = document.querySelector('#volunteer-modal .map-input-row .btn');
  const status = document.getElementById('map-status');
  const addressInput = document.getElementById('hospital-address-input');
  const address = addressInput.value.trim();
  if (!address) { if (status) status.textContent = 'Please enter a hospital address.'; return; }
  if (btn) { btn.textContent = 'Locating…'; btn.disabled = true; }
  if (status) status.textContent = 'Geocoding hospital address…';

  hospitalCoords = await geocodeLocation(address);
  if (btn) { btn.textContent = 'Show Route'; btn.disabled = false; }

  if (!hospitalCoords) {
    if (status) status.textContent = '⚠ Hospital not found. Try a more specific address (e.g. "DMCH, Bakshibazar, Dhaka").';
    return;
  }

  // Green marker for hospital
  const greenIcon = L.divIcon({
    html: '<div style="background:#059669;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>',
    className: '', iconSize: [14, 14], iconAnchor: [7, 7]
  });
  L.marker(hospitalCoords, { icon: greenIcon }).addTo(mapInstance).bindPopup('<b>Hospital</b>').openPopup();
  if (status) status.textContent = 'Drawing route…';

  if (donorCoords) {
    drawRoute(donorCoords, hospitalCoords);
    if (status) status.textContent = '🗺 Route shown. Red = Donor area, Green = Hospital.';
  } else {
    mapInstance.setView(hospitalCoords, 14);
    if (status) status.textContent = '🏥 Hospital found. Donor area could not be geocoded.';
  }
}

// ── Draw route using OSRM (free) ──
function drawRoute(from, to) {
  if (!mapInstance) return;
  if (routeControl) { routeControl.remove(); routeControl = null; }

  routeControl = L.Routing.control({
    waypoints: [L.latLng(from[0], from[1]), L.latLng(to[0], to[1])],
    router: L.Routing.osrmv1({
      serviceUrl: 'https://router.project-osrm.org/route/v1',
      profile: 'car'
    }),
    lineOptions: {
      styles: [{ color: '#B91C1C', weight: 4, opacity: 0.8 }]
    },
    addWaypoints: false,
    draggableWaypoints: false,
    fitSelectedRoutes: true,
    showAlternatives: false,
    collapsible: true,
    show: false,  // hide the text directions panel to save space
    createMarker: () => null,  // use our custom markers already placed
  });

  routeControl.addTo(mapInstance);

  routeControl.on('routesfound', e => {
    const summary = e.routes[0].summary;
    const km = (summary.totalDistance / 1000).toFixed(1);
    const min = Math.round(summary.totalTime / 60);
    const status = document.getElementById('map-status');
    if (status) status.textContent = `🛣 Distance: ~${km} km · ~${min} min by car`;
  });

  routeControl.on('routingerror', () => {
    const status = document.getElementById('map-status');
    if (status) status.textContent = '⚠ Could not calculate route. Check addresses.';
  });
}
