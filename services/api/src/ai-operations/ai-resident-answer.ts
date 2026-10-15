/**
 * Compose a readable answer from server-filtered resident records only.
 * Never infer net outstanding invoice balance from invoice face value or
 * treat an initiated payment as proof that a financial transaction settled.
 */
type ResidentRecords = {
  invoices?: Array<Record<string,unknown>>;
  payments?: Array<Record<string,unknown>>;
  tickets?: Array<Record<string,unknown>>;
  amenityBookings?: Array<Record<string,unknown>>;
  serviceBookings?: Array<Record<string,unknown>>;
};

export function residentAnswer(question: string, facts: ResidentRecords, mayViewPayables: boolean): string {
  const invoices=facts.invoices ?? [];
  const payments=facts.payments ?? [];
  const tickets=facts.tickets ?? [];
  const amenityBookings=facts.amenityBookings ?? [];
  const serviceBookings=facts.serviceBookings ?? [];
  const tidy=(value:unknown,maximum=100)=>String(value ?? '').replace(/\s+/g,' ').trim().slice(0,maximum);
  const amount=(paise:unknown)=>{
    const numeric=Number(paise);
    return Number.isFinite(numeric) && numeric>=0
      ? '₹'+(numeric/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})
      : 'amount unavailable';
  };
  // "Maintenance payment due" is a dues request, not a request for the payer's
  // payment method or transaction history.
  if(/\b(receipts?|payment history|last payment|payments made|last paid)\b/.test(question)
     && !/\b(due|dues|invoices?)\b/.test(question)){
    if(!mayViewPayables) return 'Your current property role cannot view payment history.';
    if(!payments.length) return 'No payment transactions made by you are recorded for this property.';
    const latest=payments[0];
    return 'Your latest recorded payment transaction is '+amount(latest.amountPaise)
      +' with status '+tidy(latest.status)+'. A pending transaction does not prove settlement. Open Billing to verify its receipt.';
  }
  if(/\b(dues?|maintenance|invoices?|bills?|payment)\b/.test(question)){
    if(!mayViewPayables) return 'Your current property role is not permitted to view maintenance invoices.';
    if(!invoices.length) return 'No eligible maintenance invoices were found for the selected property.';
    const selected=invoices.find(item=>!['PAID','CANCELLED','VOID'].includes(tidy(item.status))) ?? invoices[0];
    return 'Your recorded maintenance invoice '+(tidy(selected.invoiceNumber)||'(latest)')
      +' is '+amount(selected.amountPaise)+' with status '+tidy(selected.status)
      +'. This is the invoice face amount, not a verified net outstanding balance; open Billing for the current payable amount.';
  }
  if(/\b(complaints?|tickets?|helpdesk|issues?)\b/.test(question)){
    if(!tickets.length) return 'No helpdesk requests created by you are recorded for the selected property.';
    const latest=tickets[0];
    return 'You have '+tickets.length+' recorded helpdesk request(s). Latest: '
      +tidy(latest.title)+' ('+tidy(latest.status)+'). Open Helpdesk for details.';
  }
  if(/\b(bookings?|amenit(?:y|ies)|services?)\b/.test(question)){
    return 'Your selected property has '+amenityBookings.length+' amenity booking(s) and '
      +serviceBookings.length+' service booking(s) recorded in the current query. Open Amenities or Services for status and schedules.';
  }
  return 'Your accessible selected-property records include '+invoices.length+' invoice record(s), '
    +tickets.length+' helpdesk request(s), '+amenityBookings.length+' amenity booking(s) and '
    +serviceBookings.length+' service booking(s). Ask about one topic to see details.';
}
