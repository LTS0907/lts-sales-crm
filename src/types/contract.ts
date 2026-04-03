export type FieldType = 'SIGNATURE' | 'SIGNER_TEXT' | 'DATE' | 'CHECKBOX'
export type ContractStatus = 'SENT' | 'VIEWED' | 'SIGNED'
export type SignerRole = 'CLIENT' | 'OWNER'

export interface ContractField {
  id: string
  type: FieldType
  label: string
  page: number        // 0-indexed page number
  x: number           // percentage 0-100 from left
  y: number           // percentage 0-100 from top
  width: number       // percentage 0-100
  height: number      // percentage 0-100
  required?: boolean
  prefill?: string    // e.g. "{{company}}", "{{name}}", "{{email}}", "{{date}}"
  signer?: SignerRole // who fills this field
}

export interface FieldsConfig {
  templateName: string
  fields: ContractField[]
}

export interface ContractTemplate {
  fileName: string      // PDF filename
  displayName: string   // human-readable name
  hasFields: boolean    // whether fields.json exists
  fieldCount: number
}

export interface SigningData {
  contractId: string
  templateName: string
  contactName: string
  contactCompany: string | null
  fields: ContractField[]
  prefillValues: Record<string, string>
  pdfBase64: string
  status: ContractStatus
}

export interface SignSubmission {
  fieldValues: Record<string, string>  // fieldId -> value (text or base64 PNG for signatures)
}
