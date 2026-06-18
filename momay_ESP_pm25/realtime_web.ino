#include <WebServer.h>

extern WebServer server;  // shared from main sketch
extern String getLocalIP();
extern String getMACAddress();
extern String timePrefix();
extern int    pm25ToAqi(int c);
extern String aqiLabel(int aqi);

// ── สถานะล่าสุด (โชว์บนหน้าเว็บที่ IP) ──
int   lastPm1 = 0, lastPm25 = 0, lastPm10 = 0;
String lastTimestamp = "-";
bool  lastReadOk = false;       // อ่านเซ็นเซอร์รอบล่าสุดสำเร็จไหม
int   lastHttpCode = 0;         // POST response code ล่าสุด (0 = ยังไม่ส่ง/skip)
unsigned long lastUpdateMs = 0; // millis ตอนอัปเดตค่าล่าสุด

void setupWebInterface() {
  server.on("/", HTTP_GET, [](){
    String html = R"rawliteral(<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Momay ESP — PM2.5</title>
<style>
body{font-family:sans-serif;background:#fff5f5;color:#333;margin:0;padding:16px;max-width:520px;}
h2{color:#c0392b;border-bottom:3px solid #e74c3c;padding-bottom:8px;}
table{width:100%;border-collapse:collapse;} td{padding:6px 4px;border-bottom:1px solid #fadbd8;}
td.k{color:#888;width:45%;} td.v{font-weight:bold;text-align:right;}
a{color:#c0392b;} .big{font-size:24px;}
</style>
<script>
function col(el,ok){el.style.color= ok ? 'green' : '#c0392b';}
function fetchData(){
  fetch("/data").then(r=>r.json()).then(d=>{
    document.getElementById("pm25").innerText=d.pm2_5;
    document.getElementById("aqi").innerText=d.aqi+" · "+d.aqi_label;
    document.getElementById("pm1").innerText=d.pm1_0;
    document.getElementById("pm10").innerText=d.pm10;
    document.getElementById("ts").innerText=d.timestamp;
    document.getElementById("age").innerText=d.age+" วิที่แล้ว";
    var rd=document.getElementById("read");
    rd.innerText=d.read_ok?"สำเร็จ":"ไม่สำเร็จ"; col(rd,d.read_ok);
    var hc=document.getElementById("http");
    if(d.http_code===0){hc.innerText="ยังไม่ส่ง";hc.style.color="#888";}
    else if(d.http_code>=200&&d.http_code<300){hc.innerText=d.http_code+" OK";hc.style.color="green";}
    else{hc.innerText=d.http_code;hc.style.color="#c0392b";}
  }).catch(e=>{});
}
setInterval(fetchData,3000);
window.onload=fetchData;
</script></head><body>
<h2>Momay ESP — PM2.5</h2>
<table>
<tr><td class="k">อ่านเซ็นเซอร์</td><td class="v" id="read">-</td></tr>
<tr><td class="k">POST status</td><td class="v" id="http">-</td></tr>
<tr><td class="k">PM2.5</td><td class="v big"><span id="pm25">-</span> µg/m³</td></tr>
<tr><td class="k">AQI (US)</td><td class="v big" id="aqi">-</td></tr>
<tr><td class="k">PM1.0</td><td class="v"><span id="pm1">-</span> µg/m³</td></tr>
<tr><td class="k">PM10</td><td class="v"><span id="pm10">-</span> µg/m³</td></tr>
<tr><td class="k">Timestamp</td><td class="v" id="ts">-</td></tr>
<tr><td class="k">อัปเดตล่าสุด</td><td class="v" id="age">-</td></tr>
</table>
<p>IP: )rawliteral";
    html += getLocalIP();
    html += R"rawliteral( &nbsp; | &nbsp; MAC: )rawliteral";
    html += getMACAddress();
    html += R"rawliteral(</p>
<p><a href="/sensor">🌫️ อ่านฝุ่นสด</a> | <a href="/settings">⚙ Settings</a></p>
</body></html>)rawliteral";
    server.send(200, "text/html", html);
  });

  server.on("/data", HTTP_GET, [](){
    unsigned long age = lastUpdateMs ? (millis() - lastUpdateMs) / 1000 : 0;
    int aqi = pm25ToAqi(lastPm25);
    String json = String("{") +
      "\"pm1_0\":"     + String(lastPm1) + "," +
      "\"pm2_5\":"     + String(lastPm25) + "," +
      "\"pm10\":"      + String(lastPm10) + "," +
      "\"aqi\":"       + String(aqi) + "," +
      "\"aqi_label\":\"" + aqiLabel(aqi) + "\"," +
      "\"read_ok\":"   + (lastReadOk ? "true" : "false") + "," +
      "\"http_code\":" + String(lastHttpCode) + "," +
      "\"age\":"       + String(age) + "," +
      "\"timestamp\":\"" + lastTimestamp + "\"" +
      "}";
    server.send(200, "application/json", json);
  });

  server.begin();
}

void handleWebSocket() {
  // Syncronous WebServer handles requests via server.handleClient()
}

// อัปเดตค่าที่อ่านได้ (เรียกทุกรอบ sendData ทั้งสำเร็จ/ล้มเหลว)
void updateSensorValues(int pm1, int pm25, int pm10, bool ok, String ts) {
  lastPm1 = pm1;
  lastPm25 = pm25;
  lastPm10 = pm10;
  lastReadOk = ok;
  lastTimestamp = ts;
  lastUpdateMs = millis();
}

// อัปเดต POST response code (เรียกหลังส่งข้อมูล)
void updatePostStatus(int code) {
  lastHttpCode = code;
}
