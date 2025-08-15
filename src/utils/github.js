const API = 'https://api.github.com'

function tokenOrThrow(){
  const t = localStorage.getItem('ghToken')
  if(!t) throw new Error('GitHub token not set. Use "Set GitHub token" first.')
  return t
}

async function ghFetch(path, init = {}){
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `token ${tokenOrThrow()}`,
      ...(init.headers || {}),
    },
  })
  if(!res.ok){
    let msg = `${res.status} ${res.statusText}`
    try { msg = await res.text() } catch {}
    throw new Error(msg)
  }
  return res.json()
}

export async function getRepoInfo({ owner, repo }){
  const repoInfo = await ghFetch(`/repos/${owner}/${repo}`)
  const default_branch = repoInfo.default_branch || 'main'
  const ref = await ghFetch(`/repos/${owner}/${repo}/git/ref/heads/${default_branch}`)
  return { default_branch, sha: ref.object.sha }
}

export async function createBranch({ owner, repo, fromSha, newBranch }){
  return ghFetch(`/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha: fromSha }),
  })
}

export function toBase64(str){
  return btoa(unescape(encodeURIComponent(str)))
}

export async function getFileSha({ owner, repo, path, ref }){
  try {
    const file = await ghFetch(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`)
    return file.sha
  } catch {
    return undefined
  }
}

export async function putFile({ owner, repo, branch, path, contentBase64, message, sha }){
  return ghFetch(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: contentBase64, branch, sha }),
  })
}

export async function createPR({ owner, repo, head, base, title, body }){
  return ghFetch(`/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({ title, body, head, base }),
  })
}
