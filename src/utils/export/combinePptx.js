const PPT_SLIDE_CT = 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'
const PPT_NOTES_CT = 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml'
const PPT_SLIDE_MASTER_CT = 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml'
const PPT_SLIDE_LAYOUT_CT = 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml'
const PPT_THEME_CT = 'application/vnd.openxmlformats-officedocument.theme+xml'
const PRESENTATION_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const OFFICE_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PPT_NOTES_MASTER_CT = 'application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml'

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

function getZipEntry(zip, selector) {
  if (!zip) return null
  const result = zip.file(selector)
  if (Array.isArray(result)) return result.length ? result[0] : null
  return result || null
}

function getRelationshipsPath(partPath) {
  const lastSlash = partPath.lastIndexOf('/')
  const dir = lastSlash >= 0 ? partPath.slice(0, lastSlash + 1) : ''
  const file = lastSlash >= 0 ? partPath.slice(lastSlash + 1) : partPath
  return `${dir}_rels/${file}.rels`
}

function getContentTypeInfo(doc, partPath) {
  if (!doc || !partPath) return { contentType: '', fromOverride: false, extension: '' }
  const partName = `/${partPath}`
  const overrides = Array.from(doc.getElementsByTagName('Override'))
  const overrideNode = overrides.find((node) => node.getAttribute('PartName') === partName)
  if (overrideNode) {
    return {
      contentType: overrideNode.getAttribute('ContentType') || '',
      fromOverride: true,
      extension: partPath.split('.').pop() || '',
    }
  }
  const defaults = Array.from(doc.getElementsByTagName('Default'))
  const extension = partPath.split('.').pop() || ''
  const defaultNode = defaults.find((node) => node.getAttribute('Extension') === extension)
  if (defaultNode) {
    return {
      contentType: defaultNode.getAttribute('ContentType') || '',
      fromOverride: false,
      extension,
    }
  }
  return { contentType: '', fromOverride: false, extension }
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

function isBinaryContentType(contentType) {
  if (!contentType) return false
  return !/xml|text|application\/(.*\+xml)/i.test(contentType)
}

function makeNumberedTargetFactory(sample) {
  const regex = /(.*\D)(\d+)(\.\w+)$/
  const match = sample && sample.match(regex)
  if (match) {
    const [, prefix, , suffix] = match
    return (n) => `${prefix}${n}${suffix}`
  }
  return (n) => `slides/slide${n}.xml`
}

async function prepareContext(zip) {
  const presentationXmlPath = 'ppt/presentation.xml'
  const presentationEntry = getZipEntry(zip, presentationXmlPath)
  if (!presentationEntry) throw new Error('Base PPTX missing ppt/presentation.xml')
  const presentationXml = await presentationEntry.async('string')
  const presentationDoc = parseXml(presentationXml)

  const sldIdList =
    presentationDoc.getElementsByTagNameNS(PRESENTATION_NS, 'sldIdLst')[0] ||
    presentationDoc.getElementsByTagName('p:sldIdLst')[0]

  const slideIdNodes = sldIdList
    ? Array.from(
        sldIdList.getElementsByTagNameNS(PRESENTATION_NS, 'sldId')
      ).concat(Array.from(sldIdList.getElementsByTagName('p:sldId')))
    : []
  const maxSlideId = slideIdNodes.reduce((max, node) => {
    const id = Number(node.getAttribute('id'))
    return Number.isNaN(id) ? max : Math.max(max, id)
  }, 255)

  const presentationRelsPath = 'ppt/_rels/presentation.xml.rels'
  const presentationRelsEntry = getZipEntry(zip, presentationRelsPath)
  if (!presentationRelsEntry) throw new Error('Base PPTX missing ppt/_rels/presentation.xml.rels')
  const presentationRelsXml = await presentationRelsEntry.async('string')
  const presentationRelsDoc = parseXml(presentationRelsXml)
  const relationshipNodes = Array.from(presentationRelsDoc.getElementsByTagName('Relationship'))
  const maxRelId = relationshipNodes.reduce((max, node) => {
    const num = getNumericSuffix(node.getAttribute('Id'))
    return Math.max(max, num)
  }, 0)

  const slideRelationshipNodes = relationshipNodes.filter((node) => {
    const type = node.getAttribute('Type') || ''
    return type.endsWith('/slide')
  })
  const slideTargetSample = slideRelationshipNodes.length
    ? slideRelationshipNodes[0].getAttribute('Target') || ''
    : ''
  const getSlideTarget = makeNumberedTargetFactory(slideTargetSample)

  const masterList =
    presentationDoc.getElementsByTagNameNS(PRESENTATION_NS, 'sldMasterIdLst')[0] ||
    presentationDoc.getElementsByTagName('p:sldMasterIdLst')[0] ||
    null
  const masterIdNodes = masterList
    ? Array.from(
        masterList.getElementsByTagNameNS(PRESENTATION_NS, 'sldMasterId')
      ).concat(Array.from(masterList.getElementsByTagName('p:sldMasterId')))
    : []
  const maxMasterId = masterIdNodes.reduce((max, node) => {
    const id = Number(node.getAttribute('id'))
    return Number.isNaN(id) ? max : Math.max(max, id)
  }, 2147483647)

  const notesMasterList =
    presentationDoc.getElementsByTagNameNS(PRESENTATION_NS, 'notesMasterIdLst')[0] ||
    presentationDoc.getElementsByTagName('p:notesMasterIdLst')[0] ||
    null

  let defaultNotesMasterPath = null
  const notesMasterRel = relationshipNodes.find((node) => {
    const type = node.getAttribute('Type') || ''
    return type.endsWith('/notesMaster')
  })
  if (notesMasterRel) {
    const target = notesMasterRel.getAttribute('Target') || ''
    defaultNotesMasterPath = resolveTargetPath('ppt/presentation.xml', target)
  }

  let defaultThemePath = null
  const themeRel = relationshipNodes.find((node) => {
    const type = node.getAttribute('Type') || ''
    return type.endsWith('/theme')
  })
  if (themeRel) {
    const target = themeRel.getAttribute('Target') || ''
    defaultThemePath = resolveTargetPath('ppt/presentation.xml', target)
  }

  const contentTypesPath = '[Content_Types].xml'
  const contentTypesEntry = getZipEntry(zip, contentTypesPath)
  if (!contentTypesEntry) throw new Error('Base PPTX missing [Content_Types].xml')
  const contentTypesXml = await contentTypesEntry.async('string')
  const contentTypesDoc = parseXml(contentTypesXml)

  const counters = {}
  zip.filter(() => true).forEach((file) => {
    const info = parseNumberedPath(file.name)
    if (!info) return
    const key = `${info.dir}${info.prefix}`
    ensureCounter(counters, key, info.number)
  })

  ensureCounter(counters, 'ppt/slides/slide', findMaxNumber(zip, /^ppt\/slides\/slide(\d+)\.xml$/))
  ensureCounter(
    counters,
    'ppt/notesSlides/notesSlide',
    findMaxNumber(zip, /^ppt\/notesSlides\/notesSlide(\d+)\.xml$/)
  )
  ensureCounter(
    counters,
    'ppt/slideMasters/slideMaster',
    findMaxNumber(zip, /^ppt\/slideMasters\/slideMaster(\d+)\.xml$/)
  )
  ensureCounter(
    counters,
    'ppt/slideLayouts/slideLayout',
    findMaxNumber(zip, /^ppt\/slideLayouts\/slideLayout(\d+)\.xml$/)
  )
  ensureCounter(counters, 'ppt/theme/theme', findMaxNumber(zip, /^ppt\/theme\/theme(\d+)\.xml$/))
  ensureCounter(
    counters,
    'ppt/notesMasters/notesMaster',
    findMaxNumber(zip, /^ppt\/notesMasters\/notesMaster(\d+)\.xml$/)
  )
  ensureCounter(
    counters,
    'ppt/media/image',
    findMaxNumber(zip, /^ppt\/media\/image(\d+)\.[^.]+$/)
  )

  const slideEntries = zip
    .file(/^ppt\/slides\/slide\d+\.xml$/)
    .sort((a, b) => getNumericSuffix(a.name) - getNumericSuffix(b.name))

  let defaultLayoutTarget = ''
  let defaultLayoutPath = ''
  let defaultMasterPath = ''

  if (slideEntries.length) {
    const firstSlide = slideEntries[0]
    const slideRelEntry = getZipEntry(zip, getRelationshipsPath(firstSlide.name))
    if (slideRelEntry) {
      const slideRelDoc = parseXml(await slideRelEntry.async('string'))
      const relNodes = Array.from(slideRelDoc.getElementsByTagName('Relationship'))
      const layoutRel = relNodes.find((node) => {
        const type = node.getAttribute('Type') || ''
        return type.endsWith('/slideLayout')
      })
      if (layoutRel) {
        defaultLayoutTarget = layoutRel.getAttribute('Target') || ''
        const resolved = resolveTargetPath(firstSlide.name, defaultLayoutTarget)
        if (resolved && getZipEntry(zip, resolved)) {
          defaultLayoutPath = resolved
        }
      }
    }
  }

  if (!defaultLayoutPath) {
    const layoutEntries = zip
      .file(/^ppt\/slideLayouts\/.*\.xml$/)
      .sort((a, b) => getNumericSuffix(a.name) - getNumericSuffix(b.name))
    if (layoutEntries.length) {
      defaultLayoutPath = layoutEntries[0].name
      defaultLayoutTarget = slideEntries.length
        ? getRelativePath(slideEntries[0].name, defaultLayoutPath)
        : '../slideLayouts/slideLayout1.xml'
    }
  } else if (!defaultLayoutTarget && slideEntries.length) {
    defaultLayoutTarget = getRelativePath(slideEntries[0].name, defaultLayoutPath)
  }

  if (defaultLayoutPath) {
    const layoutRelEntry = getZipEntry(zip, getRelationshipsPath(defaultLayoutPath))
    if (layoutRelEntry) {
      const layoutRelDoc = parseXml(await layoutRelEntry.async('string'))
      const layoutRelNodes = Array.from(layoutRelDoc.getElementsByTagName('Relationship'))
      const masterRel = layoutRelNodes.find((node) => {
        const type = node.getAttribute('Type') || ''
        return type.endsWith('/slideMaster')
      })
      if (masterRel) {
        const target = masterRel.getAttribute('Target') || ''
        const resolved = resolveTargetPath(defaultLayoutPath, target)
        if (resolved && getZipEntry(zip, resolved)) {
          defaultMasterPath = resolved
        }
      }
    }
  }

  if (!defaultMasterPath) {
    const masterEntries = zip
      .file(/^ppt\/slideMasters\/.*\.xml$/)
      .sort((a, b) => getNumericSuffix(a.name) - getNumericSuffix(b.name))
    if (masterEntries.length) {
      defaultMasterPath = masterEntries[0].name
    }
  }

  if (!defaultNotesMasterPath) {
    const notesMasterEntries = zip
      .file(/^ppt\/notesMasters\/.*\.xml$/)
      .sort((a, b) => getNumericSuffix(a.name) - getNumericSuffix(b.name))
    if (notesMasterEntries.length) {
      defaultNotesMasterPath = notesMasterEntries[0].name
    }
  }

  return {
    zip,
    presentationXmlPath,
    presentationDoc,
    sldIdList,
    sldMasterList: masterList,
    notesMasterList,
    presentationRelsPath,
    presentationRelsDoc,
    contentTypesPath,
    contentTypesDoc,
    nextSlideId: maxSlideId,
    nextRelId: maxRelId,
    nextMasterId: maxMasterId,
    counters,
    partMap: new Map(),
    masterRelMap: new Map(),
    notesMasterRelMap: new Map(),
    getSlideTarget,
    defaultLayoutTarget,
    defaultLayoutPath,
    defaultMasterPath,
    defaultNotesMasterPath,
    defaultThemePath,
  }
}

function createSlideRelationship(context, slideIndex, relId) {
  const relationshipsEl = context.presentationRelsDoc.documentElement
  const rel = context.presentationRelsDoc.createElement('Relationship')
  rel.setAttribute('Id', relId)
  rel.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide')
  const target = context.getSlideTarget
    ? context.getSlideTarget(slideIndex)
    : `slides/slide${slideIndex}.xml`
  rel.setAttribute('Target', target)
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

function registerMaster(context, masterPath) {
  if (context.masterRelMap.has(masterPath)) return context.masterRelMap.get(masterPath)

  const doc = context.presentationDoc
  const relDoc = context.presentationRelsDoc

  let list = context.sldMasterList
  if (!list) {
    list = doc.createElementNS(PRESENTATION_NS, 'p:sldMasterIdLst')
    const firstChild = doc.documentElement.firstChild
    if (firstChild) doc.documentElement.insertBefore(list, firstChild)
    else doc.documentElement.appendChild(list)
    context.sldMasterList = list
  }

  context.nextMasterId = Number(context.nextMasterId || 2147483647)
  context.nextMasterId += 1
  context.nextRelId += 1
  const relId = `rId${context.nextRelId}`

  const masterNode = doc.createElementNS(PRESENTATION_NS, 'p:sldMasterId')
  masterNode.setAttribute('id', String(context.nextMasterId))
  masterNode.setAttributeNS(OFFICE_REL_NS, 'r:id', relId)
  list.appendChild(masterNode)

  const relElement = relDoc.createElement('Relationship')
  relElement.setAttribute('Id', relId)
  relElement.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster')
  relElement.setAttribute('Target', getRelativePath('ppt/presentation.xml', masterPath))
  relDoc.documentElement.appendChild(relElement)

  context.masterRelMap.set(masterPath, relId)
  return relId
}

function registerNotesMaster(context, notesMasterPath) {
  if (context.notesMasterRelMap.has(notesMasterPath)) return context.notesMasterRelMap.get(notesMasterPath)

  const doc = context.presentationDoc
  const relDoc = context.presentationRelsDoc

  let list = context.notesMasterList
  if (!list) {
    list = doc.createElementNS(PRESENTATION_NS, 'p:notesMasterIdLst')
    const parent = doc.documentElement
    const beforeNode = context.sldIdList || parent.firstChild
    if (beforeNode) parent.insertBefore(list, beforeNode)
    else parent.appendChild(list)
    context.notesMasterList = list
  }

  context.nextRelId += 1
  const relId = `rId${context.nextRelId}`

  const node = doc.createElementNS(PRESENTATION_NS, 'p:notesMasterId')
  node.setAttributeNS(OFFICE_REL_NS, 'r:id', relId)
  list.appendChild(node)

  const relElement = relDoc.createElement('Relationship')
  relElement.setAttribute('Id', relId)
  relElement.setAttribute(
    'Type',
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster'
  )
  relElement.setAttribute('Target', getRelativePath('ppt/presentation.xml', notesMasterPath))
  relDoc.documentElement.appendChild(relElement)

  context.notesMasterRelMap.set(notesMasterPath, relId)
  return relId
}

async function clonePart(
  context,
  srcZip,
  sourceContentTypesDoc,
  sourceKey,
  originalPath,
  options = {}
) {
  if (!originalPath) return null
  const mapKey = `${sourceKey}:${originalPath}`
  if (context.partMap.has(mapKey)) return context.partMap.get(mapKey)

  const typeInfo = getContentTypeInfo(sourceContentTypesDoc, originalPath)
  const entry = getZipEntry(srcZip, originalPath)
  if (!entry) return null

  if (typeInfo.contentType === PPT_SLIDE_LAYOUT_CT && context.defaultLayoutPath) {
    context.partMap.set(mapKey, context.defaultLayoutPath)
    return context.defaultLayoutPath
  }
  if (typeInfo.contentType === PPT_SLIDE_MASTER_CT && context.defaultMasterPath) {
    context.partMap.set(mapKey, context.defaultMasterPath)
    return context.defaultMasterPath
  }
  if (typeInfo.contentType === PPT_NOTES_MASTER_CT && context.defaultNotesMasterPath) {
    context.partMap.set(mapKey, context.defaultNotesMasterPath)
    return context.defaultNotesMasterPath
  }
  if (typeInfo.contentType === PPT_THEME_CT && context.defaultThemePath) {
    context.partMap.set(mapKey, context.defaultThemePath)
    return context.defaultThemePath
  }

  const info = parseNumberedPath(originalPath)
  let newPath

  if (info) {
    const counterKey = `${info.dir}${info.prefix}`
    const newNumber = allocateNumber(context.counters, counterKey)
    newPath = `${info.dir}${info.prefix}${newNumber}${info.ext}`
  } else {
    if (getZipEntry(context.zip, originalPath)) {
      context.partMap.set(mapKey, originalPath)
      return originalPath
    }
    newPath = originalPath
  }

  context.partMap.set(mapKey, newPath)

  if (typeInfo.fromOverride) {
    ensureContentOverride(context.contentTypesDoc, `/${newPath}`, typeInfo.contentType)
  } else if (typeInfo.extension) {
    ensureDefaultContentType(context.contentTypesDoc, sourceContentTypesDoc, typeInfo.extension)
  }

  const data = await entry.async(isBinaryContentType(typeInfo.contentType) ? 'uint8array' : 'string')
  context.zip.file(newPath, data)

  const relPath = getRelationshipsPath(originalPath)
  const relEntry = getZipEntry(srcZip, relPath)
  if (relEntry) {
    const relXml = await relEntry.async('string')
    const relDoc = parseXml(relXml)
    const relNodes = Array.from(relDoc.getElementsByTagName('Relationship'))

    for (const node of relNodes) {
      const targetMode = (node.getAttribute('TargetMode') || '').toLowerCase()
      if (targetMode === 'external') continue
      const target = node.getAttribute('Target') || ''
      const absolute = resolveTargetPath(originalPath, target)
      if (!absolute) continue

      let explicitTarget = null
      if (typeof options.relationshipMutator === 'function') {
        const result = await options.relationshipMutator({
          node,
          type: node.getAttribute('Type') || '',
          absolutePath: absolute,
          newPartPath: newPath,
          originalPartPath: originalPath,
        })
        if (result === false) continue
        if (result && result.targetPath) {
          explicitTarget = result.targetPath
        }
      }

      const clonedPath =
        explicitTarget || (await clonePart(context, srcZip, sourceContentTypesDoc, sourceKey, absolute))
      if (!clonedPath) continue
      const relative = getRelativePath(newPath, clonedPath)
      node.setAttribute('Target', relative)
    }

    const newRelPath = getRelationshipsPath(newPath)
    context.zip.file(newRelPath, serializeXml(relDoc))
  }

  if (typeInfo.contentType === PPT_SLIDE_MASTER_CT) {
    registerMaster(context, newPath)
  } else if (typeInfo.contentType === PPT_NOTES_MASTER_CT) {
    registerNotesMaster(context, newPath)
  }

  return newPath
}

async function processSlideRelationships(
  context,
  srcZip,
  sourceContentTypesDoc,
  sourceKey,
  originalSlidePath,
  newSlidePath
) {
  const relPath = getRelationshipsPath(originalSlidePath)
  const relEntry = getZipEntry(srcZip, relPath)
  if (!relEntry) return

  const relXml = await relEntry.async('string')
  const relDoc = parseXml(relXml)
  const relNodes = Array.from(relDoc.getElementsByTagName('Relationship'))
  const relationshipsEl = relDoc.documentElement
  let layoutAssigned = false
  let maxLocalRelId = relNodes.reduce((max, node) => {
    const idAttr = node.getAttribute('Id') || ''
    return Math.max(max, getNumericSuffix(idAttr))
  }, 0)

  for (const node of relNodes) {
    const type = node.getAttribute('Type') || ''
    const target = node.getAttribute('Target') || ''
    if (!target) continue
    const absolute = resolveTargetPath(originalSlidePath, target)
    if (!absolute) continue

    if (type.endsWith('/slideLayout')) {
      if (context.defaultLayoutTarget) {
        if (!layoutAssigned) {
          layoutAssigned = true
          node.setAttribute('Target', context.defaultLayoutTarget)
        } else {
          relationshipsEl.removeChild(node)
        }
      } else if (!layoutAssigned) {
        layoutAssigned = true
      } else {
        relationshipsEl.removeChild(node)
      }
      continue
    }

    if (type.endsWith('/notesSlide')) {
      const notePath = await clonePart(context, srcZip, sourceContentTypesDoc, sourceKey, absolute, {
        relationshipMutator: ({ type: relType }) => {
          if (relType.endsWith('/slide')) {
            return { targetPath: newSlidePath }
          }
          return null
        },
      })
      if (!notePath) continue
      node.setAttribute('Target', getRelativePath(newSlidePath, notePath))
    } else if (type.includes('/image') || type.includes('/audio') || type.includes('/video')) {
      const mediaPath = await clonePart(context, srcZip, sourceContentTypesDoc, sourceKey, absolute)
      if (!mediaPath) continue
      node.setAttribute('Target', getRelativePath(newSlidePath, mediaPath))
    } else {
      const dependencyPath = await clonePart(context, srcZip, sourceContentTypesDoc, sourceKey, absolute)
      if (!dependencyPath) continue
      node.setAttribute('Target', getRelativePath(newSlidePath, dependencyPath))
    }
  }

  if (!layoutAssigned && context.defaultLayoutTarget) {
    const relNode = relDoc.createElement('Relationship')
    const newId = `rId${maxLocalRelId + 1 || 1}`
    relNode.setAttribute('Id', newId)
    relNode.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout')
    relNode.setAttribute('Target', context.defaultLayoutTarget)
    relationshipsEl.appendChild(relNode)
  }

  const newRelPath = getRelationshipsPath(newSlidePath)
  context.zip.file(newRelPath, serializeXml(relDoc))
}

async function appendSlides(context, srcZip, sourceKey) {
  const slides = srcZip
    .file(/^ppt\/slides\/slide\d+\.xml$/)
    .sort((a, b) => {
      const aNum = getNumericSuffix(a.name)
      const bNum = getNumericSuffix(b.name)
      return aNum - bNum
    })

  if (!slides.length) return

  const contentTypesEntry = getZipEntry(srcZip, '[Content_Types].xml')
  if (!contentTypesEntry) throw new Error('Source PPTX missing [Content_Types].xml')
  const sourceContentTypesDoc = parseXml(await contentTypesEntry.async('string'))

  for (const slideEntry of slides) {
    const newSlideNumber = allocateNumber(context.counters, 'ppt/slides/slide')
    const newSlidePath = `ppt/slides/slide${newSlideNumber}.xml`
    const xml = await slideEntry.async('string')
    context.zip.file(newSlidePath, xml)

    ensureContentOverride(context.contentTypesDoc, `/${newSlidePath}`, PPT_SLIDE_CT)

    context.nextRelId += 1
    const relId = `rId${context.nextRelId}`
    createSlideRelationship(context, newSlideNumber, relId)
    appendSlideId(context, relId)

    const originalSlidePath = slideEntry.name
    context.partMap.set(`${sourceKey}:${originalSlidePath}`, newSlidePath)
    await processSlideRelationships(
      context,
      srcZip,
      sourceContentTypesDoc,
      sourceKey,
      originalSlidePath,
      newSlidePath
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
    await appendSlides(context, srcZip, `src${i + 1}`)
  }

  persistXml(context)
  const blob = await baseZip.generateAsync({ type: 'blob' })
  const safeName = sanitizeFilename(setlistName || 'Setlist')

  saveBlob(blob, `${safeName}.pptx`)
}
