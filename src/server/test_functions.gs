function testSendEmail() {
  const testEmpId = "EOC2";
  const testEmpName = "Thuy Anh";
  const testEmpEmail = "hcdc.skmt.ytth@gmail.com";
  const testCode = generateRandomCode(8);

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let codeSheet = spreadsheet.getSheetByName(CODE_SHEET_NAME);
  if (!codeSheet) {
    codeSheet = spreadsheet.insertSheet(CODE_SHEET_NAME);
    codeSheet.getRange(1, 1, 1, 4).setValues([["Date", "Employee ID", "Employee Name", "Daily Code"]]);
    notifyAdmin(`Create new sheet '${CODE_SHEET_NAME}'.`);
  }

  const codesForToday = getCodesForToday();
  const existingCodes = codesForToday.map(row => row[3]);
  let personalCode = testCode;
  while (existingCodes.includes(personalCode)) {
    personalCode = generateRandomCode(8);
  }

  codeSheet.appendRow([new Date(), testEmpId, testEmpName, personalCode]);
  Logger.log(`Added ${personalCode} for ${testEmpName} (${testEmpId}) to DailyCodes`);

  const webAppUrl = WEB_APP_URL; // Use the constant
  const checkinLink = `${webAppUrl}?employeeId=${testEmpId}&code=${personalCode}`;

  const subject = "🔥 EOC Check-In Link Daily";
  const body = `
<div style="font-family: 'Ubuntu', Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
<img src="https://i.ibb.co/Tw2CN2k/img-8-8-png-crop1.png" alt="EOC Logo" style="display: block; margin: 0 auto; height: 48px;">
<h2 style="color: #2563eb; text-align: center;">EOC Check-In</h2>
<p>Hello <strong>${testEmpName}</strong>,</p>
<p>This is the attendance email. To check in, please use the following link:</p>
<p style="text-align: center;">
<a href="${checkinLink}" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px;">Check-In Now</a>
</p>
<p><strong>Attendance code:</strong> ${personalCode}</p>
<p>This link is valid for <strong>${CODE_EXPIRY_HOURS} hours</strong>.</p>
<p>Best regards,<br>EOC Team</p>
</div>
`;

  try {
    MailApp.sendEmail({ to: testEmpEmail, subject: subject, htmlBody: body });
    Logger.log(`Test email sent to ${testEmpEmail}`);
  } catch (e) {
    Logger.log(`Failed sending test email: ${e.message}`);
    logFailedEmail(testEmpId, testEmpName, testEmpEmail, personalCode, e.message);
  }
}

function testGetEmployeeName() {
  Logger.log(getEmployeeNameById("EOC2"));
}
