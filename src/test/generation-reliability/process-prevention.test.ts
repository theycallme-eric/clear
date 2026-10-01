/**
 * GR-08 / REQ-030 — Agent Runner prevention: no partial closure.
 *
 * The rules live in prose: `docs/process/AGENT_PLAYBOOK.md` for an agent, and
 * `docs/process/generation-reliability/agent-runner-prevention.md` as the
 * handoff to the separate Agent Runner project. Nothing generates either, so
 * this suite is the check REQ-030 asks for: it fails if the playbook or the
 * specification loses a rule, or if the TASK-032 replay scenario stops agreeing
 * with the journal entry it replays or with the outcome the handoff promises.
 *
 * The runner itself is not here. The replay command named below is work for
 * the target project; this suite only holds the contract it is built against.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../../../scripts/catalog-seed/sources.mjs'
import { Constants } from '../../data/database.types'

const PLAYBOOK = 'docs/process/AGENT_PLAYBOOK.md'
const SPEC = 'docs/process/generation-reliability/agent-runner-prevention.md'
const SCENARIO = 'docs/process/generation-reliability/task-032-replay.json'
const TARGET = '/Users/eric/Documents/Projects/support-tooling/agent-runner'

const SECTION_TYPES = [...Constants.public.Enums.section_type] as string[]

/** Prose is hard-wrapped, so a rule is matched with its whitespace collapsed. */
const flat = (text: string) => text.replace(/\s+/g, ' ')

const read = (path: string) => readFileSync(join(REPO_ROOT, path), 'utf8')

/** The body of one `## ` section, so a rule is held to the place it belongs. */
function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`\n## ${heading}`)
  if (start === -1) return ''
  const end = markdown.indexOf('\n## ', start + 1)
  return flat(markdown.slice(start, end === -1 ? undefined : end))
}

const playbook = read(PLAYBOOK)
const spec = read(SPEC)
const scenario = JSON.parse(read(SCENARIO))

describe('the Agent Playbook', () => {
  const done = section(playbook, '5. Done')
  const wrong = section(playbook, '6. When the requirement is wrong')

  it('raises a discovered violation as a blocking recovery item', () => {
    expect(wrong).toContain('blocking recovery item')
    expect(wrong).toMatch(/acceptance criteria/)
    expect(wrong).toMatch(/dependent task/)
    expect(wrong).toContain('record which tasks it blocks')
  })

  it('keeps the task open while the finding is unresolved', () => {
    expect(wrong).toContain('may not close while it is unresolved')
  })

  it('allows out of scope only with the behaviour removed from dependents', () => {
    expect(wrong).toContain(
      '"Out of scope" is valid only when the affected behavior is removed from dependents',
    )
  })

  it('states the journal-inspection completion check', () => {
    expect(done).toContain('completion check inspects the task\'s journal entry and process log')
    expect(done).toContain('unresolved finding prevents closure')
  })

  it('points at the specification', () => {
    expect(wrong).toContain(SPEC)
  })
})

describe('the prevention specification', () => {
  const text = flat(spec)

  it('names the Agent Runner project as the implementation target', () => {
    expect(text).toContain(`**Implementation target:** \`${TARGET}\``)
    expect(text).toContain(`**Target tool path:** \`${TARGET}\``)
  })

  it('defines the blocking recovery item and its recorded dependency', () => {
    const rule = section(spec, 'Rules')
    expect(rule).toContain('create a blocking recovery item')
    expect(rule).toContain('record the dependency')
    expect(rule).toContain('refuse to close the finding task while the recovery item is unresolved')
    expect(rule).toContain('stop the graph for the affected dependents')
  })

  it('defines the out-of-scope condition', () => {
    const rule = section(spec, 'Rules')
    expect(rule).toContain(
      'valid disposition for a finding only when the affected behavior is removed from dependents',
    )
    expect(rule).toContain('The finding is unresolved and rule 1 applies')
  })

  it('defines the completion check over the journal and process log', () => {
    const rule = section(spec, 'Rules')
    expect(rule).toContain('inspects the task journal and its process log for findings')
    expect(rule).toContain('refuses closure if any is unresolved')
    for (const disposition of ['fixed', 'recovery-item', 'removed-from-dependents', 'no-impact']) {
      expect(rule).toContain(`\`${disposition}\``)
    }
  })

  it('separates automatic recovery from actions behind a safety gate', () => {
    const gates = section(spec, 'Automatic recovery, and what still needs a safety gate')
    const [automatic, gated] = gates.split('**Requires an explicit safety gate.**')
    expect(automatic).toContain('**Automatic.**')
    expect(automatic).toContain('create the recovery item')
    expect(automatic).toContain('stop scheduling the affected dependents')
    expect(gated).toBeDefined()
    expect(gated).toContain('overriding the completion check')
    expect(gated).toContain('resuming the graph')
    expect(gated).toContain('removing behaviour from a dependent')
    expect(gated).toContain('merging a pull request')
  })

  it('carries the replay scenario, its outcome and its command', () => {
    const replay = section(spec, 'Replay scenario')
    expect(replay).toContain(SCENARIO)
    expect(replay).toContain(
      'the graph stops and a recovery item is created instead of dependents completing',
    )
    expect(replay).toContain(scenario.target.replayCommand)
  })
})

describe('the TASK-032 replay scenario', () => {
  it('belongs to this requirement and this specification', () => {
    expect(scenario.requirement).toBe('REQ-030')
    expect(scenario.specification).toBe(SPEC)
    expect(existsSync(join(REPO_ROOT, scenario.specification))).toBe(true)
  })

  it('targets the Agent Runner project with a command that runs this file', () => {
    expect(scenario.target.project).toBe(TARGET)
    expect(scenario.target.replayCommand).toContain(SCENARIO)
  })

  it('replays what the TASK-032 journal entry actually says', () => {
    const journal = read(scenario.source.journal)
    const start = journal.indexOf(scenario.source.heading)
    expect(start).toBeGreaterThan(-1)

    const end = journal.indexOf('\n## ', start + 1)
    const entry = flat(journal.slice(start, end === -1 ? undefined : end))
    expect(entry).toContain(scenario.source.quote)

    expect(scenario.source.heading).toContain(scenario.task.id)
    expect(scenario.source.heading).toContain(scenario.task.requirement)
    expect(scenario.source.heading).toContain(`#${scenario.task.issue}`)
  })

  it('describes the finding the quote records', () => {
    const { finding, source } = scenario
    expect(finding.sections).toEqual(['skill_power', 'carries', 'stability_balance'])
    for (const name of finding.sections) {
      expect(SECTION_TYPES).toContain(name)
      expect(source.quote).toContain(`\`${name}\``)
      expect(finding.affectedBehavior).toContain(name)
    }
    expect(source.quote).toContain(`\`${finding.failure}\``)
    expect(source.quote).toContain('out of scope')
    expect(finding.recordedDisposition).toBe('out_of_scope')
    expect(finding.behaviorRemovedFromDependents).toBe(false)
  })

  it('records the outcome that happened: closed, with dependents completing', () => {
    expect(scenario.observedOutcome).toEqual({
      taskClosed: true,
      recoveryItemCreated: false,
      graphStopped: false,
      dependentsCompleted: true,
    })
  })

  it('expects the graph to stop and a recovery item to be created', () => {
    const { expectedOutcome, finding, task } = scenario
    expect(expectedOutcome.findingStatus).toBe('unresolved')
    expect(expectedOutcome.taskClosed).toBe(false)
    expect(expectedOutcome.graphStopped).toBe(true)
    expect(expectedOutcome.dependentsCompleted).toBe(false)
    expect(expectedOutcome.recoveryItem).toEqual({
      created: true,
      blocking: true,
      blockedTask: task.id,
      blocksDependents: finding.affectedDependents,
      dependencyRecorded: true,
    })
  })

  it('refuses out of scope exactly because the behaviour was left in dependents', () => {
    expect(scenario.expectedOutcome.outOfScopeAccepted).toBe(
      scenario.finding.behaviorRemovedFromDependents,
    )
    expect(scenario.finding.affectedDependents.length).toBeGreaterThan(0)
  })
})
