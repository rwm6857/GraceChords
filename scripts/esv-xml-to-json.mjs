import fs from 'fs'
import path from 'path'

const SOURCE_XML = path.resolve('ESV.xml')
const OUTPUT_ROOT = path.resolve('public/esv')

async function main(){
  if (!fs.existsSync(SOURCE_XML)){
    console.error('ESV.xml not found at project root. Please place ESV.xml next to package.json.')
    process.exit(1)
  }

  await fs.promises.mkdir(OUTPUT_ROOT, { recursive: true })
  const xml = await fs.promises.readFile(SOURCE_XML, 'latin1')

  const bookRe = /<b n="([^"]+)">([\s\S]*?)<\/b>/g
  const chapterRe = /<c n="([^"]+)">([\s\S]*?)<\/c>/g
  const verseRe = /<v n="([^"]+)">(.*?)<\/v>/g

  let bookMatch
  let chapterCount = 0

  while ((bookMatch = bookRe.exec(xml))){
    const bookName = bookMatch[1]
    const bookBody = bookMatch[2]
    const bookDir = path.join(OUTPUT_ROOT, bookName)
    await fs.promises.mkdir(bookDir, { recursive: true })

    let chapterMatch
    chapterRe.lastIndex = 0
    while ((chapterMatch = chapterRe.exec(bookBody))){
      const chapterNumber = Number(chapterMatch[1])
      const chapterBody = chapterMatch[2]
      const verses = {}

      let verseMatch
      verseRe.lastIndex = 0
      while ((verseMatch = verseRe.exec(chapterBody))){
        const verseNumber = verseMatch[1]
        const text = decodeXml(verseMatch[2]).trim()
        verses[verseNumber] = text
      }

      const payload = {
        book: bookName,
        chapter: chapterNumber,
        verses,
      }
      const outPath = path.join(bookDir, `${chapterNumber}.json`)
      await fs.promises.writeFile(outPath, JSON.stringify(payload, null, 2))
      chapterCount += 1
    }
  }

  console.log(`Wrote ${chapterCount} chapters into ${OUTPUT_ROOT}`)
}

function decodeXml(str){
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
