export const generateEmailContent = async (prompt) => {
  const response = await fetch('/api/generate-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Failed to generate content.')
  return data.output
}

export const sendEmail = async ({ to, subject, text }) => {
  const response = await fetch('/api/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject, text }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Failed to send email.')
  return data
}
