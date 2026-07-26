import test from 'node:test'
import assert from 'node:assert/strict'
import { buildReportPayload, moderateContentReport } from './moderation.js'

test('buildReportPayload keeps only schema-supported fields and trims evidence', () => {
  assert.deepEqual(buildReportPayload({
    reporterId: 'reporter',
    targetType: 'message',
    targetId: 'message',
    reason: 'spam',
    details: '  repeated links  ',
    clientContent: '  decrypted evidence  '
  }), {
    reporter_id: 'reporter',
    target_type: 'message',
    target_id: 'message',
    reason: 'spam',
    details: 'repeated links',
    client_content: 'decrypted evidence'
  })
})

test('buildReportPayload rejects unsupported reasons', () => {
  assert.throws(() => buildReportPayload({
    reporterId: 'reporter',
    targetType: 'message',
    targetId: 'message',
    reason: 'annoying'
  }), /valid report reason/)
})

test('moderateContentReport calls the protected RPC with normalized values', async () => {
  let request
  const client = {
    rpc: async (name, values) => {
      request = { name, values }
      return { error: null }
    }
  }

  await moderateContentReport(client, { reportId: 'report', action: 'dismiss', note: '  no violation  ' })
  assert.deepEqual(request, {
    name: 'moderate_report',
    values: {
      target_report_id: 'report',
      moderation_action: 'dismiss',
      moderation_note: 'no violation'
    }
  })
})
