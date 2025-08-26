PDF Engine Functionality
GraceChords is a website for storing my catalog of Christian music in the form of leadsheets. On top of showing the songs through SongView (currently working as intended), there are various PDF & JPG exporting functions. These should produce leadsheets that are highly legible, useful, and convenient.
Overview of PDF Engine Functionality: The core function of the engine is to take any .chordpro file and covert/export it to a formatted lead/chord sheet according to hard constraints.

Priorities & Constraints:
1. Every page has a Song Title header and "Key of:___" subtitle
2. Every song should prioritize fitting on one page. Only in absolute worst case should spilling to a second page be considered.
3. Sections are denoted as "Verse, Chorus, Verse 1, Bridge, Tag, Intro, etc..." Section headers and their lines of lyrics should not be split up -- neither across columns nor across pages.
4. Section headers may be shown in standard ChordPro notation/directives, or may be displayed simpler as in the Glorious King example below
5. First priority is single page printing, second priority is largest possible text size; text size can range between 11pt and 15pt.
6. Third priority should be using single-column, but text may spill into a second column if necessary (not breaking sections).
7. Noto sans family should be used. Title bolded, key subtitle italic, section headers bold regular, lyrics regular, chords mono bolded
8. Chords will always appear on their own line above the lyrics. Chords will be the same size as the lyrics. Chord positioning is absolute: the character the [CHORD] precedes in the .chordpro file, is the character it should appear above. However, chords should NOT overlap: if two chords will overlap, the two chords should both be nudged a few points left/right so that at least one character space is between them.

Notes:
-Title & Subtitle font never change size. Let's try 20 for title, and 15 for subtitle.
-Page margins can be narrow (maybe 0.5 inch on all sides)
-Files using two column plan should used even, fixed-size columns (as wide as possible while respecting margins and having some pad between margins. For exceptionally long lines in two-column plan, wrapping the line is possible) Column width doesn't need to be calculated each time.

Example of expected behavior
```
// .chordpro file example (glorious\_king.chordpro)
{title: Glorious King}
{key: A}
{authors: }
{country: Egypt}
{tags: Slow, Worship, Nations}
{youtube: }
{mp3: }
{pptx: }

Verse
[A]Glorious King, [D]Lord and our [A]Savior
[Bm7]We bless you [A/C#]now and for[E7]evermore
[A]For you, Lord are rising, [D]above every [A]other
For [Bm7]you alone have all power[D/A] and the [G]might [E7]


Chorus
[A]Jesus, you are the [A/C#]Lamb who reigns on [D]high
[Bm7]Jesus, we lift your [B/D#]name above all [E7]other names
[A]All glory, honor, [A/C#]praise are yours, oh [D]God
We bless your [Bm7]name, the [E7]name of [A]Jesus


// expected PDF export behavior
Glorious King
Key of A

[VERSE]
A              D            A
Glorious King, Lord and our Savior
Bm7         A/C#        E7
We bless you now and forevermore
A                         D           A
For you, Lord are rising, above every other
Bm7                 D/A          G     E7
For you alone have all power and the might

[CHORUS]
A                  A/C#               D
Jesus, you are the Lamb who reigns on high
Bm7                 Bm7            E7
Jesus, we lift your name above all other names
A                 A/C#                 D
All glory, honor, praise are yours, oh God
A/C#          Bm7       E7      A
We bless your name, the name of Jesus

```

Song Cases & Decision Making Ladder:
Note: "Short lines" are considered lyrical lines that fit in a column with no size reduction needed. "Long lines" are lyrical lines that might need some size reduction. "Short song" is a song that can fit within a single column. "Long song" is a song that generally needs a second column in order to fit on a single page.
Case 1 - Short Lines/Short Song
- Will print on one page
- Should print in one column
- Should need no/minimal font size reduction
- Simplest case

Case 2 - Long Lines/Short Song
- Will print on one page
- Should print in one column
- Likely needs font size reduction

Case 3 - Short Lines/Long Song
- Will print on one page
- Likely needs two columns
- Should need minimal font size reduction

Case 4 - Long Lines/Long Song
- Will print on one page
- Should print in two columns
- Likely needs font size reduction

Case 5 - VERY Long Lines and/or VERY Long Song
- Will try to print on one page, may need to spill to the next
- If on two pages, should print one column
- If on two pages, should have minimal font size reduction
- Last case; should be very rare and avoided if possible

Basic Plane Decision Ladder (Please clarify & improve logic)
1.	Can all sections fit on page without font size reduction?
2.	Reduce font size one point at a time, stop when fits in 1 col.
3.	If 11pt does not fit in 1 col., attempt 2 col plan at 15pt
4.	Reduce by 1pt until all lines fit (break outlier long lines if needed)
5.	Worst case, if all else fails, fallback on 15pt single column plan across 2 pages. Title/subtitle should only print on FIRST page

Other Websites/Repos with similar functionality & documentation:
https://www.chordpro.org/chordpro/chordpro-configuration-pdf
https://www.chordpro.org/chordpro/chordpro-directives
https://chords.menees.com
https://github.com/menees/Chords
