import { google, tasks_v1 } from 'googleapis'

const CRM_LIST_TITLE = 'CRM'

export function getTasksClient(accessToken: string): tasks_v1.Tasks {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  return google.tasks({ version: 'v1', auth })
}

export async function getOrCreateCrmTaskList(
  client: tasks_v1.Tasks
): Promise<string> {
  // Try to find existing CRM list
  const res = await client.tasklists.list({ maxResults: 100 })
  const lists = res.data.items || []
  const existing = lists.find(l => l.title === CRM_LIST_TITLE)
  if (existing?.id) return existing.id

  // Create new CRM list
  const created = await client.tasklists.insert({
    requestBody: { title: CRM_LIST_TITLE },
  })
  return created.data.id!
}
