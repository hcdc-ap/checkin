// Global variables from GAS template (for local testing, you might hardcode these or mock them)
// In your actual GAS deployed web app, these lines will be populated by the template engine.
// For GitHub Pages, these will just be constants with placeholder values or could be removed if not needed for static display.
// For a fully functional local development, you'd need a server-side component to mimic GAS.
const initialEmployeeId = '<?= employeeId ?>'; // Example: 'EMP001'
const initialCheckinCode = '<?= checkinCode ?>'; // Example: 'ABCD123'
window.OFFICE_LATITUDE = <?!= OFFICE_LATITUDE ?>; // Example: 10.740942012003238
window.OFFICE_LONGITUDE = <?!= OFFICE_LONGITUDE ?>; // Example: 106.68562129532752
window.ACCEPTABLE_RADIUS_METERS = <?!= ACCEPTABLE_RADIUS_METERS ?>; // Example: 1701
window.LOW_ACCURACY_THRESHOLD_FACTOR = <?!= LOW_ACCURACY_THRESHOLD_FACTOR ?>; // Example: 1.7


let currentLatitude = null;
let currentLongitude = null;
let currentAccuracy = null;
let userIpAddress = 'Loading...';
let employeeName = 'Loading...';

const messageDiv = document.getElementById('message');
const checkinButton = document.getElementById('checkinButton');
const employeeIdDisplay = document.getElementById('employeeIdDisplay');
const checkinCodeDisplay = document.getElementById('checkinCodeDisplay');
const employeeNameDisplay = document.getElementById('employeeName');
const ipAddressDisplay = document.getElementById('ipAddress');
const currentAddressDisplay = document.getElementById('currentAddress');
const mapElement = document.getElementById('map');
const staticMapPlaceholder = document.getElementById('staticMapPlaceholder');

let map = null;
let officeMarker = null;
let employeeMarker = null;
let accuracyCircle = null;
let distanceCircle = null;


// Function to calculate distance between two lat/lon points (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // metres
    const φ1 = (lat1 * Math.PI) / 180; // φ, λ in radians
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in metres
}

function showMessage(msg, type) {
    messageDiv.textContent = msg;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
}

function hideMessage() {
    messageDiv.style.display = 'none';
}

// Initialize Map
function initializeMap(mapData) {
    staticMapPlaceholder.style.display = 'none';
    mapElement.style.display = 'block';

    if (!map) {
        map = L.map('map').setView([window.OFFICE_LATITUDE, window.OFFICE_LONGITUDE], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
    } else {
        map.eachLayer(function(layer) {
            if (layer !== officeMarker && layer !== employeeMarker && layer !== accuracyCircle && layer !== distanceCircle) {
                map.removeLayer(layer);
            }
        });
    }

    const icons = {
        'Office': L.divIcon({ className: 'custom-div-icon office-icon', html: '<i class="fa fa-building" style="color:blue;"></i>', iconSize: [30, 30], iconAnchor: [15, 30] }),
        'Valid': L.divIcon({ className: 'custom-div-icon valid-icon', html: '<i class="fa fa-map-marker-alt" style="color:green;"></i>', iconSize: [30, 30], iconAnchor: [15, 30] }),
        'Remote (Outside Area)': L.divIcon({ className: 'custom-div-icon remote-icon', html: '<i class="fa fa-map-marker-alt" style="color:red;"></i>', iconSize: [30, 30], iconAnchor: [15, 30] }),
        'Remote (Low Accuracy)': L.divIcon({ className: 'custom-div-icon low-accuracy-icon', html: '<i class="fa fa-map-marker-alt" style="color:orange;"></i>', iconSize: [30, 30], iconAnchor: [15, 30] }),
        'Remote (No Location)': L.divIcon({ className: 'custom-div-icon no-location-icon', html: '<i class="fa fa-map-marker-alt" style="color:gray;"></i>', iconSize: [30, 30], iconAnchor: [15, 30] }),
        'Unknown': L.divIcon({ className: 'custom-div-icon unknown-icon', html: '<i class="fa fa-map-marker-alt" style="color:grey;"></i>', iconSize: [30, 30], iconAnchor: [15, 30] })
    };

    let bounds = L.latLngBounds([]);

    mapData.points.forEach(point => {
        const marker = L.marker([point.lat, point.lng], {
            icon: icons[point.status] || icons['Unknown']
        }).addTo(map)
          .bindPopup(point.label);
        bounds.extend([point.lat, point.lng]);
    });

    if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
    } else {
        map.setView([window.OFFICE_LATITUDE, window.OFFICE_LONGITUDE], 15);
    }
}


function getInitialDataAndLocation() {
    employeeIdDisplay.textContent = initialEmployeeId;
    checkinCodeDisplay.textContent = initialCheckinCode;

    // Call server-side functions
    google.script.run
        .withSuccessHandler(function(name) {
            employeeName = name || 'N/A';
            employeeNameDisplay.textContent = employeeName;
        })
        .withFailureHandler(function(error) {
            console.error("Failed to get employee name:", error);
            employeeNameDisplay.textContent = 'Error';
        })
        .getEmployeeNameById(initialEmployeeId);

    google.script.run
        .withSuccessHandler(function(ip) {
            userIpAddress = ip;
            ipAddressDisplay.textContent = userIpAddress;
        })
        .withFailureHandler(function(error) {
            console.error("Failed to get IP address:", error);
            ipAddressDisplay.textContent = 'Error';
        })
        .getUserIpAddress();

    // Get geolocation
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                currentLatitude = position.coords.latitude;
                currentLongitude = position.coords.longitude;
                currentAccuracy = position.coords.accuracy;

                // Update UI with location
                currentAddressDisplay.textContent = `Lat: ${currentLatitude.toFixed(6)}, Lng: ${currentLongitude.toFixed(6)} (Acc: ${currentAccuracy.toFixed(2)}m)`;
                checkinButton.disabled = false; // Enable check-in button

                // Optionally, get address from Maps service (client-side if API key available, otherwise server-side)
                // For simplicity, this example still relies on server-side getGeoAddressByMapsService
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
                console.error("Geolocation error:", error);
                currentAddressDisplay.textContent = 'Geolocation denied or unavailable.';
                checkinButton.disabled = false; // Still allow check-in, but with no location data
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    } else {
        currentAddressDisplay.textContent = 'Geolocation is not supported by your browser.';
        checkinButton.disabled = false; // Allow check-in without location
    }

    // Load initial map data
    google.script.run
        .withSuccessHandler(function(data) {
            if (data.error) {
                console.error("Error loading map data:", data.error);
                staticMapPlaceholder.innerHTML = `<p style="color:red;">Error loading map: ${data.error}</p>`;
                return;
            }
            initializeMap(data);
        })
        .withFailureHandler(function(error) {
            console.error("Error fetching map data:", error);
            staticMapPlaceholder.innerHTML = `<p style="color:red;">Failed to fetch map data: ${error.message}</p>`;
        })
        .getAttendanceDataForMap(initialEmployeeId);
}

// Handle Check-in button click
checkinButton.addEventListener('click', function() {
    checkinButton.disabled = true;
    showMessage('Checking in...', 'info');

    google.script.run
        .withSuccessHandler(function(response) {
            showMessage(response, 'success');
            // Refresh map data after successful check-in
            google.script.run
                .withSuccessHandler(function(data) {
                    if (data.error) {
                        console.error("Error refreshing map data:", data.error);
                        return;
                    }
                    initializeMap(data);
                })
                .withFailureHandler(function(error) {
                    console.error("Error refreshing map data after check-in:", error);
                })
                .getAttendanceDataForMap(initialEmployeeId);
            loadCheckinCalendar(false, true); // Force refresh heatmap
            checkinButton.disabled = false;
        })
        .withFailureHandler(function(error) {
            showMessage(`Error: ${error.message}`, 'error');
            console.error("Check-in error:", error);
            checkinButton.disabled = false;
        })
        .saveAttendance(initialEmployeeId, currentLatitude, currentLongitude, userIpAddress, initialCheckinCode, currentAccuracy);
});

// Run when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', getInitialDataAndLocation);


// Heatmap JS logic (moved from inline script in index.html)
let allEmployees = [];
let currentEmployee = '';
let currentMonth = '';
let lastResult = null; // Cache the last fetched result to avoid redundant calls

function showLoader(show) {
  document.getElementById('heatmap-loading').style.display = show ? '' : 'none';
  document.getElementById('container').style.opacity = show ? 0.3 : 1;
}

function getSelectedFilters() {
  return {
    month: document.getElementById('calendarMonth').value || new Date().toISOString().substring(0, 7),
    employee: document.getElementById('employeeSelect').value
  };
}

document.addEventListener('DOMContentLoaded', function() {
  const now = new Date();
  document.getElementById('calendarMonth').value = now.toISOString().substring(0, 7);
  document.getElementById('calendarMonth').addEventListener('change', function() {
    loadCheckinCalendar();
  });
  document.getElementById('employeeSelect').addEventListener('change', function() {
    loadCheckinCalendar();
  });
  loadCheckinCalendar(true); // Initial load of calendar
});

function buildHeatmapData(daily, year, month) {
  const daysInMonth = new Date(year, month, 0).getDate(); // Get days in month (0 makes it last day of previous month)
  const firstDay = new Date(year, month - 1, 1); // Month is 0-indexed for Date object
  const firstWeekday = firstDay.getDay(); // 0 for Sunday, 1 for Monday, etc.

  const data = [];

  // Add empty placeholders for days before the 1st of the month
  for (let emptyDay = 0; emptyDay < firstWeekday; emptyDay++) {
    data.push({
      x: emptyDay,
      y: 5, // Y-coordinate for the last row (top-most in Highcharts heatmap)
      value: null,
      date: null,
      custom: { empty: true } // Custom property to mark as empty
    });
  }

  // Populate data for each day of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    const dayData = daily[dateStr] || { valid: [], remote: [] };

    let value = null; // Default to null (no check-in)
    if (dayData.valid.length > 0) {
      value = dayData.valid.length; // Positive value for valid check-ins
    } else if (dayData.remote.length > 0) {
      value = -dayData.remote.length; // Negative value for remote/error check-ins
    }

    data.push({
      x: (firstWeekday + day - 1) % 7, // Day of the week (0-6)
      y: 5 - Math.floor((firstWeekday + day - 1) / 7), // Row for the week (0-5, top to bottom)
      value: value,
      date: new Date(dateStr).getTime(), // Timestamp for tooltip
      custom: { monthDay: day, valid: dayData.valid, remote: dayData.remote }
    });
  }
  return data;
}

function loadCheckinCalendar(isInitial = false, forceRefresh = false) {
    const { month: val, employee } = getSelectedFilters();

    // Cache check: only load if filters changed or forceRefresh is true
    if (!isInitial && !forceRefresh && currentMonth === val && currentEmployee === employee && lastResult) {
        //console.log('Returning cached heatmap data');
        renderHeatmap(lastResult, employee, val); // Render with cached data
        return;
    }

    currentMonth = val;
    currentEmployee = employee;
    lastResult = null; // Clear cache explicitly as new data will be fetched

    const [year, month] = val.split('-').map(Number);
    showLoader(true);

    google.script.run
        .withSuccessHandler(function(result) {
            //console.log('Heatmap data received:', result);
            lastResult = result; // Cache the result
            showLoader(false);
            renderHeatmap(result, employee, val);
        })
        .withFailureHandler(function(error) {
            showLoader(false);
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
            opposite: true, // Place categories at the top
            lineWidth: 26, // Background line for headers
            offset: 13,
            lineColor: '#f8eef2',
            labels: { rotation: 0, y: 20, style: { textTransform: 'uppercase', fontWeight: 'bold' } }
        },
        yAxis: {
            min: 0,
            max: 5, // 6 rows for weeks (0-5)
            visible: false // Hide y-axis labels
        },
        colorAxis: {
            dataClasses: [
                { from: 1, color: '#3d72b4', to: 999, name: 'Valid' }, // Blue for valid check-ins
                { from: -999, to: -1, color: '#e69138', name: 'Remote/Error' } // Orange for remote/error check-ins
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
                    // Only show names if "All" employees selected or if count is small
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
            nullColor: '#f9f2fa', // Color for days with no data/no check-ins
            borderWidth: 2,
            borderColor: '#f3e6f6',
            dataLabels: [
                {
                    enabled: true,
                    // Formatter for showing count in the middle of the cell
                    formatter: function() {
                        if (this.point.custom && this.point.custom.empty) return null; // Hide for empty cells
                        const totalCheckins = Math.abs(this.point.value); // Show absolute count for both valid and remote
                        return totalCheckins > 0 ? totalCheckins : null;
                    },
                    style: { textOutline: 'none', fontWeight: 'normal', fontSize: '1rem' },
                    y: 4
                },
                {
                    enabled: true,
                    align: 'left',
                    verticalAlign: 'top',
                    format: '{#unless point.custom.empty}{point.custom.monthDay}{/unless}', // Show day number
                    backgroundColor: 'whitesmoke',
                    padding: 2,
                    style: { textOutline: 'none', color: '#011f4b', fontSize: '0.9rem', fontWeight: 'bold', opacity: 0.9 },
                    x: 1,
                    y: 1
                }
            ]
        }],
        credits: { enabled: false } // Disable Highcharts credits
    });
    //console.log('Heatmap rendered for month:', monthVal);
}

function buildEmployeeDropdown(employeeList, selected) {
    const select = document.getElementById('employeeSelect');
    select.innerHTML = '<option value="">All</option>'; // Always include "All" option
    employeeList.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.text = name;
        select.appendChild(option);
    });
    // Set the selected value after building the options
    if (selected && employeeList.includes(selected)) {
        select.value = selected;
    } else {
        select.value = ''; // Ensure "All" is selected if no specific employee
    }
}
/*
* Client-side JavaScript for check-in, map display, and Highcharts heatmap
* Updated to refresh both map and Highcharts heatmap after check-in
*/

// Global variables
let latitude, longitude, accuracy;

// Constants from index.html (these are populated by GAS templating)
// For a static GitHub Pages site, you'd hardcode or mock these for display purposes.
let OFFICE_LATITUDE = window.OFFICE_LATITUDE;
let OFFICE_LONGITUDE = window.OFFICE_LONGITUDE;
let ACCEPTABLE_RADIUS_METERS = window.ACCEPTABLE_RADIUS_METERS;
let LOW_ACCURACY_THRESHOLD_FACTOR = window.LOW_ACCURACY_THRESHOLD_FACTOR;

// Function to display status messages
function showMessage(text, type = 'info') {
  //console.log(`showMessage: ${text} (${type})`);
  const messageDiv = document.getElementById('message');
  messageDiv.textContent = text;
  messageDiv.className = 'message'; // Reset classes
  if (type === 'error') {
    messageDiv.classList.add('error');
  } else if (type === 'success') {
    messageDiv.classList.add('success');
  } else if (type === 'loading') {
    messageDiv.classList.add('loading');
  }
  messageDiv.style.display = text ? 'block' : 'none';
}

// Initialize the page with employee ID and code
function initializePage() {
  //console.log('Initial employeeId:', initialEmployeeId);
  // initialEmployeeId and initialCheckinCode are populated by GAS template
  if (!initialEmployeeId || !initialCheckinCode) {
    showMessage('Employee ID or attendance code is missing. Please use the link from email.', 'error');
    document.getElementById('employeeIdDisplay').textContent = 'N/A';
    document.getElementById('checkinCodeDisplay').textContent = 'N/A';
    document.getElementById('employeeName').textContent = 'N/A';
    document.getElementById('ipAddress').textContent = 'N/A';
    document.getElementById('currentAddress').textContent = 'N/A';
    document.getElementById('checkinButton').disabled = true;
    return;
  }
  showMessage('Loading information...', 'loading');
  document.getElementById('checkinButton').disabled = true;
  document.getElementById('employeeIdDisplay').textContent = initialEmployeeId;
  document.getElementById('checkinCodeDisplay').textContent = initialCheckinCode;

  // Call GAS server-side function to get employee name
  google.script.run
    .withSuccessHandler(function(name) {
      document.getElementById('employeeName').textContent = name || 'Name not found';
      getIpAddress(); // Proceed to get IP after name is loaded
    })
    .withFailureHandler(function(error) {
      //console.log('Error loading employee name:', error);
      showMessage('Error loading employee name: ' + error.message, 'error');
      document.getElementById('employeeName').textContent = 'Error!';
      getIpAddress(); // Still try to get IP even if name fails
    })
    .getEmployeeNameById(initialEmployeeId);
}

// Get IP address
function getIpAddress() {
  google.script.run
    .withSuccessHandler(function(ip) {
      document.getElementById('ipAddress').textContent = ip || 'N/A';
      getGeolocation(); // Proceed to get geolocation after IP is loaded
    })
    .withFailureHandler(function(error) {
      //console.log('Error loading IP address:', error);
      showMessage('Error loading IP address: ' + error.message, 'error');
      document.getElementById('ipAddress').textContent = 'N/A';
      getGeolocation(); // Still try to get geolocation even if IP fails
    })
    .getUserIpAddress();
}

// Calculate distance between two points (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // in metres
}

// Get GPS location
function getGeolocation() {
  if (navigator.geolocation) {
    showMessage('Getting your current location...', 'loading');
    document.getElementById('checkinButton').disabled = true;
    navigator.geolocation.getCurrentPosition(
      function(position) {
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
        accuracy = position.coords.accuracy;

        document.getElementById('currentAddress').textContent = `Accuracy: ${accuracy.toFixed(2)}m`;
        const currentDistance = calculateDistance(latitude, longitude, OFFICE_LATITUDE, OFFICE_LONGITUDE);

        let statusMessage = 'Location obtained. Ready to CHECK-IN.';
        let messageType = 'info';

        if (accuracy > ACCEPTABLE_RADIUS_METERS * LOW_ACCURACY_THRESHOLD_FACTOR) {
          statusMessage = `Warning: Low location accuracy (${accuracy.toFixed(2)}m). Check-in may be marked "Remote (Low Accuracy)".`;
          messageType = 'error';
        } else if (currentDistance > ACCEPTABLE_RADIUS_METERS) {
          statusMessage = `Warning: You are approx. ${currentDistance.toFixed(2)}m from office. Check-in may be marked "Remote (Outside Area)".`;
          messageType = 'error';
        }

        showMessage(statusMessage, messageType);
        document.getElementById('checkinButton').disabled = false;
      },
      function(error) {
        // Geolocation error handler
        latitude = null;
        longitude = null;
        accuracy = null;
        document.getElementById('currentAddress').textContent = `GPS error: ${error.message || 'Unknown error'}.`;
        showMessage(`Failed to get GPS location: ${error.message || 'Unknown error'}. You can still Check-In but will be marked "Remote (No Location)".`, 'error');
        document.getElementById('checkinButton').disabled = false; // Enable button even if no location
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  } else {
    // Browser does not support geolocation
    latitude = null;
    longitude = null;
    accuracy = null;
    document.getElementById('currentAddress').textContent = 'The browser does not support location.';
    showMessage('Your browser does not support geolocation. You can still Check-In but will be marked "Remote (No Location)".', 'error');
    document.getElementById('checkinButton').disabled = false; // Enable button
  }
}

// Handle Check-In button click
document.getElementById('checkinButton').addEventListener('click', function() {
  showMessage('Processing CHECK-IN...', 'loading');
  this.disabled = true; // Disable button immediately

  const currentIpAddress = document.getElementById('ipAddress').textContent;

  // Call GAS server-side function to save attendance
  google.script.run
    .withSuccessHandler(function(result) {
      //console.log('Check-in success:', result);
      showMessage(result, 'success');
      document.getElementById('checkinButton').textContent = 'CHECK-IN!'; // Change text to indicate completion
      document.getElementById('checkinButton').disabled = true; // Keep disabled after successful check-in
      loadMap(); // Refresh the map

      // Update heatmap for the current month after a delay to ensure data consistency
      const now = new Date();
      const yearMonth = now.toISOString().substring(0, 7); // e.g., "2025-07"
      document.getElementById('calendarMonth').value = yearMonth; // Set month filter
      document.getElementById('employeeSelect').value = ''; // Reset to "All" employees
      
      // Reset window-level heatmap caches to force a data refresh
      if (window.currentMonth !== undefined) window.currentMonth = ''; 
      if (window.currentEmployee !== undefined) window.currentEmployee = '';
      if (window.lastResult !== undefined) window.lastResult = null; 

      if (typeof window.loadCheckinCalendar === 'function') {
        // Delay heatmap refresh slightly to allow server-side data to update
        setTimeout(() => {
          window.loadCheckinCalendar(false, true); // Force refresh heatmap
        }, 2000); // 2-second delay
      } else {
        //console.error('loadCheckinCalendar is not defined');
      }
    })
    .withFailureHandler(function(error) {
      //console.log('Check-in error:', error);
      showMessage('CHECK-IN error: ' + error.message, 'error');
      document.getElementById('checkinButton').disabled = false; // Re-enable on error
    })
    .saveAttendance(initialEmployeeId, latitude, longitude, currentIpAddress, initialCheckinCode, accuracy);
});

// Initialize the Leaflet map instance
const map = L.map('map', { zoomControl: true }).setView([OFFICE_LATITUDE, OFFICE_LONGITUDE], 13);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© <a href="https://hcdc-ap.github.io/phamanh/">OSM_AP</a>'
}).addTo(map);

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
  //console.log('loadMap called with employeeId:', initialEmployeeId);
  const mapPlaceholder = document.getElementById("staticMapPlaceholder");
  const mapDiv = document.getElementById("map");

  // Show loading placeholder
  mapPlaceholder.style.display = "flex";
  mapPlaceholder.className = "static-map-placeholder loading";
  mapPlaceholder.innerHTML = `
    <img src="https://i.ibb.co/8wLBpP9/Quby-beddance-1.gif" alt="Loading..." class="loading-gif">
    <p>Loading map...</p>
  `;
  mapDiv.style.display = "none"; // Hide actual map during loading

  google.script.run
    .withSuccessHandler(function(data) {
      //console.log('Map data received:', data);
      if (data.error) {
        //console.log('Map data error:', data.error);
        mapPlaceholder.style.display = "flex";
        mapPlaceholder.className = "static-map-placeholder error";
        mapPlaceholder.innerHTML = `
          <img src="https://i.ibb.co/hxGRL5Nv/Quby-sheet.gif" alt="Error..." class="loading-gif">
          <p>${data.error}</p>
        `;
        showMessage(data.error, "error");
        return;
      }

      // Hide loading placeholder and show map
      mapPlaceholder.style.display = "none";
      mapDiv.style.display = "block";
      map.invalidateSize(); // Invalidate size for correct map rendering

      // Clear existing markers and circles from the map
      map.eachLayer(layer => {
        if (layer instanceof L.Marker || layer instanceof L.Circle) {
          map.removeLayer(layer);
        }
      });

      const points = data.points;
      //console.log('Points to render:', points);
      let bounds = []; // To store coordinates for fitting map view

      points.forEach(point => {
        const { lat, lng, status, label } = point;
        let markerColor = '#0000FF'; // Default to blue for office, if applicable
        let radius = 0; // Default no circle

        if (status === 'Office') {
          markerColor = '#0000FF';
          radius = ACCEPTABLE_RADIUS_METERS; // Office radius
        } else if (status === 'Valid') {
          markerColor = '#008000'; // Green
          radius = ACCEPTABLE_RADIUS_METERS;
        } else if (status === 'Remote (Outside Area)') {
          markerColor = '#FF0000'; // Red
          radius = ACCEPTABLE_RADIUS_METERS; // Still show office radius for context
        } else if (status === 'Remote (Low Accuracy)') {
          markerColor = '#FFA500'; // Orange
          radius = ACCEPTABLE_RADIUS_METERS * LOW_ACCURACY_THRESHOLD_FACTOR; // Show increased accuracy radius
        } else {
            // For 'Remote (No Location)' or 'Unknown', use a default icon/color without a circle
            markerColor = '#808080'; // Grey
            radius = 0;
        }
        
        // Add marker
        const marker = L.marker([lat, lng], { icon: customIcons[status] || L.Icon.Default }).addTo(map)
          .bindPopup(`<b>${label}</b><br>Status: ${status}`);
        
        // Add circle if radius is defined
        if (radius > 0) {
          L.circle([lat, lng], {
            color: markerColor,
            fillColor: markerColor,
            fillOpacity: 0.3,
            radius: radius
          }).addTo(map);
        }
        bounds.push([lat, lng]); // Add point to bounds for map fitting
      });

      //console.log('Bounds:', bounds);
      if (bounds.length > 0) {
        // Fit map to bounds with a slight delay for rendering
        setTimeout(() => {
          map.fitBounds(bounds, { padding: [50, 50] });
          //console.log('Map fitBounds called');
        }, 200);
      } else {
        // If no points, set default view
        //console.log('No bounds to fit, setting default view');
        map.setView([OFFICE_LATITUDE, OFFICE_LONGITUDE], 13);
      }
    })
    .withFailureHandler(function(error) {
      //console.log('Map load error:', error);
      mapPlaceholder.style.display = "flex";
      mapPlaceholder.className = "static-map-placeholder error";
      mapPlaceholder.innerHTML = `
        <img src="https://i.ibb.co/r2hD9hV/Quby-computer.gif" alt="Error..." class="loading-gif">
        <p>Error loading map: ${error.message}</p>
      `;
      showMessage(`Error loading map: ${error.message}`, "error");
    })
    .getAttendanceDataForMap(initialEmployeeId || ''); // Pass employee ID or empty string
}

// Run initialization and load both map and heatmap when the window is fully loaded
window.onload = function() {
  //console.log('Window loaded, initial employeeId:', initialEmployeeId);
  initializePage(); // Start the process of getting info and location
  loadMap(); // Load initial map data
  // Ensure loadCheckinCalendar exists before calling it, as it's defined in the inline script block
  if (typeof window.loadCheckinCalendar === 'function') {
    //console.log('Initial load of heatmap');
    window.loadCheckinCalendar(true); // Perform initial heatmap load
  } else {
    //console.error('loadCheckinCalendar is not defined on initial load');
  }
};
