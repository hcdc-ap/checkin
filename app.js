// app.js (Unified for both GAS and GitHub Pages)

// --- GLOBAL VARIABLES & CONSTANTS ---
// These variables are populated by Google Apps Script template when deployed as a web app.
// For GitHub Pages (static display), they will be set to fallback/mock values.
// The typeof google === 'undefined' check helps detect the environment.
let initialEmployeeId = '';
let initialCheckinCode = '';
let OFFICE_LATITUDE = 0;
let OFFICE_LONGITUDE = 0;
let ACCEPTABLE_RADIUS_METERS = 0;
let LOW_ACCURACY_THRESHOLD_FACTOR = 0;

// Dynamic variables for location and user info
let currentLatitude = null;
let currentLongitude = null;
let currentAccuracy = null;
let userIpAddress = 'Loading...';
let employeeName = 'Loading...';

// DOM Elements
const messageDiv = document.getElementById('message');
const checkinButton = document.getElementById('checkinButton');
const employeeIdDisplay = document.getElementById('employeeIdDisplay');
const checkinCodeDisplay = document.getElementById('checkinCodeDisplay');
const employeeNameDisplay = document.getElementById('employeeName');
const ipAddressDisplay = document.getElementById('ipAddress');
const currentAddressDisplay = document.getElementById('currentAddress');
const mapElement = document.getElementById('map');
const staticMapPlaceholder = document.getElementById('staticMapPlaceholder');
const calendarMonthSelect = document.getElementById('calendarMonth');
const employeeSelect = document.getElementById('employeeSelect');
const heatmapLoading = document.getElementById('heatmap-loading');
const containerDiv = document.getElementById('container');


// Map related variables
let map = null; // Single map instance
let officeMarker = null;
let employeeMarker = null;
let accuracyCircle = null;
let distanceCircle = null; // Note: distanceCircle was not used in previous code, but declared.

// Heatmap related variables
let allEmployees = [];
let currentHeatmapEmployee = ''; // Renamed to avoid conflict with `employeeName`
let currentHeatmapMonth = '';   // Renamed to avoid conflict with `currentMonth` (Date object)
let lastHeatmapResult = null; // Cache the last fetched result to avoid redundant calls

// --- ENVIRONMENT-SPECIFIC SETUP (GAS vs. GitHub Pages) ---
if (typeof google === 'undefined' || typeof google.script === 'undefined') {
    // This block runs ONLY on GitHub Pages (or local development outside GAS)
    console.warn("Running on a non-GAS environment. Mocking google.script.run and using hardcoded values.");

    // Hardcode placeholder values for GitHub Pages
    initialEmployeeId = 'DEMO_EMP_007';
    initialCheckinCode = 'DEMO_CODE_123';
    OFFICE_LATITUDE = 10.762622; // Example Latitude for HCDC
    OFFICE_LONGITUDE = 106.660172; // Example Longitude for HCDC
    ACCEPTABLE_RADIUS_METERS = 1701; // Example: 1.7km radius
    LOW_ACCURACY_THRESHOLD_FACTOR = 1.7;

    // Mock google.script.run to prevent errors
    window.google = {
        script: {
            run: new Proxy({}, {
                get: (target, prop) => {
                    return (...args) => {
                        console.info(`MOCK: google.script.run.${String(prop)} called with args:`, args);
                        return {
                            withSuccessHandler: (cb) => {
                                let mockData;
                                switch (String(prop)) {
                                    case 'getEmployeeNameById':
                                        mockData = 'Demo User (GitHub Pages)';
                                        break;
                                    case 'getUserIpAddress':
                                        mockData = '127.0.0.1 (Mock IP)';
                                        break;
                                    case 'saveAttendance':
                                        mockData = 'Check-in (Mock) successful! (No real data saved)';
                                        break;
                                    case 'getAttendanceDataForMap':
                                        mockData = {
                                            points: [
                                                { lat: OFFICE_LATITUDE, lng: OFFICE_LONGITUDE, status: 'Office', label: 'HCDC Office' },
                                                { lat: OFFICE_LATITUDE + 0.002, lng: OFFICE_LONGITUDE - 0.002, status: 'Valid', label: 'Mock Check-in Valid' },
                                                { lat: OFFICE_LATITUDE + 0.005, lng: OFFICE_LONGITUDE + 0.005, status: 'Remote (Outside Area)', label: 'Mock Check-in Remote' }
                                            ],
                                            error: null
                                        };
                                        break;
                                    case 'getGeoAddressByMapsService':
                                        mockData = `Mock Address: ${args[0].toFixed(4)}, ${args[1].toFixed(4)}`;
                                        break;
                                    case 'getAttendanceCalendarMonthWithRemote':
                                        const [year, month] = args;
                                        const dummyDaily = {};
                                        const today = new Date();
                                        if (year === today.getFullYear() && month === (today.getMonth() + 1)) {
                                            const currentDay = today.getDate();
                                            const dateStr = `${year}-${month.toString().padStart(2, '0')}-${currentDay.toString().padStart(2, '0')}`;
                                            dummyDaily[dateStr] = { valid: ['Demo User (GitHub Pages)'], remote: [] };
                                        }
                                        mockData = {
                                            daily: dummyDaily,
                                            employees: ['Demo User (GitHub Pages)', 'Mock Employee 1', 'Mock Employee 2']
                                        };
                                        break;
                                    default:
                                        mockData = `MOCK: Function ${String(prop)} called.`;
                                }
                                setTimeout(() => cb(mockData), 500); // Simulate network delay
                                return { withFailureHandler: (cb) => {} };
                            },
                            withFailureHandler: (cb) => {}
                        };
                    };
                }
            })
        }
    };
} else {
    // This block runs ONLY when deployed as a Google Apps Script Web App
    // The template values are directly inserted here by the Apps Script engine.
    initialEmployeeId = '<?= employeeId ?>';
    initialCheckinCode = '<?= checkinCode ?>';
    OFFICE_LATITUDE = <?!= OFFICE_LATITUDE ?>;
    OFFICE_LONGITUDE = <?!= OFFICE_LONGITUDE ?>;
    ACCEPTABLE_RADIUS_METERS = <?!= ACCEPTABLE_RADIUS_METERS ?>;
    LOW_ACCURACY_THRESHOLD_FACTOR = <?!= LOW_ACCURACY_THRESHOLD_FACTOR ?>;
}

// --- UTILITY FUNCTIONS ---
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // metres
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // in metres
}

function showMessage(msg, type = 'info') {
    //console.log(`showMessage: ${msg} (${type})`);
    messageDiv.textContent = msg;
    messageDiv.className = 'message';
    if (type === 'error') {
        messageDiv.classList.add('error');
    } else if (type === 'success') {
        messageDiv.classList.add('success');
    } else if (type === 'loading') {
        messageDiv.classList.add('loading');
    }
    messageDiv.style.display = msg ? 'block' : 'none';
}

function hideMessage() {
    messageDiv.style.display = 'none';
}

// --- MAP FUNCTIONS ---
// Initialize the Leaflet map instance
function initLeafletMap() {
    if (!map) {
        map = L.map('map', { zoomControl: true }).setView([OFFICE_LATITUDE, OFFICE_LONGITUDE], 13);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© <a href="https://hcdc-ap.github.io/phamanh/">OSM_AP</a>'
        }).addTo(map);
    } else {
        // Clear existing markers/circles if map already initialized
        map.eachLayer(function(layer) {
            if (layer instanceof L.Marker || layer instanceof L.Circle) {
                map.removeLayer(layer);
            }
        });
    }

    // Add office marker
    officeMarker = L.marker([OFFICE_LATITUDE, OFFICE_LONGITUDE], { icon: customIcons['Office'] })
        .addTo(map)
        .bindPopup('HCDC Office');
}

// Custom marker icons for Leaflet
const iconSize = [32, 32];
const iconAnchor = [16, 32];
const popupAnchor = [0, -32]; // Adjust popup to appear above the marker
const customIcons = {
    'Office': L.icon({
        iconUrl: 'https://i.ibb.co/Tw2CN2k/img-8-8-png-crop1.png', // Your office logo
        iconSize: iconSize,
        iconAnchor: iconAnchor,
        popupAnchor: popupAnchor
    }),
    'Valid': L.icon({
        iconUrl: 'https://i.ibb.co/ZRkHpwkQ/Quby-icecream.gif', // Green/Valid marker
        iconSize: iconSize,
        iconAnchor: iconAnchor,
        popupAnchor: popupAnchor
    }),
    'Remote (Outside Area)': L.icon({
        iconUrl: 'https://i.ibb.co/zhvbBhtz/Quby-hugme.gif', // Red/Out of Area marker
        iconSize: iconSize,
        iconAnchor: iconAnchor,
        popupAnchor: popupAnchor
    }),
    'Remote (Low Accuracy)': L.icon({
        iconUrl: 'https://i.ibb.co/vvmsXRTP/Quby-wonder.gif', // Orange/Low Accuracy marker
        iconSize: iconSize,
        iconAnchor: iconAnchor,
        popupAnchor: popupAnchor
    })
};

// Load and display attendance data on the map
function loadMap() {
    //console.log('loadMap called with initialEmployeeId:', initialEmployeeId);
    staticMapPlaceholder.style.display = "flex";
    staticMapPlaceholder.className = "static-map-placeholder loading";
    staticMapPlaceholder.innerHTML = `
        <img src="https://i.ibb.co/8wLBpP9/Quby-beddance-1.gif" alt="Loading..." class="loading-gif">
        <p>Loading map...</p>
    `;
    mapElement.style.display = "none"; // Hide actual map during loading

    google.script.run
        .withSuccessHandler(function(data) {
            //console.log('Map data received:', data);
            if (data.error) {
                //console.log('Map data error:', data.error);
                staticMapPlaceholder.style.display = "flex";
                staticMapPlaceholder.className = "static-map-placeholder error";
                staticMapPlaceholder.innerHTML = `
                    <img src="https://i.ibb.co/hxGRL5Nv/Quby-sheet.gif" alt="Error..." class="loading-gif">
                    <p>${data.error}</p>
                `;
                showMessage(data.error, "error");
                return;
            }
            // Initialize or clear map before adding new points
            initLeafletMap();
            mapElement.style.display = "block"; // Show actual map
            staticMapPlaceholder.style.display = "none"; // Hide placeholder

            let bounds = L.latLngBounds([]);

            // Add office point to bounds
            bounds.extend([OFFICE_LATITUDE, OFFICE_LONGITUDE]);

            data.points.forEach(point => {
                const marker = L.marker([point.lat, point.lng], {
                    icon: customIcons[point.status] || customIcons['Valid'] // Fallback to Valid icon
                }).addTo(map)
                  .bindPopup(point.label);
                bounds.extend([point.lat, point.lng]);
            });

            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [50, 50] });
            } else {
                map.setView([OFFICE_LATITUDE, OFFICE_LONGITUDE], 15);
            }
        })
        .withFailureHandler(function(error) {
            console.error("Error fetching map data:", error);
            staticMapPlaceholder.style.display = "flex";
            staticMapPlaceholder.className = "static-map-placeholder error";
            staticMapPlaceholder.innerHTML = `
                <img src="https://i.ibb.co/hxGRL5Nv/Quby-sheet.gif" alt="Error..." class="loading-gif">
                <p>Failed to fetch map data: ${error.message}</p>
            `;
            showMessage(`Failed to fetch map data: ${error.message}`, "error");
        })
        .getAttendanceDataForMap(initialEmployeeId);
}

// --- GEOLOCATION AND INITIAL DATA LOAD ---
function initializePage() {
    //console.log('Initial employeeId:', initialEmployeeId);
    if (!initialEmployeeId || !initialCheckinCode) {
        showMessage('Employee ID or attendance code is missing. Please use the link from email.', 'error');
        employeeIdDisplay.textContent = 'N/A';
        checkinCodeDisplay.textContent = 'N/A';
        employeeNameDisplay.textContent = 'N/A';
        ipAddressDisplay.textContent = 'N/A';
        currentAddressDisplay.textContent = 'N/A';
        checkinButton.disabled = true;
        return;
    }
    showMessage('Loading information...', 'loading');
    checkinButton.disabled = true;
    employeeIdDisplay.textContent = initialEmployeeId;
    checkinCodeDisplay.textContent = initialCheckinCode;

    google.script.run
        .withSuccessHandler(function(name) {
            employeeName = name || 'Name not found';
            employeeNameDisplay.textContent = employeeName;
            getIpAddress();
        })
        .withFailureHandler(function(error) {
            console.error('Error loading employee name:', error);
            showMessage('Error loading employee name: ' + error.message, 'error');
            employeeNameDisplay.textContent = 'Error!';
            getIpAddress();
        })
        .getEmployeeNameById(initialEmployeeId);
}

function getIpAddress() {
    google.script.run
        .withSuccessHandler(function(ip) {
            userIpAddress = ip || 'N/A';
            ipAddressDisplay.textContent = userIpAddress;
            getGeolocation();
        })
        .withFailureHandler(function(error) {
            console.error('Error loading IP address:', error);
            showMessage('Error loading IP address: ' + error.message, 'error');
            ipAddressDisplay.textContent = 'N/A';
            getGeolocation();
        })
        .getUserIpAddress();
}

function getGeolocation() {
    if (navigator.geolocation) {
        showMessage('Getting your current location...', 'loading');
        checkinButton.disabled = true;
        navigator.geolocation.getCurrentPosition(
            function(position) {
                currentLatitude = position.coords.latitude;
                currentLongitude = position.coords.longitude;
                currentAccuracy = position.coords.accuracy;

                currentAddressDisplay.textContent = `Accuracy: ${currentAccuracy.toFixed(2)}m`;
                const currentDistance = calculateDistance(currentLatitude, currentLongitude, OFFICE_LATITUDE, OFFICE_LONGITUDE);

                let statusMessage = 'Location obtained. Ready to CHECK-IN.';
                let messageType = 'info';

                if (currentAccuracy > ACCEPTABLE_RADIUS_METERS * LOW_ACCURACY_THRESHOLD_FACTOR) {
                    statusMessage = `Warning: Low location accuracy (${currentAccuracy.toFixed(2)}m). Check-in may be marked "Remote (Low Accuracy)".`;
                    messageType = 'error';
                } else if (currentDistance > ACCEPTABLE_RADIUS_METERS) {
                    statusMessage = `Warning: You are approx. ${currentDistance.toFixed(2)}m from office. Check-in may be marked "Remote (Outside Area)".`;
                    messageType = 'error';
                }

                showMessage(statusMessage, messageType);
                checkinButton.disabled = false;

                // Get address from Maps service (server-side via Apps Script)
                google.script.run
                    .withSuccessHandler(function(address) {
                        currentAddressDisplay.textContent = address;
                        currentAddressDisplay.title = `Lat: ${currentLatitude.toFixed(6)}, Lng: ${currentLongitude.toFixed(6)} (Acc: ${currentAccuracy.toFixed(2)}m)`;
                    })
                    .withFailureHandler(function(error) {
                        console.error("Failed to get address:", error);
                        currentAddressDisplay.textContent = `Lat: ${currentLatitude.toFixed(6)}, Lng: ${currentLongitude.toFixed(6)} (Acc: ${currentAccuracy.toFixed(2)}m) - Address lookup failed`;
                    })
                    .getGeoAddressByMapsService(currentLatitude, currentLongitude);
            },
            function(error) {
                currentLatitude = null;
                currentLongitude = null;
                currentAccuracy = null;
                currentAddressDisplay.textContent = `GPS error: ${error.message || 'Unknown error'}.`;
                showMessage(`Failed to get GPS location: ${error.message || 'Unknown error'}. You can still Check-In but will be marked "Remote (No Location)".`, 'error');
                checkinButton.disabled = false;
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    } else {
        currentLatitude = null;
        currentLongitude = null;
        currentAccuracy = null;
        currentAddressDisplay.textContent = 'The browser does not support location.';
        showMessage('Your browser does not support geolocation. You can still Check-In but will be marked "Remote (No Location)".', 'error');
        checkinButton.disabled = false;
    }
}

// --- CHECK-IN LOGIC ---
checkinButton.addEventListener('click', function() {
    showMessage('Processing CHECK-IN...', 'loading');
    this.disabled = true;

    const currentIpAddressVal = ipAddressDisplay.textContent; // Use the value from the display

    google.script.run
        .withSuccessHandler(function(result) {
            //console.log('Check-in success:', result);
            showMessage(result, 'success');
            checkinButton.textContent = 'CHECK-IN!';
            checkinButton.disabled = true; // Keep disabled after successful check-in
            
            // Refresh map and heatmap after successful check-in
            loadMap(); 
            
            // Set calendar and employee select to current month and 'All'
            const now = new Date();
            const yearMonth = now.toISOString().substring(0, 7);
            calendarMonthSelect.value = yearMonth;
            employeeSelect.value = '';

            // Clear heatmap cache to force refresh
            lastHeatmapResult = null;
            currentHeatmapMonth = '';
            currentHeatmapEmployee = '';

            // Delay heatmap refresh slightly to allow server-side data to update
            setTimeout(() => {
                loadCheckinCalendar(false, true); // Force refresh heatmap
            }, 2000); // 2-second delay
        })
        .withFailureHandler(function(error) {
            console.error('Check-in error:', error);
            showMessage('CHECK-IN error: ' + error.message, 'error');
            checkinButton.disabled = false;
        })
        .saveAttendance(initialEmployeeId, currentLatitude, currentLongitude, currentIpAddressVal, initialCheckinCode, currentAccuracy);
});

// --- HEATMAP LOGIC ---
function showHeatmapLoader(show) {
    heatmapLoading.style.display = show ? '' : 'none';
    containerDiv.style.opacity = show ? 0.3 : 1;
}

function getSelectedFilters() {
    return {
        month: calendarMonthSelect.value || new Date().toISOString().substring(0, 7),
        employee: employeeSelect.value
    };
}

function buildHeatmapData(daily, year, month) {
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDay = new Date(year, month - 1, 1);
    const firstWeekday = firstDay.getDay();

    const data = [];

    // Add empty placeholders for days before the 1st of the month
    for (let emptyDay = 0; emptyDay < firstWeekday; emptyDay++) {
        data.push({
            x: emptyDay,
            y: 5,
            value: null,
            date: null,
            custom: { empty: true }
        });
    }

    // Populate data for each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        const dayData = daily[dateStr] || { valid: [], remote: [] };

        let value = null;
        if (dayData.valid.length > 0) {
            value = dayData.valid.length;
        } else if (dayData.remote.length > 0) {
            value = -dayData.remote.length;
        }

        data.push({
            x: (firstWeekday + day - 1) % 7,
            y: 5 - Math.floor((firstWeekday + day - 1) / 7),
            value: value,
            date: new Date(dateStr).getTime(),
            custom: { monthDay: day, valid: dayData.valid, remote: dayData.remote }
        });
    }
    return data;
}

function loadCheckinCalendar(isInitial = false, forceRefresh = false) {
    const { month: val, employee } = getSelectedFilters();

    // Cache check: only load if filters changed or forceRefresh is true
    if (!isInitial && !forceRefresh && currentHeatmapMonth === val && currentHeatmapEmployee === employee && lastHeatmapResult) {
        //console.log('Returning cached heatmap data');
        renderHeatmap(lastHeatmapResult, employee, val); // Render with cached data
        return;
    }

    currentHeatmapMonth = val;
    currentHeatmapEmployee = employee;
    lastHeatmapResult = null; // Clear cache explicitly as new data will be fetched

    const [year, month] = val.split('-').map(Number);
    showHeatmapLoader(true);

    google.script.run
        .withSuccessHandler(function(result) {
            //console.log('Heatmap data received:', result);
            lastHeatmapResult = result; // Cache the result
            showHeatmapLoader(false);
            renderHeatmap(result, employee, val);
        })
        .withFailureHandler(function(error) {
            showHeatmapLoader(false);
            console.error('Heatmap error:', error);
            alert(`Failed to load heatmap: ${error.message}`);
        })
        .getAttendanceCalendarMonthWithRemote(year, month);
}

function renderHeatmap(result, employeeFilter, monthVal) {
    const [year, month] = monthVal.split('-').map(Number);

    const filteredDaily = {};
    if (employeeFilter && employeeFilter !== "") {
        for (const dateStr in result.daily) {
            const dayData = result.daily[dateStr];
            const validFiltered = dayData.valid.filter(name => name === employeeFilter);
            const remoteFiltered = dayData.remote.filter(name => name === employeeFilter);
            if (validFiltered.length > 0 || remoteFiltered.length > 0) {
                filteredDaily[dateStr] = { valid: validFiltered, remote: remoteFiltered };
            }
        }
    } else {
        Object.assign(filteredDaily, result.daily); // If no employee filter, use all daily data
    }

    const heatmapData = buildHeatmapData(filteredDaily, year, month);

    let employees = result.employees || [];
    if (JSON.stringify(employees) !== JSON.stringify(allEmployees)) {
        allEmployees = employees;
        buildEmployeeDropdown(allEmployees, employeeFilter);
    }

    const weekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

    Highcharts.chart('container', {
        chart: { type: 'heatmap' },
        title: { text: `Monthly attendance ${month}/${year}` },
        xAxis: {
            categories: weekdays,
            opposite: true,
            lineWidth: 26,
            offset: 13,
            lineColor: '#f8eef2',
            labels: { rotation: 0, y: 20, style: { textTransform: 'uppercase', fontWeight: 'bold' } }
        },
        yAxis: {
            min: 0,
            max: 5,
            visible: false
        },
        colorAxis: {
            dataClasses: [
                { from: 1, color: '#3d72b4', to: 999, name: 'Valid' },
                { from: -999, to: -1, color: '#e69138', name: 'Remote/Error' }
            ]
        },
        legend: {
            align: 'center',
            verticalAlign: 'bottom',
            layout: 'horizontal',
            itemStyle: { fontWeight: 'bold', fontSize: '10px' },
            itemMarginTop: 1,
            itemMarginBottom: 1
        },
        tooltip: {
            useHTML: true,
            formatter: function() {
                if (this.point.custom && this.point.custom.empty) return 'No data';

                let text = `<b>${new Date(this.point.date).toLocaleDateString('vi-VN')}</b>`;
                const validCount = (this.point.custom.valid && this.point.custom.valid.length) ? this.point.custom.valid.length : 0;
                const remoteCount = (this.point.custom.remote && this.point.custom.remote.length) ? this.point.custom.remote.length : 0;

                if (validCount > 0) {
                    text += `<br><span style="color:#3d72b4;">Valid: <b>${validCount}</b></span><ul style="margin:4px 0 4px 18px;padding:0;list-style-type:none;">`;
                    if (employeeFilter === "" || validCount <= 5) {
                        text += this.point.custom.valid.map(n => `<li style="color:#3d72b4;font-weight:bold;margin-bottom:2px;"><i class="fa fa-user-check" style="color:#3d72b4;margin-right:4px;"></i>${n}</li>`).join('');
                    } else if (validCount > 5) {
                        text += `<li>...and ${validCount} others</li>`;
                    }
                    text += '</ul>';
                }

                if (remoteCount > 0) {
                    text += `<br><span style="color:#e69138;">Out of Area/Location Error: <b>${remoteCount}</b></span><ul style="margin:4px 0 4px 18px;padding:0;list-style-type:none;">`;
                    if (employeeFilter === "" || remoteCount <= 5) {
                        text += this.point.custom.remote.map(n => `<li style="color:#e69138;font-weight:bold;margin-bottom:2px;"><i class="fa fa-exclamation-triangle" style="color:#e69138;margin-right:4px;"></i>${n}</li>`).join('');
                    } else if (remoteCount > 5) {
                        text += `<li>...and ${remoteCount} others</li>`;
                    }
                    text += '</ul>';
                }

                if (validCount === 0 && remoteCount === 0) text += "<br>No roll call.";
                return text;
            }
        },
        series: [{
            name: 'Roll call',
            keys: ['x', 'y', 'value', 'date'],
            data: heatmapData,
            nullColor: '#f9f2fa',
            borderWidth: 2,
            borderColor: '#f3e6f6',
            dataLabels: [
                {
                    enabled: true,
                    formatter: function() {
                        if (this.point.custom && this.point.custom.empty) return null;
                        const totalCheckins = Math.abs(this.point.value);
                        return totalCheckins > 0 ? totalCheckins : null;
                    },
                    style: { textOutline: 'none', fontWeight: 'normal', fontSize: '1rem' },
                    y: 4
                },
                {
                    enabled: true,
                    align: 'left',
                    verticalAlign: 'top',
                    format: '{#unless point.custom.empty}{point.custom.monthDay}{/unless}',
                    backgroundColor: 'whitesmoke',
                    padding: 2,
                    style: { textOutline: 'none', color: '#011f4b', fontSize: '0.9rem', fontWeight: 'bold', opacity: 0.9 },
                    x: 1,
                    y: 1
                }
            ]
        }],
        credits: { enabled: false }
    });
    //console.log('Heatmap rendered for month:', monthVal);
}

function buildEmployeeDropdown(employeeList, selected) {
    const select = employeeSelect; // Use the directly referenced element
    select.innerHTML = '<option value="">All</option>';
    employeeList.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.text = name;
        select.appendChild(option);
    });
    if (selected && employeeList.includes(selected)) {
        select.value = selected;
    } else {
        select.value = '';
    }
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', function() {
    // Set initial month for heatmap filter
    const now = new Date();
    calendarMonthSelect.value = now.toISOString().substring(0, 7);

    // Add event listeners for heatmap filters
    calendarMonthSelect.addEventListener('change', function() {
        loadCheckinCalendar();
    });
    employeeSelect.addEventListener('change', function() {
        loadCheckinCalendar();
    });

    // Load initial data for check-in section and map
    initializePage();
    loadMap(); // Initial load of map data

    // Initial load of calendar heatmap
    loadCheckinCalendar(true); 
});
