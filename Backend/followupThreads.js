const { ImapFlow } = require('imapflow')

// How many recent matches to check per address when IMAP's substring "TO" search
// also matches longer addresses (e.g. "ab@x.com" for "b@x.com").
const MAX_CANDIDATES = 10

const parseMessageIds = (value) => String(value ?? '').match(/<[^<>\s]+>/g) ?? []

const sentToAddress = (envelope, email) =>
  (envelope?.to ?? []).some((recipient) => String(recipient.address ?? '').toLowerCase() === email)

const findInSent = async (client, email) => {
  const uids = (await client.search({ to: email }, { uid: true })) || []
  const recent = [...uids].sort((a, b) => b - a).slice(0, MAX_CANDIDATES)

  for (const uid of recent) {
    const message = await client.fetchOne(uid, { envelope: true, headers: ['references'] }, { uid: true })
    if (!message?.envelope?.messageId || !sentToAddress(message.envelope, email)) continue
    const references = parseMessageIds(message.headers?.toString().replace(/^references:/i, ''))
    return {
      found: true,
      subject: message.envelope.subject || '',
      messageId: message.envelope.messageId,
      references,
      sentAt: message.envelope.date || null,
    }
  }
  return { found: false }
}

// For each address, the latest email this Gmail account sent to it (from the app or by hand),
// so a follow-up can be sent as a reply in that thread.
const findLastSentTo = async (emails) => {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    logger: false,
  })

  try {
    await client.connect()
  } catch (error) {
    const message = error.authenticationFailed
      ? 'Gmail rejected the login for IMAP. Check EMAIL_USER/EMAIL_PASS (app password) and that IMAP is enabled in Gmail settings.'
      : `Could not connect to Gmail IMAP — ${error.message}`
    throw new Error(message)
  }

  try {
    // Located by its special-use flag so it works whatever language Gmail is set to.
    const sent = (await client.list()).find((box) => box.specialUse === '\\Sent')
    if (!sent) throw new Error('Could not find the Gmail "Sent" folder over IMAP.')

    const lock = await client.getMailboxLock(sent.path, { readOnly: true })
    try {
      const results = {}
      for (const email of emails) {
        results[email] = await findInSent(client, email)
      }
      return results
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
}

module.exports = { findLastSentTo }
