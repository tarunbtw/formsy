#!/usr/bin/env node
import * as p from '@clack/prompts'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

// Templates
function reactTemplate(slug: string): string {
  return `import { useState } from 'react'

const ENDPOINT = \`https://api.formsy.dev/submit/${slug}\`

export default function FormsyContactForm() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('loading')

    const form = e.currentTarget
    const data = Object.fromEntries(new FormData(form))

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw await res.json()
      setStatus('success')
      form.reset()
    } catch {
      setStatus('error')
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" placeholder="Name" required />
      <input name="email" type="email" placeholder="Email" required />
      <textarea name="message" placeholder="Message" required />
      {/* Honeypot — do not remove */}
      <input name="_honeypot" style={{ display: 'none' }} tabIndex={-1} />
      <button type="submit" disabled={status === 'loading'}>
        {status === 'loading' ? 'Sending…' : 'Send'}
      </button>
      {status === 'success' && <p>Thanks! Your message was sent.</p>}
      {status === 'error' && <p>Something went wrong. Please try again.</p>}
    </form>
  )
}
`
}

function nextTemplate(slug: string): string {
  return `'use client'
import { useState } from 'react'

const ENDPOINT = \`https://api.formsy.dev/submit/${slug}\`

export default function FormsyContactForm() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('loading')
    const data = Object.fromEntries(new FormData(e.currentTarget))

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    setStatus(res.ok ? 'success' : 'error')
  }

  if (status === 'success') return <p>Submitted! ✓</p>

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" placeholder="Name" required />
      <input name="email" type="email" placeholder="Email" required />
      <textarea name="message" placeholder="Message" />
      <input name="_honeypot" style={{ display: 'none' }} tabIndex={-1} />
      <button disabled={status === 'loading'}>
        {status === 'loading' ? 'Sending…' : 'Send'}
      </button>
      {status === 'error' && <p>Error. Please try again.</p>}
    </form>
  )
}
`
}

function vueTemplate(slug: string): string {
  return `<template>
  <form @submit.prevent="handleSubmit">
    <input v-model="form.name" name="name" placeholder="Name" required />
    <input v-model="form.email" name="email" type="email" placeholder="Email" required />
    <textarea v-model="form.message" name="message" placeholder="Message" />
    <input name="_honeypot" style="display:none" tabindex="-1" />
    <button type="submit" :disabled="loading">{{ loading ? 'Sending…' : 'Send' }}</button>
    <p v-if="success">Submitted! ✓</p>
    <p v-if="error">Error. Please try again.</p>
  </form>
</template>

<script setup>
import { ref, reactive } from 'vue'

const ENDPOINT = 'https://api.formsy.dev/submit/${slug}'
const form = reactive({ name: '', email: '', message: '' })
const loading = ref(false)
const success = ref(false)
const error = ref(false)

async function handleSubmit() {
  loading.value = true
  error.value = false
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    success.value = res.ok
    error.value = !res.ok
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}
</script>
`
}

function vanillaTemplate(slug: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Contact</title>
  <script src="https://cdn.formsy.dev/v1/formsy.min.js"><\/script>
</head>
<body>
  <form id="contact-form">
    <input name="name" placeholder="Name" required>
    <input name="email" type="email" placeholder="Email" required>
    <textarea name="message" placeholder="Message"></textarea>
    <input name="_honeypot" style="display:none" tabindex="-1">
    <button type="submit">Send</button>
    <p id="status"></p>
  </form>

  <script>
    document.getElementById('contact-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const data = Object.fromEntries(new FormData(e.target))
      const status = document.getElementById('status')
      try {
        await Formsy.submit('${slug}', data)
        status.textContent = 'Sent! ✓'
        e.target.reset()
      } catch (err) {
        status.textContent = 'Error: ' + (err.error || 'Unknown')
      }
    })
  <\/script>
</body>
</html>
`
}

const TEMPLATES = {
  react: { fn: reactTemplate, ext: 'tsx', filename: 'FormsyContactForm.tsx' },
  nextjs: { fn: nextTemplate, ext: 'tsx', filename: 'FormsyContactForm.tsx' },
  vue: { fn: vueTemplate, ext: 'vue', filename: 'FormsyContactForm.vue' },
  vanilla: { fn: vanillaTemplate, ext: 'html', filename: 'formsy-contact.html' },
} as const

async function main() {
  console.log('')
  p.intro('  Formsy — scaffold a form component  ')

  const framework = await p.select({
    message: 'Pick your framework',
    options: [
      { value: 'react', label: 'React' },
      { value: 'nextjs', label: 'Next.js' },
      { value: 'vue', label: 'Vue 3' },
      { value: 'vanilla', label: 'Vanilla JS (HTML)' },
    ],
  })

  if (p.isCancel(framework)) {
    p.cancel('Cancelled.')
    process.exit(0)
  }

  const slug = await p.text({
    message: 'Your project slug',
    placeholder: 'abc123xyz',
    validate(value) {
      if (!value || value.length < 3) return 'Slug must be at least 3 characters'
    },
  })

  if (p.isCancel(slug)) {
    p.cancel('Cancelled.')
    process.exit(0)
  }

  const template = TEMPLATES[framework as keyof typeof TEMPLATES]
  const content = template.fn(slug as string)
  const outputPath = join(process.cwd(), template.filename)

  if (existsSync(outputPath)) {
    const overwrite = await p.confirm({
      message: `${template.filename} already exists. Overwrite?`,
    })
    if (!overwrite || p.isCancel(overwrite)) {
      p.cancel('Aborted.')
      process.exit(0)
    }
  }

  writeFileSync(outputPath, content, 'utf-8')

  p.outro(
    `✓ Created ${template.filename}\n` +
    `  Edit the component, then read docs at https://formsy.dev/docs\n` +
    `  Your endpoint: https://api.formsy.dev/submit/${slug}`
  )
}

main().catch(console.error)
