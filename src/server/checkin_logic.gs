function saveAttendance(employeeId, latitude, longitude, userIpAddress, checkinCodeFromClient, accuracy) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  // Validate Employee
  const employeeSheet = spreadsheet.getSheetByName(EMPLOYEE_LIST_SHEET_NAME);
  if (!employeeSheet) throw new Error(`Sheet '${EMPLOYEE_LIST_SHEET_NAME}' not found.`);
  const employeeData = employeeSheet.getDataRange().getValues();
  const empHeaders = employeeData[0];
  const idCol = empHeaders.indexOf("Employee ID");
  const nameCol = empHeaders.indexOf("Employee Name");
  if (idCol === -1 || nameCol === -1) throw new Error(`Missing column 'Employee ID' or 'Employee Name'.`);

  let employeeName = "";
  const clientEmployeeId = String(employeeId).trim();
  for (let i = 1; i < employeeData.length; i++) {
    if (String(employeeData[i][idCol]).trim() === clientEmployeeId) {
      employeeName = employeeData[i][nameCol];
      break;
    }
  }
  if (!employeeName) throw new Error("Employee with this code not found.");

  // Validate Daily Code
  const codeSheet = spreadsheet.getSheetByName(CODE_SHEET_NAME);
  if (!codeSheet) throw new Error(`Sheet '${CODE_SHEET_NAME}' not found.`);
  const dailyCodesData = codeSheet.getDataRange().getValues();

  const today = new Date();
  const todayFormatted = Utilities.formatDate(today, TIME_ZONE, "yyyy-MM-dd");

  let isValidCode = false;
  let codeTimestamp;
  for (let i = 1; i < dailyCodesData.length; i++) {
    const codeDate = new Date(dailyCodesData[i][0]);
    const codeDateFormatted = Utilities.formatDate(codeDate, TIME_ZONE, "yyyy-MM-dd");
    if (
      codeDateFormatted === todayFormatted &&
      String(dailyCodesData[i][1]).trim() === clientEmployeeId &&
      String(dailyCodesData[i][3]).trim() === String(checkinCodeFromClient).trim()
    ) {
      isValidCode = true;
      codeTimestamp = dailyCodesData[i][0];
      break;
    }
  }
  if (!isValidCode) throw new Error("Invalid attendance code or employee code. Please use the latest link from email.");

  const hoursSinceCodeGenerated = (new Date() - codeTimestamp) / (1000 * 60 * 60);
  if (hoursSinceCodeGenerated > CODE_EXPIRY_HOURS) {
    throw new Error("The attendance code has expired. Please use the latest link from the email.");
  }

  // Determine Geo Location and Status
  let actualGeoLocationAddress = "Unable to determine address";
  if (!isNaN(latitude) && !isNaN(longitude)) {
    actualGeoLocationAddress = getGeoAddressByMapsService(latitude, longitude);
  }

  let distanceToOffice = null;
  let checkinStatus = "Remote (No Location)"; // Default status if no valid location data

  if (!isNaN(latitude) && !isNaN(longitude) && typeof accuracy === "number") {
    distanceToOffice = calculateDistance(latitude, longitude, OFFICE_LATITUDE, OFFICE_LONGITUDE);

    if (distanceToOffice <= ACCEPTABLE_RADIUS_METERS) {
      if (accuracy <= ACCEPTABLE_RADIUS_METERS * LOW_ACCURACY_THRESHOLD_FACTOR) {
        checkinStatus = "Valid";
      } else {
        checkinStatus = "Remote (Low Accuracy)"; // Within radius, but high inaccuracy
      }
    } else {
      checkinStatus = "Remote (Outside Area)"; // Outside radius
    }
  }

  // Check for duplicate check-ins on the same day
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    const headers = [
      "Timestamp",
      "Employee ID",
      "Employee Name",
      "LatLong",
      "GeoLocation",
      "DistanceToOffice (m)",
      "IP Address",
      "Daily Code Used",
      "GeoAccuracy (m)",
      "Checkin Status"
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  const allAttendanceData = sheet.getDataRange().getValues();
  if (allAttendanceData.length > 1) { // Check if there's actual data beyond headers
    const currentAttendanceDate = Utilities.formatDate(new Date(), TIME_ZONE, "yyyy-MM-dd");
    const employeeCheckInsToday = allAttendanceData.filter(row => {
      // Ensure row[0] is a Date object before trying to format
      if (row[0] instanceof Date) {
        const rowDate = Utilities.formatDate(new Date(row[0]), TIME_ZONE, "yyyy-MM-dd");
        return String(row[1]).trim() === clientEmployeeId && rowDate === currentAttendanceDate;
      }
      return false;
    });

    if (employeeCheckInsToday.length > 0) {
      throw new Error("You have already checked in today. Please try again tomorrow.");
    }
  }

  // Append new attendance record
  const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  let colMap = {};
  currentHeaders.forEach((header, index) => (colMap[header] = index + 1));

  const timestamp = new Date();
  const rowData = [];
  rowData[colMap["Timestamp"] - 1] = timestamp;
  rowData[colMap["Employee ID"] - 1] = clientEmployeeId;
  rowData[colMap["Employee Name"] - 1] = employeeName;
  rowData[colMap["LatLong"] - 1] = latitude && longitude ? `${latitude}, ${longitude}` : "Unknown";
  rowData[colMap["GeoLocation"] - 1] = actualGeoLocationAddress;
  rowData[colMap["DistanceToOffice (m)"] - 1] = distanceToOffice !== null ? distanceToOffice.toFixed(2) : "Unknown";
  rowData[colMap["IP Address"] - 1] = userIpAddress || "N/A";
  rowData[colMap["Daily Code Used"] - 1] = checkinCodeFromClient;
  rowData[colMap["GeoAccuracy (m)"] - 1] = accuracy !== null ? accuracy.toFixed(2) : "N/A";
  rowData[colMap["Checkin Status"] - 1] = checkinStatus;

  sheet.appendRow(rowData);

  let returnMessage = `Check-In successful at ${Utilities.formatDate(timestamp, TIME_ZONE, "HH:mm:ss")}! `;
  if (distanceToOffice !== null) {
    returnMessage += `Distance to office: ${distanceToOffice.toFixed(2)}m. `;
  } else {
    returnMessage += `Distance not specified. `;
  }
  returnMessage += `Address: ${actualGeoLocationAddress}.`;

  if (checkinStatus === "Remote (Outside Area)") {
    returnMessage += ` (NOTE: Your location is outside the office area.)`;
  } else if (checkinStatus === "Remote (Low Accuracy)") {
    returnMessage += ` (NOTE: Low location accuracy (${accuracy.toFixed(2)}m). Location may be unreliable.)`;
  } else if (checkinStatus === "Remote (No Location)") {
    returnMessage += ` (NOTE: Unable to get GPS location. Check-in has no location information.)`;
  }

  return returnMessage;
}
