//
//  PDFImportSheet.swift
//  GraceChords Studio
//
//  The intake step for importing a chord-sheet PDF: drop a file on it, or click to
//  browse. There is deliberately no review step — the result goes straight into the
//  editor, which is where it would be edited anyway, and what the importer was
//  unsure about is reported in the editor's own status banner rather than in a
//  modal the user has to read before they can start typing.
//
//  The one confirmation that IS warranted lives in the editor, not here: replacing a
//  body that already has text in it (see SongEditorView).
//
//  Built on the shape ChordProToolbar's macro sheet established, so the app has one
//  sheet idiom rather than two.
//

import SwiftUI
import UniformTypeIdentifiers

struct PDFImportSheet: View {
    @ObservedObject var model: SongEditorModel

    @State private var isTargeted = false
    @State private var showsFileImporter = false

    var body: some View {
        VStack(alignment: .leading, spacing: GCSpacing.md) {
            Text("Import from PDF").gcTextStyle(.rowTitle).foregroundStyle(GCColor.ink)
            Text("Chord sheets whose text can be selected. Scans and photos of charts cannot be read.")
                .gcTextStyle(.rowMeta)
                .foregroundStyle(GCColor.sec)
                .fixedSize(horizontal: false, vertical: true)

            dropZone

            if let error = model.importError {
                HStack(alignment: .top, spacing: GCSpacing.sm) {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(GCColor.danger)
                    Text(error)
                        .gcTextStyle(.rowMeta)
                        .foregroundStyle(GCColor.ink)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            HStack {
                Spacer()
                Button("Cancel") { model.cancelImport() }
                    .keyboardShortcut(.cancelAction)
                Button("Choose File…") { showsFileImporter = true }
                    .keyboardShortcut(.defaultAction)
                    .disabled(model.isImporting)
            }
        }
        .padding(GCSpacing.lg)
        .frame(width: 420)
        // The panel is what grants sandbox access to the file — the entitlement only
        // says the app MAY read user-selected files, not which ones.
        .fileImporter(isPresented: $showsFileImporter, allowedContentTypes: [.pdf]) { result in
            switch result {
            case .success(let url): model.importPDF(from: url)
            case .failure(let error): model.reportImportFailure(error.localizedDescription)
            }
        }
    }

    @ViewBuilder
    private var dropZone: some View {
        VStack(spacing: GCSpacing.sm) {
            if model.isImporting {
                ProgressView()
                Text(model.importingFilename ?? "Reading…")
                    .gcTextStyle(.rowMeta)
                    .foregroundStyle(GCColor.sec)
                    .lineLimit(1)
                    .truncationMode(.middle)
            } else {
                Image(systemName: "arrow.down.document")
                    .font(.system(size: 28, weight: .light))
                    .foregroundStyle(isTargeted ? GCColor.accent : GCColor.muted)
                Text("Drop a PDF here")
                    .gcTextStyle(.rowMeta)
                    .foregroundStyle(isTargeted ? GCColor.accent : GCColor.sec)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 116)
        .background(GCColor.bg, in: RoundedRectangle(cornerRadius: GCRadius.sm))
        .overlay {
            RoundedRectangle(cornerRadius: GCRadius.sm)
                .strokeBorder(
                    isTargeted ? GCColor.accent : GCColor.border,
                    style: StrokeStyle(lineWidth: isTargeted ? 2 : 1, dash: [6, 4])
                )
        }
        // `onDrop` with an item provider rather than `dropDestination(for: URL.self)`.
        //
        // A bare file URL off the dragging pasteboard carries NO sandbox grant, so
        // opening it fails with "you don't have permission to view it" even though the
        // app is entitled to read user-selected files — the entitlement needs the
        // system to vouch for the specific file, and only the file picker or an item
        // provider does that. `loadFileRepresentation` hands back a temporary copy this
        // process may read, valid just inside the closure, so the bytes are taken there
        // and the URL is never used again.
        .onDrop(of: [.pdf], isTargeted: $isTargeted) { providers, _ in
            // Only the first: importing several PDFs at once would mean several songs,
            // which is a different feature with a different UI.
            guard let provider = providers.first else { return false }
            let name = provider.suggestedName ?? "the dropped file"

            provider.loadFileRepresentation(forTypeIdentifier: UTType.pdf.identifier) { url, error in
                let outcome: Result<Data, Error> = {
                    if let url { return Result { try Data(contentsOf: url) } }
                    return .failure(error ?? PDFImportError.unreadable(reason: "the drop could not be read"))
                }()
                Task { @MainActor in
                    switch outcome {
                    case .success(let data):
                        model.importPDF(data: data, filename: name)
                    case .failure(let error):
                        model.reportImportFailure(
                            (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
                        )
                    }
                }
            }
            return true
        }
        .animation(.easeOut(duration: 0.12), value: isTargeted)
    }
}
