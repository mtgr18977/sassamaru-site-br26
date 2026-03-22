#!/usr/bin/env python3
"""Generate PNG icons from SVG for PWA manifest."""
import subprocess
import sys
import os

def generate_with_cairosvg():
    try:
        import cairosvg
        svg_path = os.path.join(os.path.dirname(__file__), 'icon.svg')
        for size in [192, 512]:
            out = os.path.join(os.path.dirname(__file__), f'icon-{size}.png')
            cairosvg.svg2png(url=svg_path, write_to=out, output_width=size, output_height=size)
            print(f"Generated {out}")
        return True
    except ImportError:
        return False

def generate_with_pillow():
    try:
        from PIL import Image, ImageDraw
        for size in [192, 512]:
            img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
            draw = ImageDraw.Draw(img)
            # Background circle
            draw.ellipse([0, 0, size-1, size-1], fill=(26, 71, 49, 255))
            # Inner circle
            margin = int(size * 0.11)
            draw.ellipse([margin, margin, size-1-margin, size-1-margin], fill=(45, 110, 78, 255))
            # Field rectangle
            fx, fy = int(size*0.25), int(size*0.29)
            fw, fh = int(size*0.5), int(size*0.42)
            draw.rectangle([fx, fy, fx+fw, fy+fh], outline=(255,255,255,255), width=max(2, size//60))
            # Center line
            lw = max(2, size//60)
            draw.line([size//2, fy, size//2, fy+fh], fill=(255,255,255,255), width=lw)
            # Center circle
            cr = int(size*0.082)
            draw.ellipse([size//2-cr, size//2-cr, size//2+cr, size//2+cr],
                         outline=(255,255,255,255), width=lw)
            # Center dot
            cd = max(2, size//80)
            draw.ellipse([size//2-cd, size//2-cd, size//2+cd, size//2+cd], fill=(255,255,255,255))
            out = os.path.join(os.path.dirname(__file__), f'icon-{size}.png')
            img.save(out, 'PNG')
            print(f"Generated {out}")
        return True
    except ImportError:
        return False

if __name__ == '__main__':
    if not generate_with_pillow():
        print("Pillow not available, trying cairosvg...")
        if not generate_with_cairosvg():
            print("ERROR: Neither Pillow nor cairosvg available")
            sys.exit(1)
    print("Icons generated successfully!")
