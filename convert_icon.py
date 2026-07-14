import os
from PIL import Image

png_path = r"C:\Users\datdt\.gemini\antigravity\brain\81f1b419-ee4f-484a-b2b3-a58c7bf47a06\app_icon_1783991461427.png"
public_ico_path = r"C:\Users\datdt\.gemini\antigravity\scratch\notion_product_creator\public\favicon.ico"
root_ico_path = r"C:\Users\datdt\.gemini\antigravity\scratch\notion_product_creator\app_icon.ico"

if os.path.exists(png_path):
    img = Image.open(png_path)
    
    # Standard multi-resolution sizes for Windows icons
    sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    
    # Save as multi-resolution ICO
    img.save(public_ico_path, format="ICO", sizes=sizes)
    img.save(root_ico_path, format="ICO", sizes=sizes)
    print("Convert success!")
else:
    print(f"File not found: {png_path}")
