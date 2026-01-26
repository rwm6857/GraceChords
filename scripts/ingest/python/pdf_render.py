#!/usr/bin/env python3
import os
import sys


def main():
    if len(sys.argv) < 3:
        print("Usage: pdf_render.py <pdf_path> <output_dir>", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_dir = sys.argv[2]

    try:
        import fitz
    except Exception:
        print("PyMuPDF (fitz) not installed", file=sys.stderr)
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)

    doc = fitz.open(pdf_path)
    for index, page in enumerate(doc):
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
        out_path = os.path.join(output_dir, f"page_{index + 1:03d}.png")
        pix.save(out_path)
    doc.close()


if __name__ == "__main__":
    main()
