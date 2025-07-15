function getGeoAddressByMapsService(lat, lng) {
  try {
    const geocoder = Maps.newGeocoder().setRegion("VN").setLanguage("vi");
    const location = geocoder.reverseGeocode(lat, lng);

    if (location.status === "OK" && location.results && location.results.length > 0) {
      return location.results[0].formatted_address;
    }

    Logger.log("Maps Service Geocoder returned status: " + location.status + " for " + lat + "," + lng);
    return "Unable to determine address (Maps Service not OK)";
  } catch (e) {
    Logger.log("Error calling Maps Service Geocoder: " + e.message + " for " + lat + "," + lng);
    return "Unable to determine address (Apps Script Maps Service Error)";
  }
}

function getEmployeeNameById(employeeId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EMPLOYEE_LIST_SHEET_NAME);
  if (!sheet) {
    return 'Sheet "EmployeeList" not found.'; // Or throw an error, depending on desired behavior
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf("Employee ID");
  const nameCol = headers.indexOf("Employee Name");

  if (idCol === -1 || nameCol === -1) {
    throw new Error("Missing 'Employee ID' or 'Employee Name' column in EmployeeList.");
  }

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]).trim() === String(employeeId).trim()) {
      return data[i][nameCol];
    }
  }
  return null; // Employee not found
}

function getCodesForToday() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CODE_SHEET_NAME);
  if (!sheet) return []; // Return empty array if sheet not found

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // Only headers or no data

  const todayFormatted = Utilities.formatDate(new Date(), TIME_ZONE, "yyyy-MM-dd");

  return data.filter((row, index) => {
    if (index === 0) return false; // Skip header row
    try {
      const rowDate = Utilities.formatDate(new Date(row[0]), TIME_ZONE, "yyyy-MM-dd");
      return rowDate === todayFormatted;
    } catch (e) {
      Logger.log("Error parsing date in getCodesForToday: " + e.message + " Row: " + row[0]);
      return false; // Skip rows with unparseable dates
    }
  });
}

function generateRandomCode(length) {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

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

function getUserIpAddress() {
  try {
    const response = UrlFetchApp.fetch("https://api.ipify.org?format=text");
    return response.getContentText();
  } catch (e) {
    Logger.log("Failed to get user IP address: " + e.message);
    return "N/A (Error)";
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function include(filename) {
  // This is a GAS-specific function for including HTML parts
  return HtmlService.createTemplateFromFile(filename).evaluate().getContent();
}
