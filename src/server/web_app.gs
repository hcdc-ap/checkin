function doGet(e) {
  try {
    const params = e.parameters || {};
    const action = params.action || "";

    if (action === "getMapData") {
      const employeeId = params.employeeId || "";
      const data = getAttendanceDataForMap(employeeId);
      return ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const employeeId = params.employeeId || "";
    const checkinCode = params.code || "";
    const template = HtmlService.createTemplateFromFile("index");

    template.employeeId = employeeId;
    template.checkinCode = checkinCode;
    template.OFFICE_LATITUDE = OFFICE_LATITUDE;
    template.OFFICE_LONGITUDE = OFFICE_LONGITUDE;
    template.ACCEPTABLE_RADIUS_METERS = ACCEPTABLE_RADIUS_METERS;
    template.LOW_ACCURACY_THRESHOLD_FACTOR = LOW_ACCURACY_THRESHOLD_FACTOR;
    template.scriptUrl = ScriptApp.getService().getUrl(); // This is specific to GAS

    return template
      .evaluate()
      .setTitle("EOC CHECK-IN")
      .setFaviconUrl("https://i.ibb.co/Tw2CN2k/img-8-8-png-crop1.png")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (error) {
    Logger.log(`doGet error: ${error.message}`);
    return ContentService.createTextOutput(JSON.stringify({ error: `Server error: ${error.message}` }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
