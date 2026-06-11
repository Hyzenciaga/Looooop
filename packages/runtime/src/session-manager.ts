import { readdir, readFile, appendFile, mkdir } from 'fs/promises'
import { join, basename } from 'path'
import { homedir } from 'os'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'

export interface SessionSummary {
  id: string
  title: string
  projectPath: string
  lastModified: number
  filePath: string
}

/**
 * Manages session persistence as JSONL files.
 * Compatible with Claude Code's session storage format.
 */
export class SessionManager {
  private claudeDir: string

  constructor() {
    this.claudeDir = join(homedir(), '.claude')
  }

  private getProjectDir(projectPath: string): string {
    // Encode project path the same way Claude Code does
    const encoded = projectPath
      .replace(/\//g, '-')
      .replace(/^-/, '')
    return join(this.claudeDir, 'projects', encoded)
  }

  async list(projectPath: string): Promise<SessionSummary[]> {
    const dir = this.getProjectDir(projectPath)

    try {
      const entries = await readdir(dir, { withFileTypes: true })
      const jsonlFiles = entries.filter(
        (e) => e.isFile() && e.name.endsWith('.jsonl')
      )

      const summaries: SessionSummary[] = []

      for (const file of jsonlFiles) {
        const filePath = join(dir, file.name)
        const content = await readFile(filePath, 'utf-8')
        const lines = content.trim().split('\n').filter(Boolean)

        if (lines.length === 0) continue

        // First line is usually metadata
        let title = basename(file.name, '.jsonl')
        let lastModified = 0

        for (const line of lines) {
          try {
            const entry = JSON.parse(line)
            if (entry.type === 'summary' && entry.title) {
              title = entry.title
            }
            if (entry.timestamp) {
              lastModified = Math.max(lastModified, entry.timestamp)
            }
          } catch {
            // Skip malformed lines
          }
        }

        summaries.push({
          id: basename(file.name, '.jsonl'),
          title,
          projectPath,
          lastModified: lastModified || Date.now(),
          filePath,
        })
      }

      // Sort by most recent first
      summaries.sort((a, b) => b.lastModified - a.lastModified)
      return summaries
    } catch {
      return []
    }
  }

  async load(sessionId: string): Promise<SDKMessage[]> {
    // Search all project directories for this session
    try {
      const projectsDir = join(this.claudeDir, 'projects')
      const projects = await readdir(projectsDir, { withFileTypes: true })

      for (const project of projects) {
        if (!project.isDirectory()) continue
        const filePath = join(projectsDir, project.name, `${sessionId}.jsonl`)

        try {
          const content = await readFile(filePath, 'utf-8')
          const lines = content.trim().split('\n').filter(Boolean)
          return lines.map((line) => JSON.parse(line) as SDKMessage)
        } catch {
          // Not in this project dir, continue searching
        }
      }
    } catch {
      // Projects dir doesn't exist
    }

    return []
  }

  async append(
    sessionId: string,
    projectPath: string,
    message: SDKMessage
  ): Promise<void> {
    const dir = this.getProjectDir(projectPath)
    await mkdir(dir, { recursive: true })

    const filePath = join(dir, `${sessionId}.jsonl`)
    const line = JSON.stringify(message) + '\n'
    await appendFile(filePath, line, 'utf-8')
  }
}
