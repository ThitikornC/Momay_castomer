"""
ตัวช่วยหา path ให้ทำงานได้ทั้งตอนรันเป็น .py (dev) และตอน build เป็น .exe (PyInstaller)
"""
import os
import sys


def data_dir():
    """โฟลเดอร์เก็บไฟล์ที่ 'เขียนได้' (.env, models ที่ดาวน์โหลด)
    - frozen (.exe): โฟลเดอร์ข้าง exe
    - dev (.py):     โฟลเดอร์ของสคริปต์
    """
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def resource_dir():
    """โฟลเดอร์ไฟล์ที่ถูก bundle มากับ exe (อ่านอย่างเดียว)
    - frozen: _MEIPASS (ที่ PyInstaller แตกไฟล์ชั่วคราว)
    - dev:    โฟลเดอร์ของสคริปต์
    """
    return getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
