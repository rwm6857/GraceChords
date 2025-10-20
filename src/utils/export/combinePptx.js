const PPT_SLIDE_CT = 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'
const PPT_NOTES_CT = 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml'
const PRESENTATION_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const OFFICE_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

const parser = new DOMParser()
const serializer = new XMLSerializer()

function sanitizeFilename(input) {
  const fallback = 'setlist'
  if (!input) return fallback
  const trimmed = String(input).trim()
  if (!trimmed) return fallback
  const safe = trimmed
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return safe || fallback
}

async function fetchArrayBuffer(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load PPTX: ${url}`)
  return res.arrayBuffer()
}

function parseXml(xml) {
  const doc = parser.parseFromString(xml, 'application/xml')
  const parseError = doc.getElementsByTagName('parsererror')[0]
  if (parseError) {
    throw new Error(parseError.textContent || 'Failed to parse XML')
  }
  return doc
}

function serializeXml(doc) {
  return serializer.serializeToString(doc)
}

function getNumericSuffix(value) {
  const match = String(value || '').match(/(\d+)$/)
  return match ? Number(match[1]) : 0
}

function findMaxNumber(zip, regex) {
  let max = 0
  zip.filter((path) => regex.test(path)).forEach((file) => {
    const match = file.name.match(regex)
    if (!match) return
    const num = Number(match[1])
    if (!Number.isNaN(num)) max = Math.max(max, num)
  })
  return max
}

function ensureContentOverride(doc, partName, contentType) {
  const overrides = Array.from(doc.getElementsByTagName('Override'))
  if (overrides.some((node) => node.getAttribute('PartName') === partName)) return
  const override = doc.createElement('Override')
  override.setAttribute('PartName', partName)
  override.setAttribute('ContentType', contentType)
  doc.documentElement.appendChild(override)
}

function resolveTargetPath(ownerPath, target) {
  if (!target) return null
  if (target.startsWith('/')) return target.slice(1)
  const ownerParts = ownerPath.split('/')
  ownerParts.pop()
  const targetSegments = target.split('/')
  for (const segment of targetSegments) {
    if (segment === '..') ownerParts.pop()
    else if (segment === '.') continue
    else ownerParts.push(segment)
  }
  return ownerParts.join('/')
}

function getRelativePath(fromPath, toPath) {
  const fromParts = fromPath.split('/')
  fromParts.pop()
  const toParts = toPath.split('/')
  let i = 0
  while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) {
    i++
  }
  const upMoves = fromParts.length - i
  const parts = []
  for (let j = 0; j < upMoves; j++) parts.push('..')
  parts.push(...toParts.slice(i))
  return parts.join('/')
}

function parseNumberedPath(path) {
  const match = path.match(/^(.*\/)([^/]*?)(\d+)(\.[^.]+)$/)
  if (!match) return null
  return {
    dir: match[1],
    prefix: match[2],
    number: Number(match[3]),
    ext: match[4],
  }
}

function ensureCounter(store, key, value) {
  const current = Number(store[key] || 0)
  if (value > current) {
    store[key] = value
  }
}

function allocateNumber(store, key) {
  const current = Number(store[key] || 0)
  const next = current + 1
  store[key] = next
  return next
}

async function prepareContext(zip) {
  const presentationXmlPath = 'ppt/presentation.xml'
  const presentationXml = await zip.file(presentationXmlPath).async('string')
  const presentationDoc = parseXml(presentationXml)

  const sldIdList =
    presentationDoc.getElementsByTagNameNS(PRESENTATION_NS, 'sldIdLst')[0] ||
    presentationDoc.getElementsByTagName('p:sldIdLst')[0]

  const slideIdNodes = sldIdList
    ? Array.from(sldIdList.getElementsByTagNameNS(PRESENTATION_NS, 'sldId')).concat(
        Array.from(sldIdList.getElementsByTagName('p:sldId'))
      )
    : []
  const maxSlideId = slideIdNodes.reduce((max, node) => {
    const id = Number(node.getAttribute('id'))
    return Number.isNaN(id) ? max : Math.max(max, id)
  }, 255)

  const presentationRelsPath = 'ppt/_rels/presentation.xml.rels'
  const presentationRelsXml = await zip.file(presentationRelsPath).async('string')
  const presentationRelsDoc = parseXml(presentationRelsXml)
  const relationshipNodes = Array.from(presentationRelsDoc.getElementsByTagName('Relationship'))
  const maxRelId = relationshipNodes.reduce((max, node) => {
    const num = getNumericSuffix(node.getAttribute('Id'))
    return Math.max(max, num)
  }, 0)

  const contentTypesPath = '[Content_Types].xml'
  const contentTypesXml = await zip.file(contentTypesPath).async('string')
  const contentTypesDoc = parseXml(contentTypesXml)

  const counters = {}
  zip.filter(() => true).forEach((file) => {
    const info = parseNumberedPath(file.name)
    if (!info) return
    const key = `${info.dir}${info.prefix}`
    ensureCounter(counters, key, info.number)
  })

  ensureCounter(counters, 'ppt/slides/slide', findMaxNumber(zip, /^ppt\/slides\/slide(\d+)\.xml$/))
  ensureCounter(counters, 'ppt/notesSlides/notesSlide', findMaxNumber(zip, /^ppt\/notesSlides\/notesSlide(\d+)\.xml$/))
  ensureCounter(counters, 'ppt/media/image', findMaxNumber(zip, /^ppt\/media\/image(\d+)\.[^.]+$/))

  return {
    zip,
    presentationXmlPath,
    presentationDoc,
    sldIdList,
    presentationRelsPath,
    presentationRelsDoc,
    contentTypesPath,
    contentTypesDoc,
    nextSlideId: maxSlideId,
    nextRelId: maxRelId,
    counters,
  }
}

function createSlideRelationship(context, slideIndex, relId) {
  const relationshipsEl = context.presentationRelsDoc.documentElement
  const rel = context.presentationRelsDoc.createElement('Relationship')
  rel.setAttribute('Id', relId)
  rel.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide')
  rel.setAttribute('Target', `slides/slide${slideIndex}.xml`)
  relationshipsEl.appendChild(rel)
}

function appendSlideId(context, relId) {
  const doc = context.presentationDoc
  const list =
    context.sldIdList ||
    (() => {
      const node = doc.createElementNS(PRESENTATION_NS, 'p:sldIdLst')
      doc.documentElement.appendChild(node)
      context.sldIdList = node
      return node
    })()
  const node = doc.createElementNS(PRESENTATION_NS, 'p:sldId')
  context.nextSlideId += 1
  node.setAttribute('id', String(context.nextSlideId))
  node.setAttributeNS(OFFICE_REL_NS, 'r:id', relId)
  list.appendChild(node)
}

async function copyBinary(zip, srcZip, originalPath, newPath) {
  const data = await srcZip.file(originalPath).async('uint8array')
  zip.file(newPath, data)
}

async function copyXml(zip, srcZip, originalPath, newPath) {
  const xml = await srcZip.file(originalPath).async('string')
  zip.file(newPath, xml)
}

async function copyNotesPart(context, srcZip, originalPath, newSlidePath, mapping) {
  const info = parseNumberedPath(originalPath)
  if (!info) return null
  const key = `${info.dir}${info.prefix}`
  const newNumber = allocateNumber(context.counters, key)
  const newPath = `${info.dir}${info.prefix}${newNumber}${info.ext}`
  await copyXml(context.zip, srcZip, originalPath, newPath)
  ensureContentOverride(context.contentTypesDoc, `/${newPath}`, PPT_NOTES_CT)

  const originalRelsPath = `${info.dir}_rels/${info.prefix}${info.number}${info.ext}.rels`
  const relFile = srcZip.file(originalRelsPath)[0]
  if (relFile) {
    const relXml = await relFile.async('string')
    const relDoc = parseXml(relXml)
    const relNodes = Array.from(relDoc.getElementsByTagName('Relationship'))
    const newSlideRelative = getRelativePath(newPath, newSlidePath)
    relNodes.forEach((node) => {
      const type = node.getAttribute('Type') || ''
      if (type.endsWith('/slide')) {
        node.setAttribute('Target', newSlideRelative)
      }
    })
    const newRelsPath = `${info.dir}_rels/${info.prefix}${newNumber}${info.ext}.rels`
    context.zip.file(newRelsPath, serializeXml(relDoc))
  }

  mapping.set(originalPath, newPath)
  return newPath
}

async function processSlideRelationships(context, srcZip, sourceContentTypesDoc, slideInfo, newSlidePath, mapping) {
  const originalPath = slideInfo.path
  const originalNumber = slideInfo.number
  const relPath = `ppt/slides/_rels/slide${originalNumber}.xml.rels`
  const relEntry = srcZip.file(relPath)[0]
  if (!relEntry) return

  const relXml = await relEntry.async('string')
  const relDoc = parseXml(relXml)
  const relNodes = Array.from(relDoc.getElementsByTagName('Relationship'))
  const ownerPath = newSlidePath

  for (const node of relNodes) {
    const type = node.getAttribute('Type') || ''
    const target = node.getAttribute('Target') || ''
    if (!target) continue

    if (type.endsWith('/notesSlide')) {
      const absolute = resolveTargetPath(originalPath, target)
      if (!absolute) continue
      const mapped = mapping.get(absolute)
      const notePath =
        mapped ||
        (await copyNotesPart(context, srcZip, absolute, newSlidePath, mapping))
      if (!notePath) continue
      const relative = getRelativePath(ownerPath, notePath)
      node.setAttribute('Target', relative)
    } else if (type.includes('/image') || type.includes('/video') || type.includes('/audio')) {
      const absolute = resolveTargetPath(originalPath, target)
      if (!absolute) continue
      const mapped =
        mapping.get(absolute) ||
        (await copyMediaPart(context, srcZip, sourceContentTypesDoc, absolute, mapping))
      if (!mapped) continue
      const relative = getRelativePath(ownerPath, mapped)
      node.setAttribute('Target', relative)
    } else {
      const absolute = resolveTargetPath(originalPath, target)
      if (!absolute) continue
      if (absolute.startsWith('ppt/slideLayouts') || absolute.startsWith('ppt/slideMasters')) {
        continue
      }
      if (!srcZip.file(absolute)[0]) continue
      const mapped =
        mapping.get(absolute) ||
        (await copyXmlPart(context, srcZip, sourceContentTypesDoc, absolute, mapping))
      if (!mapped) continue
      const relative = getRelativePath(ownerPath, mapped)
      node.setAttribute('Target', relative)
    }
  }

  const newRelPath = `ppt/slides/_rels/${newSlidePath.split('/').pop()}.rels`
  context.zip.file(newRelPath, serializeXml(relDoc))
}

function getOverrideContentType(doc, partName) {
  if (!doc) return null
  const nodes = Array.from(doc.getElementsByTagName('Override'))
  const match = nodes.find((node) => node.getAttribute('PartName') === partName)
  return match ? match.getAttribute('ContentType') || null : null
}

function ensureDefaultContentType(targetDoc, sourceDoc, extension) {
  if (!extension) return
  const existing = Array.from(targetDoc.getElementsByTagName('Default')).some(
    (node) => node.getAttribute('Extension') === extension
  )
  if (existing) return
  const sourceNode = Array.from(sourceDoc?.getElementsByTagName?.('Default') || []).find(
    (node) => node.getAttribute('Extension') === extension
  )
  if (!sourceNode) return
  const clone = targetDoc.createElement('Default')
  clone.setAttribute('Extension', extension)
  clone.setAttribute('ContentType', sourceNode.getAttribute('ContentType') || '')
  targetDoc.documentElement.appendChild(clone)
}

async function copyXmlPart(context, srcZip, sourceContentTypesDoc, originalPath, mapping) {
  const info = parseNumberedPath(originalPath)
  if (!info) {
    if (!context.zip.file(originalPath)[0]) {
      const xml = await srcZip.file(originalPath).async('string')
      context.zip.file(originalPath, xml)
      const ct = getOverrideContentType(sourceContentTypesDoc, `/${originalPath}`)
      if (ct) ensureContentOverride(context.contentTypesDoc, `/${originalPath}`, ct)
    }
    mapping.set(originalPath, originalPath)
    return originalPath
  }
  const key = `${info.dir}${info.prefix}`
  const newNumber = allocateNumber(context.counters, key)
  const newPath = `${info.dir}${info.prefix}${newNumber}${info.ext}`
  await copyXml(context.zip, srcZip, originalPath, newPath)
  const ct = getOverrideContentType(sourceContentTypesDoc, `/${originalPath}`)
  if (ct) ensureContentOverride(context.contentTypesDoc, `/${newPath}`, ct)
  mapping.set(originalPath, newPath)
  return newPath
}

async function copyMediaPart(context, srcZip, sourceContentTypesDoc, originalPath, mapping) {
  const info = parseNumberedPath(originalPath)
  if (!info) return null
  const key = `${info.dir}${info.prefix}`
  const newNumber = allocateNumber(context.counters, key)
  const newPath = `${info.dir}${info.prefix}${newNumber}${info.ext}`
  await copyBinary(context.zip, srcZip, originalPath, newPath)
  const ext = info.ext.startsWith('.') ? info.ext.slice(1) : ''
  ensureDefaultContentType(context.contentTypesDoc, sourceContentTypesDoc, ext)
  mapping.set(originalPath, newPath)
  return newPath
}

async function appendSlides(context, srcZip) {
  const slides = srcZip
    .file(/^ppt\/slides\/slide\d+\.xml$/)
    .sort((a, b) => {
      const aNum = getNumericSuffix(a.name)
      const bNum = getNumericSuffix(b.name)
      return aNum - bNum
    })

  if (!slides.length) return

  const sourceContentTypesXml = await srcZip.file('[Content_Types].xml').async('string')
  const sourceContentTypesDoc = parseXml(sourceContentTypesXml)

  for (let i = 0; i < slides.length; i++) {
    const slideEntry = slides[i]
    const number = getNumericSuffix(slideEntry.name)
    const newSlideNumber = allocateNumber(context.counters, 'ppt/slides/slide')
    const newSlidePath = `ppt/slides/slide${newSlideNumber}.xml`
    const xml = await slideEntry.async('string')
    context.zip.file(newSlidePath, xml)

    ensureContentOverride(context.contentTypesDoc, `/${newSlidePath}`, PPT_SLIDE_CT)

    context.nextRelId += 1
    const relId = `rId${context.nextRelId}`
    createSlideRelationship(context, newSlideNumber, relId)
    appendSlideId(context, relId)

    const mapping = new Map()
    mapping.set(slideEntry.name, newSlidePath)
    await processSlideRelationships(
      context,
      srcZip,
      sourceContentTypesDoc,
      { path: slideEntry.name, number },
      newSlidePath,
      mapping
    )
  }
}

function persistXml(context) {
  context.zip.file(context.presentationXmlPath, serializeXml(context.presentationDoc))
  context.zip.file(context.presentationRelsPath, serializeXml(context.presentationRelsDoc))
  context.zip.file(context.contentTypesPath, serializeXml(context.contentTypesDoc))
}

function saveBlob(blob, filename) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.rel = 'noopener'
  link.click()
  URL.revokeObjectURL(link.href)
}

export async function combinePptxFiles(songFileUrls = [], setlistName = 'Setlist') {
  if (!Array.isArray(songFileUrls) || songFileUrls.length === 0) {
    throw new Error('No PPTX files to merge')
  }
  const JSZip = (await import('jszip')).default
  const [first, ...rest] = songFileUrls
  const baseBuffer = await fetchArrayBuffer(first)
  const baseZip = await JSZip.loadAsync(baseBuffer)
  const context = await prepareContext(baseZip)

  for (let i = 0; i < rest.length; i++) {
    const buffer = await fetchArrayBuffer(rest[i])
    const srcZip = await JSZip.loadAsync(buffer)
    await appendSlides(context, srcZip)
  }

  persistXml(context)
  const blob = await baseZip.generateAsync({ type: 'blob' })
  const safeName = sanitizeFilename(setlistName || 'Setlist')

  saveBlob(blob, `${safeName}.pptx`)
}
