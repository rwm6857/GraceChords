import fs from 'fs'
import path from 'path'
import { runBibleXmlImport } from './bible-xml-to-json.mjs'

const XML_DIR = 'BIBLE_XML'
const DISALLOWED_ARGS = new Set(['--xml', '--id', '--lang', '--language', '--label', '--name', '--no-clean'])

async function main(){
  const args = process.argv.slice(2)
  assertAllowedArgs(args)

  const files = listXmlFiles(XML_DIR)
  if (!files.length) {
    throw new Error(`No XML files found in ${path.resolve(XML_DIR)}`)
  }

  for (const file of files) {
    console.log(`\n=== Importing ${file} ===`)
    await runBibleXmlImport({ xml: file }, args)
  }

  console.log(`\nImported ${files.length} translation XML file(s) from ${XML_DIR}.`)
}

function listXmlFiles(dir){
  if (!fs.existsSync(dir)) {
    throw new Error(`XML directory not found: ${path.resolve(dir)}`)
  }
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.xml$/i.test(entry.name))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

function assertAllowedArgs(args){
  for (let i = 0; i < args.length; i += 1) {
    const token = String(args[i] || '').trim()
    if (!token.startsWith('--')) continue
    const [key] = token.split('=')
    if (DISALLOWED_ARGS.has(key)) {
      throw new Error(
        `build:bibles does not accept ${key}. It derives id/lang/label/name from XML headers and always overwrites existing translation output. Use "npm run build:bible -- --xml <file>" for single-file overrides.`
      )
    }
  }
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
