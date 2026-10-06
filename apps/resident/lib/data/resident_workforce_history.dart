part of 'resident_data_controller.dart';

extension ResidentWorkforceHistoryOperations on ResidentDataController {
  List<Map<String, dynamic>> paymentsForWorkforce(String assignmentId) => workforcePayments
      .where((item) => item['assignmentId']?.toString() == assignmentId)
      .toList(growable: false);

  Future<Map<String, dynamic>> workforceAttendance(
    String assignmentId, {
    DateTime? from,
    DateTime? to,
  }) {
    if (!workforceAssignments.any((item) => item['id']?.toString() == assignmentId)) {
      throw StateError('Staff assignment is outside the active property context');
    }
    return repository.workforceAttendance(assignmentId, from: from, to: to);
  }

  Future<void> recordWorkforcePayment({
    required String assignmentId,
    required String kind,
    required int amountPaise,
    required DateTime paymentDate,
    String? periodMonth,
    String? note,
    required String idempotencyKey,
  }) async {
    if (!workforceAssignments.any((item) => item['id']?.toString() == assignmentId)) {
      throw StateError('Staff assignment is outside the active property context');
    }
    await repository.recordWorkforcePayment(
      assignmentId: assignmentId,
      kind: kind,
      amountPaise: amountPaise,
      paymentDate: paymentDate,
      periodMonth: periodMonth,
      note: note,
      idempotencyKey: idempotencyKey,
    );
    workforcePayments = await repository.workforcePayments();
    _notifyIfMounted();
  }
}
