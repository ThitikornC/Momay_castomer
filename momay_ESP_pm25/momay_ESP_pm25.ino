// ─────────────────────────────────────────────────────────────────────────────
// MomayBUU ESP — firmware สำหรับเซ็นเซอร์ฝุ่น PM2.5 "Plantower PMS3003"
//   • ใช้ระบบเดียวกับ momay_ESP เดิม: WiFi(AP captive portal) + Settings + หน้าเว็บ
//     + POST ขึ้น backend + mDNS  (ต่างกันแค่ "อ่านเซ็นเซอร์" แทน "อ่าน Modbus")
//   • เพิ่ม: อ่านเซ็นเซอร์ "ได้ก่อนต่อเน็ต"
//       - พิมพ์ค่าที่อ่านได้ออก Serial ตอนบูต (sensorSelfCheck)
//       - หน้า  http://<ip หรือ 192.168.4.1>/sensor  อ่านสดทุกครั้งที่กด (ใช้ได้ตอน AP ด้วย)
//
// เซ็นเซอร์: Plantower PMS3003 — สื่อสารผ่าน UART (TTL 3.3V, 9600 8N1)
//   ส่งเฟรมเองทุก ~1 วินาที (passive read) เฟรมยาว 24 ไบต์ ขึ้นต้นด้วย 0x42 0x4D
//   อ่าน PM1.0 / PM2.5 / PM10 ทั้งแบบ CF=1 (standard) และ atmospheric (environment)
//
// การต่อสาย (PMS3003 → ESP32-S3-Zero):
//   VCC(pin1)=5V · GND(pin2)=GND · TX(pin5 ของ sensor) → RX2(GP4 ของ ESP — ดู RX2_PIN)
//   (เซ็นเซอร์ใช้ลอจิก 3.3V อยู่แล้ว ต่อ TX→RX ตรงได้)  RESET/SET ปล่อยลอย = ทำงานปกติ
//
// อัปโหลดบน ESP32-S3-Zero (Arduino IDE):
//   Board = "ESP32S3 Dev Module"  ·  USB CDC On Boot = "Enabled" (ไม่งั้นไม่เห็น Serial Monitor)
//   Upload Mode = "UART0 / Hardware CDC"  ·  เลือก COM port ของบอร์ด แล้ว Upload
// ─────────────────────────────────────────────────────────────────────────────
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>
#include <WebServer.h>
#include <Preferences.h>
#include <esp_wifi.h>
#include <esp_system.h>
#include <ESPmDNS.h>

#define DISABLE_SENSOR 0

void initWiFi();
void reconnectWiFi();
bool tryReconnectNetwork();
bool isNetworkConnected();
void handleWiFiWeb();
void startAPMode();
void setWiFiCredentials(const char* newSsid, const char* newPassword);

void setupWebInterface();
void handleWebSocket();
void updateSensorValues(int pm1, int pm25, int pm10, bool ok, String ts);
void updatePostStatus(int code);

WebServer server(80);

const char* DEFAULT_SERVER_URL = "https://gatewaycctvswirroombooking-production.up.railway.app/api/sensor/data";
String        serverUrl;
String        deviceId;                 // ว่าง = ใช้ "pm-<MAC suffix>" อัตโนมัติ (gateway auto-register)
unsigned long sendInterval = 300000;     // ส่งทุก 5 นาที (ตั้งทับได้ที่ /settings)

// PMS3003 ต่อ UART2 — ESP32-S3 เลือก GPIO ได้อิสระ
//   ค่าเริ่ม GP4(RX)/GP5(TX) = ขาที่ ESP32-S3-Zero มี pad แน่นอน, ไม่ชน strapping/USB
//   ESP32 ปกติใช้ 16/17 ก็ได้ · ต่อจริงใช้แค่ RX (รับ TX ของเซ็นเซอร์), TX แทบไม่ได้ใช้
#define RX2_PIN 4
#define TX2_PIN 5

WiFiClient client;
unsigned long lastSendTime = 0;

void loadConfig();
void setupSettingsRoutes();

// ── struct (ประกาศก่อนฟังก์ชันแรก เพื่อ auto-prototype ของ Arduino) ──
struct PMData {
  int pm1, pm25, pm10;            // atmospheric (environment) — ค่าที่ใช้รายงาน
  int pm1_cf1, pm25_cf1, pm10_cf1; // CF=1 (standard, ห้องทดลอง)
  bool ok;
};

String timePrefix() {
  struct tm timeinfo; char out[64];
  if (getLocalTime(&timeinfo)) {
    char timestr[32]; strftime(timestr, sizeof(timestr), "%H:%M:%S", &timeinfo);
    snprintf(out, sizeof(out), "%s.%03d -> ", timestr, (int)(millis() % 1000));
  } else {
    unsigned long s = millis() / 1000;
    snprintf(out, sizeof(out), "%02d:%02d:%02d.%03d -> ",
             (int)((s/3600)%24), (int)((s%3600)/60), (int)(s%60), (int)(millis()%1000));
  }
  return String(out);
}

// ── อ่าน 1 เฟรมจาก PMS3003 (passive) + ตรวจ checksum ──
//   เฟรม 24 ไบต์: [0]=0x42 [1]=0x4D [2..3]=len(0x0014) [4..5]=PM1.0(CF1)
//   [6..7]=PM2.5(CF1) [8..9]=PM10(CF1) [10..11]=PM1.0(atm) [12..13]=PM2.5(atm)
//   [14..15]=PM10(atm) [16..21]=reserved [22..23]=checksum (ผลรวมไบต์ 0..21)
bool readPMS(PMData &d) {
#if DISABLE_SENSOR
  return false;
#endif
  unsigned long start = millis();
  while (millis() - start < 1500) {           // รอเฟรมสดสูงสุด 1.5 วิ
    if (Serial2.available() < 1) { delay(2); continue; }
    if ((uint8_t)Serial2.read() != 0x42) continue;          // หา start byte 1
    unsigned long s2 = millis();
    while (Serial2.available() < 1 && millis() - s2 < 100) delay(1);
    if ((uint8_t)Serial2.read() != 0x4D) continue;          // start byte 2

    uint8_t buf[22]; int got = 0;
    unsigned long s3 = millis();
    while (got < 22 && millis() - s3 < 200) {
      if (Serial2.available()) buf[got++] = (uint8_t)Serial2.read();
      else delay(1);
    }
    if (got < 22) continue;

    uint16_t sum = 0x42 + 0x4D;
    for (int i = 0; i < 20; i++) sum += buf[i];
    uint16_t chk = ((uint16_t)buf[20] << 8) | buf[21];
    if (sum != chk) continue;                               // checksum ไม่ตรง → ทิ้ง หาเฟรมใหม่

    d.pm1_cf1  = ((int)buf[2]  << 8) | buf[3];
    d.pm25_cf1 = ((int)buf[4]  << 8) | buf[5];
    d.pm10_cf1 = ((int)buf[6]  << 8) | buf[7];
    d.pm1      = ((int)buf[8]  << 8) | buf[9];
    d.pm25     = ((int)buf[10] << 8) | buf[11];
    d.pm10     = ((int)buf[12] << 8) | buf[13];
    d.ok = true;
    return true;
  }
  d.ok = false;
  return false;
}

// อ่านเซ็นเซอร์ → (option) ใส่ลง jsonDoc + คืน PMData
PMData readSensor(JsonDocument* doc) {
  PMData d = {0,0,0,0,0,0,false};
  readPMS(d);
  if (doc && d.ok) {
    (*doc)["pm1_0"]      = d.pm1;
    (*doc)["pm2_5"]      = d.pm25;
    (*doc)["pm10"]       = d.pm10;
    (*doc)["pm1_0_cf1"]  = d.pm1_cf1;
    (*doc)["pm2_5_cf1"]  = d.pm25_cf1;
    (*doc)["pm10_cf1"]   = d.pm10_cf1;
  }
  return d;
}

// US AQI จาก PM2.5 (µg/m³) — ใช้โชว์บนหน้าเว็บ
int pm25ToAqi(int c) {
  struct { float cl, ch; int il, ih; } bp[] = {
    {0,12,0,50},{12.1,35.4,51,100},{35.5,55.4,101,150},{55.5,150.4,151,200},
    {150.5,250.4,201,300},{250.5,350.4,301,400},{350.5,500.4,401,500} };
  for (auto &b : bp)
    if (c >= b.cl && c <= b.ch)
      return (int)((b.ih - b.il) / (b.ch - b.cl) * (c - b.cl) + b.il + 0.5f);
  return c > 500 ? 500 : 0;
}
String aqiLabel(int aqi) {
  if (aqi <= 50)  return "ดีมาก";
  if (aqi <= 100) return "ดี";
  if (aqi <= 150) return "ปานกลาง";
  if (aqi <= 200) return "เริ่มมีผลต่อสุขภาพ";
  if (aqi <= 300) return "มีผลต่อสุขภาพ";
  return "อันตราย";
}

// ── อ่าน + พิมพ์ค่าออก Serial (เรียกตอนบูต ก่อนต่อเน็ต) ──
void sensorSelfCheck() {
#if DISABLE_SENSOR
  Serial.println("[selfcheck] เซ็นเซอร์ปิดอยู่ (DISABLE_SENSOR=1)");
  return;
#endif
  Serial.println("──────── อ่าน PMS3003 (ก่อนต่อเน็ต) ────────");
  PMData d = readSensor(nullptr);
  if (d.ok) {
    Serial.printf("  PM1.0 = %d µg/m³\n", d.pm1);
    Serial.printf("  PM2.5 = %d µg/m³  (AQI %d · %s)\n", d.pm25, pm25ToAqi(d.pm25), aqiLabel(pm25ToAqi(d.pm25)).c_str());
    Serial.printf("  PM10  = %d µg/m³\n", d.pm10);
  } else {
    Serial.println("  ** อ่านไม่ได้: เช็ก TX(sensor)→GPIO16, VCC 5V, GND ร่วม, baud 9600 **");
  }
  Serial.println("──────────────────────────────────────────");
  updateSensorValues(d.pm1, d.pm25, d.pm10, d.ok, getTimestamp());
}

// ค่าล่าสุดที่ web เก็บ (จาก realtime_web.ino) — ใช้โชว์แบบไม่ต้องอ่านสด
extern int  lastPm1, lastPm25, lastPm10;
extern bool lastReadOk;

// คืน HTML สรุปค่าเซ็นเซอร์ (ค่า cache ล่าสุด) แปะหน้า config WiFi
String sensorSummaryHtml() {
  String s = "<div style='background:#fff;border:1px solid #e74c3c;border-radius:8px;padding:10px;margin:10px 0'>";
  s += "<b>🌫️ ฝุ่น (ค่าล่าสุด):</b><br>";
  if (!lastReadOk) {
    s += "<span style='color:#c0392b'>อ่านไม่ได้ — เช็ก TX→GPIO16, VCC 5V, GND ร่วม</span>";
  } else {
    s += "PM2.5=" + String(lastPm25) + "  PM1.0=" + String(lastPm1) + "  PM10=" + String(lastPm10) + " µg/m³  "
       + "(AQI " + String(pm25ToAqi(lastPm25)) + ")";
  }
  s += " &nbsp;<a href='/sensor'>» อ่านสด/refresh</a></div>";
  return s;
}

String getTimestamp() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) return "1970-01-01T00:00:00Z";
  char buffer[30]; strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buffer);
}
String getMACAddress() { return WiFi.macAddress(); }
String deviceSuffix()  { String m = WiFi.macAddress(); m.replace(":", ""); return m.substring(6); }

void loadConfig() {
  Preferences p; p.begin("cfg", true);
  serverUrl    = p.getString("server_url", DEFAULT_SERVER_URL);
  deviceId     = p.getString("device_id", "");
  sendInterval = (unsigned long)p.getUInt("interval_s", 300) * 1000UL;   // default 5 นาที
  p.end();
  Serial.printf("Config: url=%s deviceId=%s interval(s)=%lu\n",
                serverUrl.c_str(), deviceId.c_str(), sendInterval/1000);
}

// deviceId ที่ใช้ส่ง — ถ้าไม่ตั้งเอง ใช้ "pm-<MAC suffix>" (ตรงกับที่ gateway auto-register)
String effectiveDeviceId() {
  return deviceId.isEmpty() ? ("pm-" + deviceSuffix()) : deviceId;
}

void setup() {
  Serial.begin(115200);
  { Preferences p; p.begin("mac", false); p.remove("mac_addr"); p.end(); }
  loadConfig();

#if !DISABLE_SENSOR
  Serial2.begin(9600, SERIAL_8N1, RX2_PIN, TX2_PIN);
  sensorSelfCheck();     // ★ อ่านเซ็นเซอร์ + พิมพ์ออก Serial ทันที — "ก่อนต่อเน็ต"
#else
  Serial.println("Sensor disabled at compile-time");
#endif

  initWiFi();
  configTime(25200, 0, "pool.ntp.org", "time.nist.gov");
  setupSettingsRoutes();   // /settings + /savesettings + /sensor
  setupWebInterface();
}

// ── หน้า /settings + /savesettings + /sensor (อ่านสด) ──
void setupSettingsRoutes() {
  server.on("/settings", HTTP_GET, [](){
    String html = R"rawliteral(<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ESP Settings</title><style>
body{font-family:sans-serif;background:#fff5f5;color:#333;margin:0;padding:16px;max-width:520px;}
h2{color:#c0392b;border-bottom:3px solid #e74c3c;padding-bottom:8px;}
input{font-size:16px;padding:8px;margin:4px 0;border:1px solid #e74c3c;border-radius:6px;box-sizing:border-box;}
input[type=text],input[type=number]{width:100%;}
input[type=submit]{background:#e74c3c;color:#fff;border:none;cursor:pointer;}
a{color:#c0392b;}</style></head><body>
<h2>ESP Settings (PM2.5 PMS3003)</h2>
<form action="/savesettings" method="POST">
  Server URL (gateway /api/sensor/data):<br><input type="text" name="server_url" style="width:95%" value=")rawliteral";
    html += serverUrl;
    html += R"rawliteral("><br><br>
  Device ID (ว่าง = อัตโนมัติ):<br><input type="text" name="device_id" style="width:95%" placeholder=")rawliteral";
    html += effectiveDeviceId();
    html += R"rawliteral(" value=")rawliteral";
    html += deviceId;
    html += R"rawliteral("><br><br>
  Send interval (วินาที):<br><input type="number" name="interval_s" min="5" value=")rawliteral";
    html += String(sendInterval / 1000);
    html += R"rawliteral("><br><br>
  <input type="submit" value="save">
</form>
<p><a href="/sensor">🌫️ อ่านค่าฝุ่นเดี๋ยวนี้</a> | <a href="/">&larr; back</a></p>
</body></html>)rawliteral";
    server.send(200, "text/html", html);
  });

  server.on("/savesettings", HTTP_POST, [](){
    if (server.hasArg("server_url")) serverUrl = server.arg("server_url");
    if (server.hasArg("device_id"))  deviceId  = server.arg("device_id");
    if (server.hasArg("interval_s")) {
      long s = server.arg("interval_s").toInt(); if (s < 5) s = 5;
      sendInterval = (unsigned long)s * 1000UL;
    }
    Preferences p; p.begin("cfg", false);
    p.putString("server_url", serverUrl);
    p.putString("device_id", deviceId);
    p.putUInt("interval_s", (uint32_t)(sendInterval / 1000));
    p.end();
    server.send(200, "text/html",
      "<h3>Saved &amp; applied</h3><p><a href='/settings'>back</a> | <a href='/sensor'>อ่านฝุ่น</a></p>");
  });

  // ★ อ่านเซ็นเซอร์สดทุกครั้งที่กด — ใช้ได้แม้ยังไม่ต่อเน็ต (โหมด AP ก็เข้าได้)
  server.on("/sensor", HTTP_GET, [](){
    PMData d = readSensor(nullptr);
    int aqi = pm25ToAqi(d.pm25);
    String html = R"rawliteral(<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>อ่านฝุ่น</title><meta http-equiv="refresh" content="3"><style>
body{font-family:sans-serif;background:#fff5f5;color:#333;margin:0;padding:16px;max-width:560px;}
h2{color:#c0392b;border-bottom:3px solid #e74c3c;padding-bottom:8px;}
table{width:100%;border-collapse:collapse;} td{padding:5px 4px;border-bottom:1px solid #fadbd8;}
td.k{color:#888;} td.v{text-align:right;font-weight:bold;} .big{font-size:24px;}
.ok{color:green;} .bad{color:#c0392b;} a{color:#c0392b;}</style></head><body>
<h2>อ่านฝุ่น (สด · refresh 3วิ)</h2>)rawliteral";
    html += "<p>สถานะ: <b class='" + String(d.ok?"ok":"bad") + "'>" +
            String(d.ok?"อ่านได้":"อ่านไม่ได้") + "</b></p>";
    html += "<table>";
    html += "<tr><td class='k'>PM2.5</td><td class='v big'>" + String(d.pm25) + " µg/m³</td></tr>";
    html += "<tr><td class='k'>AQI (US)</td><td class='v big'>" + String(aqi) + " · " + aqiLabel(aqi) + "</td></tr>";
    html += "<tr><td class='k'>PM1.0</td><td class='v'>" + String(d.pm1) + " µg/m³</td></tr>";
    html += "<tr><td class='k'>PM10</td><td class='v'>" + String(d.pm10) + " µg/m³</td></tr>";
    html += "<tr><td class='k'>PM1.0 (CF=1)</td><td class='v'>" + String(d.pm1_cf1) + "</td></tr>";
    html += "<tr><td class='k'>PM2.5 (CF=1)</td><td class='v'>" + String(d.pm25_cf1) + "</td></tr>";
    html += "<tr><td class='k'>PM10 (CF=1)</td><td class='v'>" + String(d.pm10_cf1) + "</td></tr>";
    html += "</table>";
    if (!d.ok)
      html += "<p class='bad'>** อ่านไม่ได้: เช็ก TX(sensor)→GPIO16, VCC 5V, GND ร่วม, baud 9600 **</p>";
    html += "<p><a href='/settings'>⚙ Settings</a> | <a href='/'>home</a></p></body></html>";
    server.send(200, "text/html", html);
  });
}

void sendData() {
#if DISABLE_SENSOR
  Serial.println("sendData skipped: sensor disabled");
  return;
#endif
  if (!isNetworkConnected()) {
    if (tryReconnectNetwork()) Serial.println("Network หลุด กำลังเชื่อมใหม่...");
    return;
  }

  StaticJsonDocument<1024> jsonDoc;
  PMData d = readSensor(&jsonDoc);

  // guard: อ่านไม่ได้ → ไม่ POST (กัน row ขยะ)
  if (!d.ok) {
    Serial.println("อ่านเซ็นเซอร์ไม่ได้ — ข้ามการส่งรอบนี้");
    updateSensorValues(0,0,0,false, getTimestamp());
    return;
  }

  String mac = getMACAddress();
  String timestamp = getTimestamp();
  jsonDoc["deviceId"]    = effectiveDeviceId();   // gateway ใช้ key นี้ register/หา device
  jsonDoc["aqi_us"]      = pm25ToAqi(d.pm25);
  jsonDoc["timestamp"]   = timestamp;
  jsonDoc["mac_address"] = mac;

  updateSensorValues(d.pm1, d.pm25, d.pm10, true, timestamp);

  String requestBody; serializeJson(jsonDoc, requestBody);
  Serial.printf("PM2.5=%d PM1.0=%d PM10=%d  sending %u fields\n",
                d.pm25, d.pm1, d.pm10, (unsigned)jsonDoc.size());

  if (serverUrl.isEmpty()) {
    Serial.println("serverUrl ว่าง — ข้าม POST (ตั้งที่ /settings)");
    updatePostStatus(0); return;
  }
  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(requestBody);
  Serial.printf("POST response: %d\n", code);
  http.end();
  updatePostStatus(code);
}

void loop() {
  handleWiFiWeb();
  handleWebSocket();

  static unsigned long disconnectedSince = 0, lastReconnectTry = 0;
  static bool mdnsStarted = false;
  const unsigned long RECONNECT_INTERVAL = 15000, AP_FALLBACK_AFTER = 60000;

  if (!isNetworkConnected()) {
    unsigned long now = millis();
    if (disconnectedSince == 0) {
      disconnectedSince = now; lastReconnectTry = now - RECONNECT_INTERVAL;
      MDNS.end(); mdnsStarted = false;
      Serial.println("WiFi หลุด — เริ่มพยายามเชื่อมใหม่");
    }
    if (now - lastReconnectTry >= RECONNECT_INTERVAL) { lastReconnectTry = now; tryReconnectNetwork(); }
    if (now - disconnectedSince >= AP_FALLBACK_AFTER) startAPMode();
    delay(20);
  } else {
    if (disconnectedSince != 0) disconnectedSince = 0;
    if (!mdnsStarted) {
      Serial.printf(">>> WiFi connected — IP: %s\n", WiFi.localIP().toString().c_str());
      String host = "momay-pm-" + deviceSuffix();
      if (MDNS.begin(host.c_str())) { MDNS.addService("http", "tcp", 80);
        Serial.printf("mDNS: http://%s.local\n", host.c_str()); }
      mdnsStarted = true;
      lastSendTime = millis() - sendInterval;
    }
    if (millis() - lastSendTime >= sendInterval) { lastSendTime = millis(); sendData(); }
  }
}
