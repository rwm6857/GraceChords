import { supabase } from '../lib/supabase'

/**
 * Supabase CRUD helpers for the posts table.
 * All functions return { data, error }.
 */

export async function fetchPosts({ status } = {}) {
  let query = supabase
    .from('posts')
    .select('id, title, slug, excerpt, featured_image_url, tags, status, published_at, created_at, author_id')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  return query
}

export async function fetchPublishedPostsWithAuthors() {
  return supabase
    .from('posts')
    .select('id, title, slug, excerpt, tags, published_at, author_id, users(display_name)')
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
}

export async function fetchPostBySlug(slug) {
  return supabase
    .from('posts')
    .select('*, users(display_name)')
    .eq('slug', slug)
    .single()
}

export async function fetchPostById(id) {
  return supabase
    .from('posts')
    .select('*')
    .eq('id', id)
    .single()
}

export async function createPost({ title, slug, excerpt, content, featured_image_url, tags, status, author_id }) {
  const now = new Date().toISOString()
  return supabase
    .from('posts')
    .insert({
      title,
      slug,
      excerpt: excerpt || null,
      content: content || null,
      featured_image_url: featured_image_url || null,
      tags: tags || [],
      status,
      author_id,
      published_at: status === 'published' ? now : null,
    })
    .select()
    .single()
}

export async function updatePost(id, updates) {
  // Only set published_at when transitioning to published for the first time
  const patch = { ...updates }

  if (updates.status === 'published') {
    // Fetch current published_at to avoid overwriting it
    const { data: existing } = await supabase
      .from('posts')
      .select('published_at')
      .eq('id', id)
      .single()

    if (!existing?.published_at) {
      patch.published_at = new Date().toISOString()
    }
  }

  return supabase
    .from('posts')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
}

export async function deletePost(id) {
  return supabase
    .from('posts')
    .delete()
    .eq('id', id)
}
