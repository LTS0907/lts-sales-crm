export interface SubscriptionServiceDef {
  key: string
  label: string
  defaultBillingType: 'FIXED' | 'VARIABLE'
  defaultDescription: string
  defaultSubject: string
}

export const SUBSCRIPTION_SERVICES: SubscriptionServiceDef[] = [
  {
    key: 'dx_support',
    label: 'DX内製化サポート',
    defaultBillingType: 'FIXED',
    defaultDescription: 'IT内製化サポート 月額',
    defaultSubject: 'IT内製化サポート ご請求',
  },
  {
    key: 'ad_management',
    label: '広告運用手数料',
    defaultBillingType: 'VARIABLE',
    defaultDescription: '広告運用手数料',
    defaultSubject: '広告運用手数料 ご請求',
  },
]

export function getServiceByKey(key: string): SubscriptionServiceDef | undefined {
  return SUBSCRIPTION_SERVICES.find(s => s.key === key)
}
