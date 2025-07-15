function generateAndSendDailyCode() {
  const today = new Date();
  const todayFormatted = Utilities.formatDate(today, TIME_ZONE, "yyyy-MM-dd");
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  let codeSheet = spreadsheet.getSheetByName(CODE_SHEET_NAME);
  if (!codeSheet) {
    codeSheet = spreadsheet.insertSheet(CODE_SHEET_NAME);
    codeSheet.getRange(1, 1, 1, 4).setValues([["Date", "Employee ID", "Employee Name", "Daily Code"]]);
    notifyAdmin(`Create new sheet '${CODE_SHEET_NAME}'.`);
  }

  const employeeSheet = spreadsheet.getSheetByName(EMPLOYEE_LIST_SHEET_NAME);
  if (!employeeSheet) {
    notifyAdmin(`Sheet '${EMPLOYEE_LIST_SHEET_NAME}' not found.`);
    throw new Error(`Sheet '${EMPLOYEE_LIST_SHEET_NAME}' not found.`);
  }

  const employeeData = employeeSheet.getDataRange().getValues();
  if (employeeData.length < 2) {
    notifyAdmin("No employee data to email.");
    Logger.log("No employee data to send email.");
    return;
  }

  const empHeaders = employeeData[0];
  const idCol = empHeaders.indexOf("Employee ID");
  const nameCol = empHeaders.indexOf("Employee Name");
  const emailCol = empHeaders.indexOf("Email");

  if (idCol === -1 || nameCol === -1 || emailCol === -1) {
    notifyAdmin(`Sheet '${EMPLOYEE_LIST_SHEET_NAME}' missing columns 'Employee ID', 'Employee Name', or 'Email'.`);
    throw new Error(`Sheet '${EMPLOYEE_LIST_SHEET_NAME}' must have columns 'Employee ID', 'Employee Name', 'Email'.`);
  }

  const codesForToday = getCodesForToday();
  const existingCodes = codesForToday.map(row => row[3]); // Assuming column 3 is 'Daily Code'

  const newCodesToAppend = [];
  const webAppUrl = WEB_APP_URL; // Use the constant defined

  for (let i = 1; i < employeeData.length; i++) {
    const empId = employeeData[i][idCol];
    const empName = employeeData[i][nameCol];
    const empEmail = employeeData[i][emailCol]?.trim(); // Use optional chaining for safety

    if (!empEmail || !isValidEmail(empEmail)) {
      Logger.log(`Invalid email for ${empName} (${empId}): ${empEmail}`);
      continue; // Skip to the next employee
    }

    if (empId) { // Ensure Employee ID exists
      // Check if a code for this employee already exists today
      if (codesForToday.some(codeRow => codeRow[1] === empId)) { // Assuming column 1 is 'Employee ID'
        Logger.log(`Code for ${empName} (${empId}) already exists today. Skip.`);
        continue;
      }

      let personalCode;
      do {
        personalCode = generateRandomCode(8);
      } while (existingCodes.includes(personalCode)); // Ensure unique code

      newCodesToAppend.push([new Date(), empId, empName, personalCode]);
      existingCodes.push(personalCode); // Add to existingCodes to prevent duplicates within this run

      const checkinLink = `${webAppUrl}?employeeId=${empId}&code=${personalCode}`;

      const subject = "🔥 EOC CHECK-IN Daily Link";
      const body = `
<div style="font-family: 'Ubuntu', Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
<img src="https://i.ibb.co/Tw2CN2k/img-8-8-png-crop1.png" alt="EOC Logo" style="display: block; margin: 0 auto; height: 48px;">
<h2 style="color: #2563eb; text-align: center;">EOC CHECK-IN</h2>
<p>Hello <strong>${empName}</strong>,</p>
<p>To check in today (${todayFormatted}), please use the following link:</p>
<p style="text-align: center;">
<a href="${checkinLink}" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px;">CHECK-IN Now</a>
</p>
<p><strong>Attendance code:</strong> ${personalCode}</p>
<p>This link is valid for <strong>${CODE_EXPIRY_HOURS} hours</strong>. Please CHECK-IN at the office (within ${ACCEPTABLE_RADIUS_METERS}m).</p>
<p>If you have any problems, contact admin at <a href="mailto:${ADMIN_EMAIL}">${ADMIN_EMAIL}</a>.</p>
<p>Best regards,<br>EOC Team</p>
</div>
`;
      try {
        MailApp.sendEmail({ to: empEmail, subject: subject, htmlBody: body });
        Logger.log(`Sent code ${personalCode} to ${empName} (${empEmail})`);
      } catch (e) {
        Logger.log(`Error sending email to ${empName} (${empEmail}): ${e.message}`);
        logFailedEmail(empId, empName, empEmail, personalCode, e.message);
      }
    }
  }

  if (newCodesToAppend.length > 0) {
    codeSheet.getRange(codeSheet.getLastRow() + 1, 1, newCodesToAppend.length, 4).setValues(newCodesToAppend);
  }
}

function notifyAdmin(message) {
  try {
    MailApp.sendEmail(ADMIN_EMAIL, "EOC Check-in System Alert", message);
    Logger.log("Admin notified: " + message);
  } catch (e) {
    Logger.log("Failed to send admin email: " + e.message);
  }
}

function logFailedEmail(employeeId, employeeName, email, code, errorMessage) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(FAILED_EMAILS_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(FAILED_EMAILS_SHEET_NAME);
    sheet.appendRow(["Timestamp", "Employee ID", "Employee Name", "Email", "Daily Code", "Error Message"]);
  }
  sheet.appendRow([new Date(), employeeId, employeeName, email, code, errorMessage]);
}
