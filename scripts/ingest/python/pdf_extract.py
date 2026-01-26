#!/usr/bin/env python3
import json
import sys


def extract_with_pdfplumber(path):
    import pdfplumber
    words = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for w in page.extract_words():
                words.append({
                    "text": w.get("text", ""),
                    "x": float(w.get("x0", 0)),
                    "y": float(w.get("top", 0)),
                    "w": float(w.get("x1", 0)) - float(w.get("x0", 0)),
                    "h": float(w.get("bottom", 0)) - float(w.get("top", 0))
                })
    return words


def extract_with_pymupdf(path):
    import fitz
    words = []
    doc = fitz.open(path)
    for page in doc:
        for w in page.get_text("words"):
            x0, y0, x1, y1, text = w[0], w[1], w[2], w[3], w[4]
            words.append({
                "text": text,
                "x": float(x0),
                "y": float(y0),
                "w": float(x1 - x0),
                "h": float(y1 - y0)
            })
    doc.close()
    return words


def main():
    if len(sys.argv) < 3:
        print("Usage: pdf_extract.py <pdf_path> <output_json>", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_path = sys.argv[2]

    words = None
    try:
        words = extract_with_pdfplumber(pdf_path)
    except Exception:
        try:
            words = extract_with_pymupdf(pdf_path)
        except Exception:
            print("Failed to import pdfplumber or pymupdf", file=sys.stderr)
            sys.exit(1)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump({"words": words}, f)


if __name__ == "__main__":
    main()
