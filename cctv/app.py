"""
Entry point เดียวสำหรับ build เป็น .exe (PyInstaller)

  MomayRelay.exe            → เปิด Control Panel (panel.py) + start relay ให้
  MomayRelay.exe --relay    → โหมด relay ล้วน (panel เรียกตัวเองด้วย flag นี้เป็น subprocess)
"""
import sys

if __name__ == "__main__":
    if "--relay" in sys.argv:
        import relay
        relay.main()
    else:
        import panel
        panel.main()
