'use strict'

const express = require('express')
const cors = require('cors')
const https = require('https')
require('dotenv').config()

const app = express()
app.use(cors())
app.use(express.json())

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

// POST /api/chat  — streams OpenAI response back to client
app.post('/api/chat', (req, res) => {
  const { messages, mode } = req.body

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY not set' })
  }

  const systemPrompt = mode === 'research'
    ? `You are ResearchAI in Research Mode — an expert academic research assistant. 
You help users:
- Analyze research papers and identify limitations, gaps, and future work
- Suggest novel, publishable research topics
- Find and summarize relevant recent literature
- Generate structured research outlines, experiment plans, and timelines
- Provide pros/cons analysis of research directions

Be precise, cite reasoning clearly, use academic tone. Format responses with clear sections using markdown.`
    : `You are ResearchAI in Product Dev Mode — an expert product strategist and technical advisor.
You help users:
- Break down product ideas into structured workflows
- Conduct market analysis and competitor research with quantitative insights
- Define MVP features and full-scale product roadmaps
- Tailor output to the user's role (PM, SWE, Marketing, Researcher)
- Recommend tech stacks based on the product requirements
- Suggest realistic timelines (days/months/years)

Be strategic, data-driven, and actionable. Format responses with clear sections using markdown.`

  const body = JSON.stringify({
    model: 'gpt-4o',
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
  })

  const options = {
    hostname: 'api.openai.com',
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Length': Buffer.byteLength(body),
    },
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const apiReq = https.request(options, (apiRes) => {
    apiRes.on('data', (chunk) => res.write(chunk))
    apiRes.on('end', () => res.end())
  })

  apiReq.on('error', (err) => {
    console.error('OpenAI request error:', err)
    res.status(500).end()
  })

  apiReq.write(body)
  apiReq.end()
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`🚀 API server running on http://localhost:${PORT}`))
