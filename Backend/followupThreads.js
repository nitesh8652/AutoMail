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

// For each address, whether it has emailed this mailbox on or after `since` (a Date per address).
// Searches All Mail, so replies that were archived or labelled still count. `auth` is { user, pass }.
const findRepliesFrom = async (auth, sinceByEmail) => {
  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth, logger: false })
  try {
    await client.connect()
  } catch (error) {
    throw new Error(
      error.authenticationFailed
        ? `Gmail rejected the IMAP login for ${auth.user}. Check the app password and that IMAP is enabled.`
        : `Could not connect to Gmail IMAP — ${error.message}`
    )
  }

  try {
    const boxes = await client.list()
    const box = boxes.find((entry) => entry.specialUse === '\\All') || boxes.find((entry) => entry.path === 'INBOX')
    const lock = await client.getMailboxLock(box.path, { readOnly: true })
    try {
      const results = {}
      for (const [email, since] of Object.entries(sinceByEmail)) {
        // IMAP's FROM search is a substring match, so confirm the exact sender on the newest few.
        const uids = ((await client.search({ from: email, since }, { uid: true })) || []).sort((a, b) => b - a)
        results[email] = false
        for (const uid of uids.slice(0, MAX_CANDIDATES)) {
          const message = await client.fetchOne(uid, { envelope: true }, { uid: true })
          if ((message?.envelope?.from ?? []).some((sender) => String(sender.address ?? '').toLowerCase() === email)) {
            results[email] = true
            break
          }
        }
      }
      return results
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
}

module.exports = { findLastSentTo, findRepliesFrom }
