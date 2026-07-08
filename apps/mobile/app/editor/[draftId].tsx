import SongEditorScreen from '../../src/screens/SongEditorScreen'

// Song editor route, pushed over the tab shell like viewer/[slug]. The screen
// reads the draftId param itself and seeds from the local drafts store.
export default function SongEditorRoute() {
  return <SongEditorScreen />
}
