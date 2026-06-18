#include <WebServer.h>
#include <DNSServer.h>


#include <Preferences.h>

extern WebServer server;  // shared with realtime_web.ino
extern String getMACAddress();
extern String deviceSuffix();
extern String sensorSummaryHtml();   // สรุปค่าฝุ่นอ่านสด (แปะหน้า config ก่อนต่อเน็ต)
Preferences preferences;

// Captive portal: ดัก DNS ทุก domain ให้ชี้มาที่ AP (192.168.4.1) → OS เด้งหน้า config ให้เอง
DNSServer dnsServer;
bool apDnsActive = false;

// Programmatically set WiFi credentials and attempt immediate connection.
void setWiFiCredentials(const char* newSsid, const char* newPassword) {
  preferences.begin("wifi", false);
  preferences.putString("ssid", String(newSsid));
  preferences.putString("password", String(newPassword));
  preferences.end();

  Serial.print("Saved WiFi credentials for SSID (programmatic): "); Serial.println(newSsid);

  // Try to connect immediately
  WiFi.mode(WIFI_AP_STA);
  WiFi.disconnect(true);
  delay(200);
  Serial.print("Attempting connect to "); Serial.println(newSsid);
  WiFi.begin(newSsid, newPassword);

  unsigned long start = millis();
  const unsigned long timeout = 15000; // 15s
  while (millis() - start < timeout) {
    if (WiFi.status() == WL_CONNECTED) break;
    delay(500);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Connected to "); Serial.print(newSsid); Serial.print(" - IP: "); Serial.println(WiFi.localIP().toString());
    // disable AP if no clients
    if (WiFi.getMode() == WIFI_AP || WiFi.getMode() == WIFI_AP_STA) {
      int clients = WiFi.softAPgetStationNum();
      if (clients == 0) {
        WiFi.softAPdisconnect(true);
        Serial.println("AP disabled after programmatic STA connect (no AP clients)");
      } else {
        Serial.print("AP kept: has "); Serial.print(clients); Serial.println(" client(s)");
      }
    }
  } else {
    Serial.println("Failed to connect within timeout (15s)");
  }
}

String ssid = "";
String password = "";

// ส่งหน้า config WiFi (โชว์ MAC สำหรับลงทะเบียนเน็ตมหาลัย + สแกน SSID ให้กดเลือก)
void sendConfigPage() {
  String page = R"rawliteral(<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>config WiFi</title>
<style>
body{font-family:sans-serif;background:#fff5f5;color:#333;margin:0;padding:16px;max-width:520px;}
h2{color:#c0392b;border-bottom:3px solid #e74c3c;padding-bottom:8px;}
input,button{font-size:16px;padding:8px;margin:4px 0;border:1px solid #e74c3c;border-radius:6px;box-sizing:border-box;}
input[type=text],input[type=password]{width:100%;}
input[type=submit],button{background:#e74c3c;color:#fff;border:none;cursor:pointer;}
input[type=submit]:hover,button:hover{background:#c0392b;}
a{color:#c0392b;} ul{list-style:none;padding:0;} li{padding:4px 0;border-bottom:1px solid #fadbd8;}
li a{text-decoration:none;}
</style></head><body>
<h2>config WiFi</h2>
<p><b>MAC Address:</b> )rawliteral";
  page += getMACAddress();
  page += R"rawliteral(</p>)rawliteral";
  page += sensorSummaryHtml();   // ★ โชว์ค่าฝุ่นอ่านสด บนหน้า UI ก่อนต่อเน็ต
  page += R"rawliteral(<form action="/save" method="POST">
  SSID:<br><input type="text" name="ssid" id="ssid"><br>
  Password:<br><input type="password" name="password"><br><br>
  <input type="submit" value="submit">
</form>
<p><a href="/sensor">🌫️ อ่านค่าฝุ่นเดี๋ยวนี้ (เช็คก่อนต่อเน็ต)</a></p>
<p>เครือข่ายที่เจอ (กดเพื่อเลือก) <button type="button" onclick="loadScan()">rescan</button></p>
<ul id="list"><li>กำลังสแกน...</li></ul>
<script>
function loadScan(){
  var ul=document.getElementById('list');ul.innerHTML='<li>กำลังสแกน...</li>';
  fetch('/scan').then(function(r){return r.json();}).then(function(list){
    ul.innerHTML='';
    if(!list.length){ul.innerHTML='<li>ไม่พบเครือข่าย</li>';return;}
    list.forEach(function(n){
      var li=document.createElement('li');
      var a=document.createElement('a');a.href='#';
      a.textContent=n.ssid+' ('+n.rssi+'dBm)'+(n.lock?' [locked]':'');
      a.onclick=function(){document.getElementById('ssid').value=n.ssid;return false;};
      li.appendChild(a);ul.appendChild(li);
    });
  }).catch(function(){ul.innerHTML='<li>สแกนล้มเหลว</li>';});
}
window.onload=loadScan;
</script>
</body></html>)rawliteral";
  server.send(200, "text/html", page);
}

void startAPMode() {
  if (apDnsActive) return;  // AP + captive portal เปิดอยู่แล้ว → กัน register handler/DNS ซ้ำ (เลี่ยง leak)
  // ใช้ AP_STA: เปิด STA interface ด้วย เพื่อให้ (1) อ่าน MAC โรงงานได้ไม่เป็น 0
  // และ (2) ยังลอง reconnect STA คู่ขนานกับ AP portal ได้
  WiFi.mode(WIFI_AP_STA);
  String apName = "Momay_PM_" + deviceSuffix();   // ชื่อ AP ไม่ซ้ำต่อเครื่อง (กันสับสนเมื่อมีหลายตัว)
  WiFi.softAP(apName.c_str());
  Serial.print("AP started: "); Serial.print(apName); Serial.println(" (192.168.4.1)");

  // เริ่ม DNS ดักทุก domain → ชี้มาที่ IP ของ AP (captive portal)
  dnsServer.start(53, "*", WiFi.softAPIP());
  apDnsActive = true;
  Serial.println("Captive DNS started (redirect ทุก domain -> 192.168.4.1)");

  server.on("/", HTTP_GET, [](){ sendConfigPage(); });

  // สแกน WiFi รอบๆ → คืน JSON [{ssid,rssi,lock}] ให้หน้าเว็บเอาไปโชว์เป็นรายการให้กดเลือก
  server.on("/scan", HTTP_GET, [](){
    int n = WiFi.scanNetworks();   // sync scan (~2-3 วิ) — ทำใน AP_STA ได้
    String json = "[";
    for (int i = 0; i < n; i++) {
      if (i) json += ",";
      String s = WiFi.SSID(i);
      s.replace("\\", "\\\\");
      s.replace("\"", "\\\"");   // escape สำหรับ JSON
      json += "{\"ssid\":\"" + s + "\",\"rssi\":" + String(WiFi.RSSI(i)) +
              ",\"lock\":" + String(WiFi.encryptionType(i) != WIFI_AUTH_OPEN ? 1 : 0) + "}";
    }
    json += "]";
    WiFi.scanDelete();
    server.send(200, "application/json", json);
  });

  // ทุก URL ที่ไม่รู้จัก (รวม OS captive-probe เช่น generate_204, hotspot-detect)
  // → redirect ไปหน้า portal เพื่อให้มือถือ/คอมเด้งหน้า "Sign in" ขึ้นมาเอง
  server.onNotFound([](){
    // ตอน STA mode (portal ปิดแล้ว) อย่า redirect ไป AP IP (0.0.0.0) → ส่ง 404 ปกติ
    if (!apDnsActive) { server.send(404, "text/plain", "Not found"); return; }
    if (server.hostHeader() != WiFi.softAPIP().toString()) {
      server.sendHeader("Location", String("http://") + WiFi.softAPIP().toString() + "/", true);
      server.send(302, "text/plain", "");
    } else {
      sendConfigPage();
    }
  });

  server.on("/save", HTTP_POST, [](){
    String newSsid = server.arg("ssid");
    String newPassword = server.arg("password");

    preferences.begin("wifi", false);
    preferences.putString("ssid", newSsid);
    preferences.putString("password", newPassword);
    preferences.end();

    Serial.print("Saved WiFi credentials for SSID: ");
    Serial.println(newSsid);
    Serial.println("Attempting immediate connect...");

    if (WiFi.status() == WL_CONNECTED && WiFi.SSID() == newSsid) {
      Serial.println("Already connected to this SSID.");
    } else {
      // Ensure station mode is enabled alongside AP and reset any previous connection
      WiFi.mode(WIFI_AP_STA);
      WiFi.disconnect(true);
      delay(200);
      esp_err_t ret = WiFi.begin(newSsid.c_str(), newPassword.c_str());
      (void)ret; // Arduino's WiFi.begin doesn't return useful code here, keep for future checks
    }

    // รอจนต่อ router ติด (สูงสุด ~12 วิ) เพื่อโชว์ IP จริงบนจอมือถือ — ไม่ต้องใช้ Serial
    // (มือถือยังเกาะ AP อยู่ระหว่างนี้ เลยยังอ่านผลได้)
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 12000) {
      delay(250);
    }

    String html = R"rawliteral(<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WiFi result</title>
<style>body{font-family:sans-serif;background:#fff5f5;color:#333;margin:0;padding:16px;max-width:520px;}
h3{color:#c0392b;} a{color:#c0392b;font-size:18px;}
.ip{font-size:26px;font-weight:bold;color:#c0392b;word-break:break-all;}</style>
</head><body>)rawliteral";
    if (WiFi.status() == WL_CONNECTED) {
      String ip = WiFi.localIP().toString();
      html += "<h3>เชื่อมต่อสำเร็จ</h3>";
      html += "<p>เปิดหน้าควบคุมที่ (จด IP นี้ไว้):</p>";
      html += "<p class='ip'>http://" + ip + "</p>";
      html += "<p><a href='http://" + ip + "/'>เปิดหน้าหลัก</a> &nbsp;|&nbsp; <a href='http://" + ip + "/settings'>Settings</a></p>";
      html += "<p>จากนั้นสลับ WiFi มือถือกลับไปเครือข่ายเดิม แล้วเข้า IP ข้างบน</p>";
    } else {
      html += "<h3>ยังเชื่อมต่อไม่สำเร็จ</h3>";
      html += "<p>เช็ค SSID / รหัสผ่าน / สัญญาณ แล้ว <a href='/'>ลองใหม่</a></p>";
    }
    html += "</body></html>";
    server.send(200, "text/html", html);
    // Do not reboot automatically after saving WiFi credentials.
  });

  // Note: server.begin() will be called by setupWebInterface() in realtime_web.ino
}

void initWiFi() {
  preferences.begin("wifi", true);
  ssid = preferences.getString("ssid", "");
  password = preferences.getString("password", "");
  preferences.end();

  if (ssid == "" || password == "") {
    Serial.println("ยังไม่มีการตั้งค่า WiFi");
    startAPMode();
  } else {
    Serial.print("Connecting to WiFi SSID: "); Serial.println(ssid);
    WiFi.setAutoReconnect(true);   // ให้ SDK พยายามต่อกลับเองเมื่อหลุด (เสริมกับ loop)
    WiFi.begin(ssid.c_str(), password.c_str());
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts++ < 10) {
      delay(1000);
      Serial.println("กำลังเชื่อมต่อ WiFi...");
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.print("WiFi connected: "); Serial.print(ssid); Serial.print(" - IP: ");
        Serial.println(WiFi.localIP().toString());
        // Disable soft AP once station is connected
        if (WiFi.getMode() == WIFI_AP || WiFi.getMode() == WIFI_AP_STA) {
          WiFi.softAPdisconnect(true);
          Serial.println("AP disabled after successful STA connection");
        }
    } else {
      Serial.println("เชื่อมต่อไม่สำเร็จ เริ่มโหมด AP");
      startAPMode();
    }
  }
}

void reconnectWiFi() {
  Serial.print("Reconnecting to WiFi SSID: "); Serial.println(ssid);
  WiFi.begin(ssid.c_str(), password.c_str());
}

// Rate limit for AP client status message
static unsigned long lastAPStatusPrint = 0;
static const unsigned long AP_STATUS_INTERVAL = 10000; // Print every 10 seconds max

void handleWiFiWeb() {
  if (apDnsActive) dnsServer.processNextRequest();  // captive portal DNS
  server.handleClient();
  // If we're connected as STA and AP is still running, disable AP to free resources.
  if (WiFi.status() == WL_CONNECTED) {
    if (WiFi.getMode() == WIFI_AP || WiFi.getMode() == WIFI_AP_STA) {
      // If there are clients on AP, keep it until they disconnect; otherwise disable.
      int clients = WiFi.softAPgetStationNum();
      if (clients == 0) {
        if (apDnsActive) { dnsServer.stop(); apDnsActive = false; }
        WiFi.softAPdisconnect(true);
        Serial.println("AP disabled after STA connected (no AP clients)");
      } else {
        // Rate limit this message to avoid spamming Serial
        unsigned long now = millis();
        if (now - lastAPStatusPrint >= AP_STATUS_INTERVAL) {
          lastAPStatusPrint = now;
          Serial.print("STA connected but AP has "); Serial.print(clients); Serial.println(" client(s); keeping AP");
        }
      }
    }
  }
}

// Return true when station is connected to an AP
bool isNetworkConnected() {
  return (WiFi.status() == WL_CONNECTED);
}

// Attempt to reconnect using stored credentials. Returns true if a reconnect
// attempt was started (credentials present), false otherwise.
bool tryReconnectNetwork() {
  preferences.begin("wifi", true);
  String storedSsid = preferences.getString("ssid", "");
  String storedPassword = preferences.getString("password", "");
  preferences.end();

  if (storedSsid == "") {
    // No credentials: start AP mode so user can configure
    startAPMode();
    return false;
  }

  // If already connected, nothing to do
  if (isNetworkConnected()) return true;

  // หมายเหตุ: ไม่เรียก WiFi.disconnect(true) ก่อน begin — เพื่อไม่ตัดจังหวะการ associate
  // ที่อาจกำลังดำเนินอยู่ (เน็ต enterprise/มหาลัยใช้เวลานานกว่าปกติ)
  Serial.println("Attempting WiFi reconnect...");
  WiFi.begin(storedSsid.c_str(), storedPassword.c_str());
  return true;
}

// Return a human-friendly local IP (station IP when connected, otherwise AP IP)
String getLocalIP() {
  if (WiFi.status() == WL_CONNECTED) return WiFi.localIP().toString();
  return WiFi.softAPIP().toString();
}
