import React from 'react'
export const SettingsContext = React.createContext({
  settings: {
    lyricFontFamily: 'Arial',
    chordFontFamily: 'Courier New',
    lyricFontSizePt: 16,
    chordFontSizePt: 16,
    columns: 'auto',
  },
  setSettings: ()=>{}
})
