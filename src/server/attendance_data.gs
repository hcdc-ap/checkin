function getAttendanceDataForMap(employeeId = "") {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const attendanceSheet = spreadsheet.getSheetByName(SHEET_NAME);

    if (!attendanceSheet) {
      Logger.log(`Error: Sheet '${SHEET_NAME}' not found.`);
      return { error: `Sheet '${SHEET_NAME}' not found.` };
    }

    const allAttendanceData = attendanceSheet.getDataRange().getValues();
    if (allAttendanceData.length <= 1) {
      Logger.log("Notice: No attendance data (only headers).");
      return { error: "No attendance data available." };
    }

    const headers = allAttendanceData[0];
    const latLongCol = headers.indexOf("LatLong");
    const checkinStatusCol = headers.indexOf("Checkin Status");
    const employeeIdCol = headers.indexOf("Employee ID");

    if (latLongCol === -1) {
      Logger.log("Error: Column 'LatLong' not found in attendance sheet.");
      return { error: "Column 'LatLong' not found." };
    }

    let attendancePoints = [];

    // Add office location
    if (!isNaN(OFFICE_LATITUDE) && !isNaN(OFFICE_LONGITUDE)) {
      attendancePoints.push({
        lat: OFFICE_LATITUDE,
        lng: OFFICE_LONGITUDE,
        status: "Office",
        label: "Office (HCDC)"
      });
      Logger.log(`Added office: ${OFFICE_LATITUDE}, ${OFFICE_LONGITUDE}`);
    }

    // Add employee check-in locations
    for (let i = 1; i < allAttendanceData.length; i++) {
      const row = allAttendanceData[i];

      if (employeeId && employeeIdCol !== -1 && String(row[employeeIdCol]).trim() !== String(employeeId).trim()) {
        continue;
      }

      const latLongStr = row[latLongCol];
      const checkinStatus = checkinStatusCol !== -1 ? row[checkinStatusCol] : "Unknown";

      if (latLongStr && typeof latLongStr === "string" && latLongStr.includes(",")) {
        try {
          const [latStr, lngStr] = latLongStr.split(",").map(s => s.trim());
          const lat = parseFloat(latStr);
          const lng = parseFloat(lngStr);

          if (!isNaN(lat) && !isNaN(lng)) {
            attendancePoints.push({
              lat: lat,
              lng: lng,
              status: checkinStatus,
              label: `Employee Check-in (${checkinStatus})`
            });
            Logger.log(`Added check-in: ${lat}, ${lng} (${checkinStatus})`);
          } else {
            Logger.log(`Warning: Non-numeric coordinates in row ${i + 1}: ${latLongStr}`);
          }
        } catch (e) {
          Logger.log(`Error parsing LatLong '${latLongStr}' in row ${i + 1}: ${e.message}`);
        }
      }
    }

    if (attendancePoints.length === 0) {
      Logger.log("Result: No valid points to display.");
      return { error: "No valid attendance points found." };
    }

    return {
      points: attendancePoints,
      officeLatitude: OFFICE_LATITUDE,
      officeLongitude: OFFICE_LONGITUDE,
      acceptableRadiusMeters: ACCEPTABLE_RADIUS_METERS,
      lowAccuracyThresholdFactor: LOW_ACCURACY_THRESHOLD_FACTOR
    };
  } catch (error) {
    Logger.log(`getAttendanceDataForMap error: ${error.message}`);
    return { error: `Server error: ${error.message}` };
  }
}

function getAttendanceCalendarMonthWithRemote(year, month) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const attendanceSheet = spreadsheet.getSheetByName(SHEET_NAME);
  const employeeSheet = spreadsheet.getSheetByName(EMPLOYEE_LIST_SHEET_NAME);

  if (!attendanceSheet) {
    Logger.log(`Sheet '${SHEET_NAME}' not found.`);
    return { employees: [], daily: {} };
  }
  if (!employeeSheet) {
    Logger.log(`Sheet '${EMPLOYEE_LIST_SHEET_NAME}' not found.`);
    return { employees: [], daily: {} };
  }

  const allAttendanceData = attendanceSheet.getDataRange().getValues();
  const allEmployeeData = employeeSheet.getDataRange().getValues();

  const employeeList = new Set();
  if (allEmployeeData.length > 1) {
    const empHeaders = allEmployeeData[0];
    const nameCol = empHeaders.indexOf("Employee Name");
    if (nameCol !== -1) {
      for (let i = 1; i < allEmployeeData.length; i++) {
        if (allEmployeeData[i][nameCol]) {
          employeeList.add(allEmployeeData[i][nameCol]);
        }
      }
    }
  }

  const dailyCheckins = {};
  if (allAttendanceData.length > 1) {
    const headers = allAttendanceData[0];
    const timestampCol = headers.indexOf("Timestamp");
    const employeeNameCol = headers.indexOf("Employee Name");
    const checkinStatusCol = headers.indexOf("Checkin Status");

    if (timestampCol === -1 || employeeNameCol === -1) {
      Logger.log("Missing Timestamp or Employee Name column in AttendanceRecords.");
      return { employees: Array.from(employeeList).sort(), daily: {} };
    }

    for (let i = 1; i < allAttendanceData.length; i++) {
      const row = allAttendanceData[i];
      const timestamp = new Date(row[timestampCol]);
      const checkinYear = timestamp.getFullYear();
      const checkinMonth = timestamp.getMonth() + 1; // getMonth() is 0-indexed

      if (checkinYear === year && checkinMonth === month) {
        const dateKey = Utilities.formatDate(timestamp, TIME_ZONE, "yyyy-MM-dd");
        const empName = row[employeeNameCol];
        const status = checkinStatusCol !== -1 ? row[checkinStatusCol] : "Valid";

        if (!dailyCheckins[dateKey]) {
          dailyCheckins[dateKey] = { valid: [], remote: [] };
        }

        if (status === "Valid") {
          dailyCheckins[dateKey].valid.push(empName);
        } else {
          dailyCheckins[dateKey].remote.push(empName);
        }
      }
    }
  }
  return { employees: Array.from(employeeList).sort(), daily: dailyCheckins };
}
