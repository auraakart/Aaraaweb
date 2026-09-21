import fs from 'node:fs'

const page=fs.readFileSync(new URL('../app/society-vendors/page.tsx',import.meta.url),'utf8')

const required=[
  'Quotation comparison',
  'Request evidence history',
  'For a purchase-order flow, select a quotation before approval',
  '/vendors/procurement/purchase-orders/list',
  '/vendors/procurement/${requestId}/quotes',
  '/vendors/procurement/${selectedRequest.id}/select-quote',
  '/vendors/procurement/${selectedRequest.id}/purchase-order',
  '/society-vendors/procurement/requests/${requestId}/history',
  'preferredVendorName',
  'selectedQuoteId',
]

for(const token of required){
  if(!page.includes(token)){
    console.error(`Missing V4.16.1 procurement operator contract token: ${token}`)
    process.exit(1)
  }
}

console.log('V4.16.1 procurement operator regression passed')
