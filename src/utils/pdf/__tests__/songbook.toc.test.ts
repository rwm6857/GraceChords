// @ts-nocheck
import { describe, it, expect, vi } from "vitest";

const addPage = vi.fn();

vi.mock("jspdf", () => {
  const FakeDoc = function () {};
  FakeDoc.prototype.addPage = addPage;
  FakeDoc.prototype.setFontSize = () => {};
  FakeDoc.prototype.text = () => {};
  FakeDoc.prototype.setFont = () => {};
  FakeDoc.prototype.addImage = () => {};
  FakeDoc.prototype.output = () => new Blob();
  return { default: FakeDoc };
});

describe("songbook TOC handling", () => {
  it("adds an extra page when includeTOC is true", async () => {
    const pdf2 = await import("../../pdf2/index.js");
    const { downloadSongbookPdf } = await import("../index.js");

    const planSpy = vi
      .spyOn(pdf2, "planSong")
      .mockResolvedValue({ plan: { pages: [{}] }, fontPt: 12 });
    const renderSpy = vi
      .spyOn(pdf2, "renderSongIntoDoc")
      .mockResolvedValue();

    global.URL.createObjectURL = vi.fn(() => "blob:");
    global.URL.revokeObjectURL = vi.fn();

    const song = { title: "Test", lyricsBlocks: [] };

    await downloadSongbookPdf([song], { includeTOC: true });
    const withTOC = addPage.mock.calls.length;

    addPage.mockClear();
    await downloadSongbookPdf([song], { includeTOC: false });
    const withoutTOC = addPage.mock.calls.length;

    expect(withTOC).toBe(withoutTOC + 1);

    planSpy.mockRestore();
    renderSpy.mockRestore();
  });
});

