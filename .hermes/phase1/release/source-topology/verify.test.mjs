import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  CANONICAL_UPSTREAM_URL,
  EXIT_CODES,
  verifySnapshot
} from './verify.mjs'

const directory = path.dirname(fileURLToPath(import.meta.url))
const verifier = path.join(directory, 'verify.mjs')
const fixturePath = (name) => path.join(directory, 'fixtures', name)
const expectedPath = (name) => path.join(directory, 'expected', name)

const readJson = async (filePath) =>
  JSON.parse(await readFile(filePath, 'utf8'))

const runFixture = (name) =>
  spawnSync(
    process.execPath,
    [verifier, 'verify', '--input', fixturePath(name)],
    {
      encoding: 'utf8'
    }
  )

test('current snapshot is an exact deterministic expected failure', async () => {
  const result = runFixture('current.snapshot.json')
  const expected = await readFile(expectedPath('current.stdout.txt'), 'utf8')

  assert.equal(result.status, EXIT_CODES.BLOCKED)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, expected)
  assert.match(result.stdout, /verdict=BLOCKED/)
  assert.match(
    result.stdout,
    /source_url_state=UPSTREAM_PRESERVED_CONTROL_UNVERIFIED/
  )
})

test('desired synthetic topology and controlled links pass exactly', async () => {
  const result = runFixture('desired.synthetic.json')
  const expected = await readFile(expectedPath('desired.stdout.txt'), 'utf8')

  assert.equal(result.status, EXIT_CODES.PASS)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, expected)
  assert.match(result.stdout, /verdict=PASS_SYNTHETIC/)
  assert.match(result.stdout, /source_url_state=CONTROLLED/)
})

test('unverified Omarketing-like destination fails instead of claiming control', async () => {
  const snapshot = await readJson(fixturePath('current.snapshot.json'))
  snapshot.branding.source_links.package_homepage =
    'https://unverified.omarketing.example.invalid'

  const result = verifySnapshot(snapshot)
  const sourceCheck = result.checks.find(
    (check) => check.id === 'source.links_control_state'
  )

  assert.equal(result.exitCode, EXIT_CODES.BLOCKED)
  assert.equal(result.sourceUrlState, 'UNVERIFIED_DESTINATION')
  assert.equal(sourceCheck?.status, 'BLOCKED')
})

test('an effective upstream push fallback blocks the desired fixture', async () => {
  const snapshot = await readJson(fixturePath('desired.synthetic.json'))
  snapshot.git.upstream.effective_push_urls = [CANONICAL_UPSTREAM_URL]

  const result = verifySnapshot(snapshot)
  const pushCheck = result.checks.find(
    (check) => check.id === 'git.upstream.push_absent'
  )

  assert.equal(result.exitCode, EXIT_CODES.BLOCKED)
  assert.equal(pushCheck?.status, 'BLOCKED')
  assert.match(pushCheck?.detail ?? '', /fallback is unsafe/)
})
