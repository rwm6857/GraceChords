export default {
  async scheduled(event, env, ctx) {
    const res = await fetch(env.DEPLOY_HOOK_URL, { method: 'POST' })
    console.log(`Deploy hook triggered: ${res.status}`)
  }
}
