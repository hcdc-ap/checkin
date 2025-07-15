const SHEET_NAME = "AttendanceRecords";
const CODE_SHEET_NAME = "DailyCodes";
const EMPLOYEE_LIST_SHEET_NAME = "EmployeeList";
const FAILED_EMAILS_SHEET_NAME = "FailedEmails";

const TIME_ZONE = "Asia/Ho_Chi_Minh";

const OFFICE_LATITUDE = 10.740942012003238;
const OFFICE_LONGITUDE = 106.68562129532752;
const ACCEPTABLE_RADIUS_METERS = 1701;
const LOW_ACCURACY_THRESHOLD_FACTOR = 1.7;

const CODE_EXPIRY_HOURS = 8;
const ADMIN_EMAIL = "hcdc.skmt.ytth@gmail.com";

// This should typically be set as a Project Property in GAS, or passed dynamically
// For GitHub, you might replace this with a placeholder or environment variable if you were running a local server.
// In GAS, ScriptApp.getService().getUrl() gets the deployed web app URL.
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbznz8OYP-4V6IbmCCOYQnKbjilibjkqVmq2w2ro8vOOF3Bnt0a0jK0R7VKqfO7qK9Enyg/exec";
