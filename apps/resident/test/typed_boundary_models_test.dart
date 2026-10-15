import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_resident/data/models/resident_boundary_models.dart';

void main() {
  test('resident access boundary rejects missing authoritative fields', () {
    expect(() => ResidentAccessRequest.fromJson({'id': 'a', 'status': 'PENDING'}), throwsFormatException);
  });

  test('resident boundary models preserve non-core response fields', () {
    final invoice = ResidentMaintenanceInvoice.fromJson({
      'id': 'invoice-1',
      'amountPaise': 12500,
      'status': 'ISSUED',
      'invoiceNumber': 'INV-1',
    });
    expect(invoice.toJson()['invoiceNumber'], 'INV-1');
    expect(invoice.amountPaise, 12500);
  });

  test('helpdesk typed boundary keeps title and status authoritative', () {
    final ticket = ResidentHelpdeskTicket.fromJson({'id': 't1', 'title': 'Lift issue', 'status': 'OPEN', 'priority': 'HIGH'});
    expect(ticket.title, 'Lift issue');
    expect(ticket.toJson()['priority'], 'HIGH');
  });
}
