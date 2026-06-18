; Inno Setup script — สร้าง MomayRelay-Setup.exe
; วิธีใช้: 1) รัน build_exe.bat ก่อน (ได้ dist\MomayRelay\)
;          2) เปิดไฟล์นี้ด้วย Inno Setup Compiler แล้วกด Compile
;          3) ได้ Output\MomayRelay-Setup.exe เอาไปติดตั้งที่เครื่องไซต์ (ไม่ต้องลง Python)
;
; ติดตั้งแบบ per-user (LocalAppData) → โฟลเดอร์เขียนได้ → .env + โมเดลที่ดาวน์โหลดอยู่ครบ

[Setup]
AppName=MomayBUU CCTV Relay
AppVersion=1.0
DefaultDirName={localappdata}\Programs\MomayRelay
DefaultGroupName=MomayBUU CCTV Relay
PrivilegesRequired=lowest
OutputBaseFilename=MomayRelay-Setup
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
DisableProgramGroupPage=yes

[Files]
Source: "dist\MomayRelay\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{group}\MomayBUU CCTV Relay"; Filename: "{app}\MomayRelay.exe"
Name: "{userdesktop}\MomayBUU CCTV Relay"; Filename: "{app}\MomayRelay.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "สร้างไอคอนบนเดสก์ท็อป"; GroupDescription: "ทางลัด:"
Name: "startup"; Description: "เปิดอัตโนมัติเมื่อเข้าใช้งาน Windows"; GroupDescription: "เริ่มอัตโนมัติ:"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "MomayRelay"; ValueData: """{app}\MomayRelay.exe"""; Tasks: startup; Flags: uninsdeletevalue

[Run]
Filename: "{app}\MomayRelay.exe"; Description: "เปิด MomayBUU CCTV Relay ตอนนี้"; Flags: nowait postinstall skipifsilent
