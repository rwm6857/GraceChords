//
//  StarButton.swift
//  GraceChords Studio
//
//  Favorite toggle for the Viewer header. Hollow muted outline when not starred,
//  filled gold when it is — `GCColor.star` is in the token set for exactly this.
//
//  Port of apps/mobile/src/components/StarButton.tsx, including its optimistic
//  write: the icon flips immediately and reverts if the row does not land. A
//  failure is deliberately silent, as on mobile — a favorite that did not save is
//  not worth an error dialog over a chart the user is trying to play.
//

// Combine is imported explicitly because the target builds with
// SWIFT_UPCOMING_FEATURE_MEMBER_IMPORT_VISIBILITY.
import Combine
import SwiftUI

struct StarButton: View {
    let songID: String
    let services: AppServices

    @StateObject private var model = StarModel()

    var body: some View {
        Button {
            Task { await model.toggle() }
        } label: {
            Image(systemName: model.isStarred ? "star.fill" : "star")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(model.isStarred ? GCColor.star : GCColor.muted)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(model.isStarred ? "Remove from favorites" : "Add to favorites")
        .accessibilityLabel(model.isStarred ? "Remove from favorites" : "Add to favorites")
        .accessibilityAddTraits(model.isStarred ? [.isSelected] : [])
        .task(id: songID) {
            await model.load(songID: songID, repository: StarsRepository(client: services.client))
        }
    }
}

@MainActor
private final class StarModel: ObservableObject {
    @Published private(set) var isStarred = false

    private var songID: String?
    private var repository: StarsRepository?

    func load(songID: String, repository: StarsRepository) async {
        self.songID = songID
        self.repository = repository
        isStarred = (try? await repository.isStarred(songID: songID)) ?? false
    }

    func toggle() async {
        guard let songID = songID, let repository = repository else { return }
        let next = !isStarred
        isStarred = next // optimistic
        do {
            if next {
                try await repository.star(songID: songID)
            } else {
                try await repository.unstar(songID: songID)
            }
        } catch {
            isStarred = !next // revert
        }
    }
}
