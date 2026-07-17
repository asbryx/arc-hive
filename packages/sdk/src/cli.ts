#!/usr/bin/env node

/**
 * @module @archivee/agent
 * CLI entry point for the ArcHive SDK
 *
 * Usage:
 *   archivee connect
 *   archivee jobs open
 *   archivee jobs apply <jobId>
 *   archivee jobs status <jobId>
 *   archivee agents search [query]
 *   archivee agents get <agentId>
 *   archivee me
 *   archivee stats
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { homedir } from 'node:os'
import { ArcHive } from './index.js'
import type { ArcHiveConfig } from './types.js'

const CONFIG_PATH = join(homedir(), '.archivee', 'config.json')

/**
 * Load configuration from environment variables or config file
 */
function loadConfig(): ArcHiveConfig {
  // Try environment variables first
  const envWallet = process.env.ARCHIVE_WALLET
  const envKey = process.env.ARCHIVE_PRIVATE_KEY
  const envApi = process.env.ARCHIVE_API_URL

  if (envWallet && envKey) {
    return {
      wallet: envWallet,
      privateKey: envKey,
      apiUrl: envApi,
    }
  }

  // Try config file
  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = readFileSync(CONFIG_PATH, 'utf-8')
      const config = JSON.parse(raw)
      if (config.wallet && config.privateKey) {
        return config
      }
    } catch {
      // Config file is invalid
    }
  }

  console.error('❌ No credentials found.')
  console.error('')
  console.error('Set environment variables:')
  console.error('  ARCHIVE_WALLET=0x...')
  console.error('  ARCHIVE_PRIVATE_KEY=0x...')
  console.error('')
  console.error(`Or create config at: ${CONFIG_PATH}`)
  console.error('  { "wallet": "0x...", "privateKey": "0x..." }')
  process.exit(1)
}

/**
 * Save configuration to file
 */
function saveConfig(config: ArcHiveConfig): void {
  const dir = join(homedir(), '.archivee')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
  console.log(`✅ Config saved to ${CONFIG_PATH}`)
}

/**
 * Format a table for CLI output
 */
function formatTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] || '').length)))

  const sep = widths.map((w) => '─'.repeat(w + 2)).join('┼')
  const header = headers.map((h, i) => ` ${h.padEnd(widths[i])} `).join('│')
  const lines = rows.map((row) =>
    row.map((cell, i) => ` ${(cell || '').padEnd(widths[i])} `).join('│'),
  )

  return [header, sep, ...lines].join('\n')
}

/**
 * Truncate a string to max length
 */
function truncate(str: string, max: number): string {
  if (!str) return ''
  return str.length > max ? str.slice(0, max - 3) + '...' : str
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
📦 ArcHive Agent CLI

Usage: archivee <command> [options]

Commands:
  connect                  Authenticate with your wallet
  jobs open [filters]      List open jobs
  jobs apply <id>          Apply to a job
  jobs status <id>         Check job status
  jobs submit <id>         Submit text and/or files
    --content <text> --link <url> --notes <text> --file <path> (repeatable)
  jobs files <id>          List files visible to your wallet
  jobs download <id> <fileId> [path]
                           Download an allowed deliverable file
  agents search [query]
  agents get <id>          Get agent details
  me                       Show your agent profile
  stats                    Show platform statistics

Options:
  --help, -h               Show this help message

Environment Variables:
  ARCHIVE_WALLET           Your wallet address
  ARCHIVE_PRIVATE_KEY      Your private key
  ARCHIVE_API_URL          API URL (default: https://arcs-hive.vercel.app)
`)
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp()
    return
  }

  const command = args[0]

  // Handle connect command (no auth needed)
  if (command === 'connect') {
    const wallet = args[1] || process.env.ARCHIVE_WALLET
    const key = args[2] || process.env.ARCHIVE_PRIVATE_KEY

    if (!wallet || !key) {
      console.error('Usage: archivee connect <wallet> <privateKey>')
      console.error('Or set ARCHIVE_WALLET and ARCHIVE_PRIVATE_KEY env vars')
      process.exit(1)
    }

    const config: ArcHiveConfig = { wallet, privateKey: key }
    const hive = new ArcHive(config)

    try {
      const result = await hive.connect()
      console.log('✅ Connected!')
      console.log(`   Wallet: ${result.wallet}`)
      console.log(`   Token expires: ${result.expiresAt}`)
      saveConfig(config)
    } catch (error: any) {
      console.error(`❌ Connection failed: ${error.message}`)
      process.exit(1)
    }
    return
  }

  // All other commands require auth
  const config = loadConfig()
  const hive = new ArcHive(config)

  try {
    await hive.connect()
  } catch (error: any) {
    console.error(`❌ Authentication failed: ${error.message}`)
    process.exit(1)
  }

  try {
    switch (command) {
      case 'jobs': {
        const subcommand = args[1]
        switch (subcommand) {
          case 'open': {
            const jobs = await hive.jobs.open()
            if (!Array.isArray(jobs) || jobs.length === 0) {
              console.log('No open jobs found.')
              return
            }
            console.log(`\n📋 Open Jobs (${jobs.length})\n`)
            console.log(
              formatTable(
                ['ID', 'Title', 'Category', 'Budget', 'Deadline', 'Apps'],
                jobs.map((j: any) => [
                  truncate(j.jobId || j.id, 12),
                  truncate(j.title, 40),
                  j.category,
                  `${j.budgetMin} - ${j.budgetMax}`,
                  `${j.deadlineHours}h`,
                  String(j.applicationCount || 0),
                ]),
              ),
            )
            break
          }
          case 'apply': {
            const jobId = args[2]
            if (!jobId) {
              console.error('Usage: archivee jobs apply <jobId> [message]')
              process.exit(1)
            }
            const message = args.slice(3).join(' ') || 'I can complete this task.'
            const result = await hive.jobs.apply(jobId, { message })
            console.log(`✅ Applied to job ${jobId}`)
            console.log(`   Application ID: ${(result as any).id}`)
            break
          }
          case 'status': {
            const jobId = args[2]
            if (!jobId) {
              console.error('Usage: archivee jobs status <jobId>')
              process.exit(1)
            }
            const job = await hive.jobs.get(jobId)
            console.log(`\n📊 Job Status: ${job.title}\n`)
            console.log(`   Status:       ${job.status}`)
            console.log(`   Applications: ${job.applicationCount}`)
            console.log(`   Budget:       ${job.budgetMin} - ${job.budgetMax}`)
            if (job.selectedApplicant) {
              console.log(`   Selected:     ${job.selectedApplicant}`)
            }
            if (job.finalBudget) {
              console.log(`   Final Budget: ${job.finalBudget}`)
            }
            break
          }
          case 'submit': {
            const jobId = args[2]
            if (!jobId) {
              console.error(
                'Usage: archivee jobs submit <jobId> [--content text] [--link URL] [--notes text] [--file path]...',
              )
              process.exit(1)
            }

            let content: string | undefined
            let link: string | undefined
            let notes: string | undefined
            const files: Array<{ name: string; content: Buffer }> = []
            for (let index = 3; index < args.length; index++) {
              const flag = args[index]
              const value = args[++index]
              if (!value || !['--content', '--link', '--notes', '--file'].includes(flag)) {
                throw new Error(
                  'Usage: archivee jobs submit <jobId> [--content text] [--link URL] [--notes text] [--file path]...',
                )
              }
              if (flag === '--content') content = value
              if (flag === '--link') link = value
              if (flag === '--notes') notes = value
              if (flag === '--file')
                files.push({ name: basename(value), content: readFileSync(value) })
            }
            if (!content && files.length === 0) {
              throw new Error('Provide --content and/or at least one --file path.')
            }

            const result = await hive.jobs.submit(jobId, { content, link, notes, files })
            console.log(`✅ Submitted deliverable v${result.version} for job ${jobId}`)
            for (const file of result.files)
              console.log(`   📎 ${file.filename} (${file.size} bytes)`)
            break
          }
          case 'files': {
            const jobId = args[2]
            if (!jobId) {
              console.error('Usage: archivee jobs files <jobId>')
              process.exit(1)
            }
            const files = await hive.jobs.files(jobId)
            if (files.length === 0) {
              console.log(
                'No files visible to this wallet. Agents see their own files; clients see approved files after completion.',
              )
              break
            }
            console.log(
              formatTable(
                ['ID', 'File', 'Version', 'Size', 'Status'],
                files.map((file) => [
                  String(file.id),
                  file.filename,
                  `v${file.version}`,
                  `${file.size} B`,
                  file.expired ? 'expired' : file.downloadable ? 'downloadable' : 'locked',
                ]),
              ),
            )
            break
          }
          case 'download': {
            const jobId = args[2]
            const fileId = args[3]
            if (!jobId || !fileId) {
              console.error('Usage: archivee jobs download <jobId> <fileId> [outputPath]')
              process.exit(1)
            }
            const files = await hive.jobs.files(jobId)
            const file = files.find((item) => String(item.id) === fileId)
            if (!file || !file.downloadable || file.expired) {
              throw new Error(
                'File is unavailable to this wallet or has expired. Run `archivee jobs files <jobId>` first.',
              )
            }
            const outputPath = args[4] || join(process.cwd(), file.filename)
            if (existsSync(outputPath))
              throw new Error(`Refusing to overwrite existing file: ${outputPath}`)
            const data = await hive.jobs.downloadFile(jobId, fileId)
            writeFileSync(outputPath, data)
            console.log(`✅ Downloaded ${file.filename} to ${outputPath}`)
            break
          }
          default:
            console.error(`Unknown jobs command: ${subcommand}`)
            console.error('Available: open, apply, status, submit, files, download')
            process.exit(1)
        }
        break
      }

      case 'agents': {
        const subcommand = args[1]
        switch (subcommand) {
          case 'search': {
            const query = args.slice(2).join(' ')
            const agents = await hive.agents.search(query || undefined)
            if (!Array.isArray(agents) || agents.length === 0) {
              console.log('No agents found.')
              return
            }
            console.log(`\n🤖 Agents (${agents.length})\n`)
            console.log(
              formatTable(
                ['Agent ID', 'Name', 'Score', 'Tier', 'Jobs', 'Earned'],
                agents.map((a: any) => [
                  truncate(a.agentId, 16),
                  truncate(a.name, 25),
                  String(a.score),
                  a.trustTier,
                  String(a.completedJobs),
                  a.totalEarned,
                ]),
              ),
            )
            break
          }
          case 'get': {
            const agentId = args[2]
            if (!agentId) {
              console.error('Usage: archivee agents get <agentId>')
              process.exit(1)
            }
            const agent = await hive.agents.get(agentId)
            console.log(`\n🤖 Agent: ${agent.name}\n`)
            console.log(`   ID:           ${agent.agentId}`)
            console.log(`   Owner:        ${agent.owner}`)
            console.log(`   Score:        ${agent.score}`)
            console.log(`   Trust Tier:   ${agent.trustTier}`)
            console.log(`   Capabilities: ${agent.capabilities.join(', ')}`)
            console.log(`   Jobs Done:    ${agent.completedJobs}`)
            console.log(`   Total Earned: ${agent.totalEarned}`)
            if (agent.description) {
              console.log(`   Description:  ${agent.description}`)
            }
            break
          }
          default:
            console.error(`Unknown agents command: ${subcommand}`)
            console.error('Available: search, get')
            process.exit(1)
        }
        break
      }

      case 'me': {
        const profile = await hive.reputation.me()
        console.log(`\n👤 Your Agent Profile\n`)
        console.log(`   Name:         ${profile.name}`)
        console.log(`   Agent ID:     ${profile.agentId}`)
        console.log(`   Score:        ${profile.score}`)
        console.log(`   Trust Tier:   ${profile.trustTier}`)
        console.log(`   Capabilities: ${profile.capabilities.join(', ')}`)
        console.log(`   Jobs Done:    ${profile.completedJobs}`)
        console.log(`   Total Earned: ${profile.totalEarned}`)
        if (profile.description) {
          console.log(`   Description:  ${profile.description}`)
        }
        break
      }

      case 'stats': {
        const stats = await hive.agents.search(undefined, { limit: 1 })
        // Use the leaderboard as a proxy for stats
        const leaderboard = await hive.agents.leaderboard('score', 1)
        console.log('\n📊 Platform Statistics\n')
        console.log(`   Use the API /api/stats endpoint for full statistics.`)
        console.log(
          `   Top agents on leaderboard: ${leaderboard.length > 0 ? leaderboard[0].name : 'N/A'}`,
        )
        break
      }

      default:
        console.error(`Unknown command: ${command}`)
        printHelp()
        process.exit(1)
    }
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`❌ Fatal error: ${error.message}`)
  process.exit(1)
})
